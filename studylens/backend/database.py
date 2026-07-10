"""
StudyLens Backend - SQLite database layer.
Implements PageIndex schema for O(1) time-based filtering.
"""

import os
import sqlite3
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from contextlib import contextmanager
from typing import Optional, List, Dict, Any


# Database path:
#   - Dev mode:    studylens/backend/studylens.db
#   - Frozen exe:  %APPDATA%/StudyLens/studylens.db
import sys
_data_dir_env = os.environ.get("STUDYLENS_DATA_DIR")
if _data_dir_env:
    DB_PATH = Path(_data_dir_env) / "studylens.db"
elif getattr(sys, 'frozen', False):
    app_data = os.environ.get("APPDATA", os.path.expanduser("~"))
    db_dir = Path(app_data) / "StudyLens"
    db_dir.mkdir(parents=True, exist_ok=True)
    DB_PATH = db_dir / "studylens.db"
else:
    DB_PATH = Path(__file__).parent / "studylens.db"


# ── Connection factory ────────────────────────────────────────────────────────

def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # WAL mode: allows concurrent reads while writing
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

@contextmanager
def get_db():
    conn = _get_conn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

# ── Schema Initialization ─────────────────────────────────────────────────────

def init_db():
    """Create tables and indexes if they do not exist. Called once on startup."""
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS study_sessions (
                id                          TEXT PRIMARY KEY,
                session_id                  TEXT UNIQUE,
                session_type                TEXT NOT NULL,
                url                         TEXT,
                title                       TEXT,
                platform                    TEXT,
                domain                      TEXT,

                -- PageIndex columns (fast time-tree filtering without full table scan)
                year                        INTEGER NOT NULL,
                month                       INTEGER NOT NULL,
                week                        INTEGER NOT NULL,
                day_date                    TEXT    NOT NULL,

                session_start_ts            TEXT    NOT NULL,
                session_end_ts              TEXT    NOT NULL,

                -- Metrics
                clock_time_spent_seconds    INTEGER,
                video_duration_seconds      INTEGER,
                video_time_consumed_seconds INTEGER,
                completion_percentage       INTEGER,
                max_scroll_percent          INTEGER,
                avg_reading_wpm             INTEGER,
                word_count                  INTEGER,

                -- Raw data & LLM enrichment
                raw_payload                 TEXT    NOT NULL,
                summary                     TEXT,
                topics                      TEXT,
                llm_analysis                TEXT,
                created_at                  TEXT    DEFAULT (datetime('now'))
            );

            -- PageIndex composite index for O(1) time filtering
            CREATE INDEX IF NOT EXISTS idx_time_pageindex
                ON study_sessions (year, month, week, day_date);

            -- Full-text search friendly index on title
            CREATE INDEX IF NOT EXISTS idx_title
                ON study_sessions (title);

            -- Notes Table
            CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY,
                title TEXT,
                content TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            -- Todos Table
            CREATE TABLE IF NOT EXISTS todos (
                id TEXT PRIMARY KEY,
                text TEXT,
                completed BOOLEAN DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now'))
            );
        """)
    print(f"[DB] Initialized: {DB_PATH}")

# ── Parse PageIndex fields from ISO timestamp ─────────────────────────────────

def parse_page_index(ts_str: Optional[str]) -> Dict[str, Any]:
    """
    Given an ISO-8601 timestamp string, extract PageIndex fields:
    year, month, iso_week, day_date (YYYY-MM-DD).
    Falls back to UTC now if parsing fails.
    """
    try:
        if ts_str:
            # Handle trailing Z or offset
            ts_str_clean = ts_str.replace("Z", "+00:00")
            dt = datetime.fromisoformat(ts_str_clean)
        else:
            dt = datetime.now(timezone.utc)
    except (ValueError, TypeError):
        dt = datetime.now(timezone.utc)

    iso_cal = dt.isocalendar()
    return {
        "year":     dt.year,
        "month":    dt.month,
        "week":     iso_cal.week,           # ISO week number (1-53)
        "day_date": dt.strftime("%Y-%m-%d"),
    }

# ── CRUD ──────────────────────────────────────────────────────────────────────

def upsert_session(payload: Dict[str, Any]) -> str:
    """
    Insert or replace a study session record.
    Returns the row's UUID `id`.
    """
    row_id = str(uuid.uuid4())
    session_id = payload.get("session_id") or row_id

    page_index = parse_page_index(payload.get("session_start_ts"))
    now_iso = datetime.now(timezone.utc).isoformat()

    with get_db() as conn:
        conn.execute("""
            INSERT OR REPLACE INTO study_sessions (
                id, session_id, session_type, url, title, platform, domain,
                year, month, week, day_date,
                session_start_ts, session_end_ts,
                clock_time_spent_seconds, video_duration_seconds,
                video_time_consumed_seconds, completion_percentage,
                max_scroll_percent, avg_reading_wpm, word_count,
                raw_payload, summary, topics, llm_analysis, created_at
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?,
                ?, ?, ?, ?, ?, ?, ?,
                ?, NULL, NULL, NULL, ?
            )
        """, (
            row_id, session_id,
            payload.get("session_type", "reading"),
            payload.get("url"), payload.get("title"),
            payload.get("platform"), payload.get("domain"),

            page_index["year"], page_index["month"],
            page_index["week"], page_index["day_date"],

            payload.get("session_start_ts") or now_iso,
            payload.get("session_end_ts")   or now_iso,

            _safe_int(payload.get("clock_time_spent_seconds")),
            _safe_int(payload.get("video_duration_seconds")),
            _safe_int(payload.get("video_time_consumed_seconds")),
            _safe_int(payload.get("completion_percentage")),
            _safe_int(payload.get("max_scroll_percent")),
            _safe_int(payload.get("avg_reading_wpm")),
            _safe_int(payload.get("word_count")),

            json.dumps(payload, ensure_ascii=False),
            now_iso,
        ))
    return row_id


def update_llm_analysis(row_id: str, summary: str, topics: List[str], full_analysis: Dict):
    """Called by the Ollama background task to enrich the row after analysis."""
    with get_db() as conn:
        conn.execute("""
            UPDATE study_sessions
            SET summary = ?, topics = ?, llm_analysis = ?
            WHERE id = ?
        """, (
            summary,
            ", ".join(topics) if topics else "",
            json.dumps(full_analysis, ensure_ascii=False),
            row_id,
        ))


# ── PageIndex Query Engine ────────────────────────────────────────────────────

def query_by_timeframe(timeframe: str) -> List[Dict]:
    """
    Fetch sessions matching a natural time range.
    timeframe: 'today' | 'this_week' | 'this_month' | 'all'
    Returns list of dicts (sqlite3.Row converted).
    """
    now = datetime.now(timezone.utc)
    iso = now.isocalendar()

    with get_db() as conn:
        if timeframe == "today":
            rows = conn.execute("""
                SELECT * FROM study_sessions
                WHERE day_date = ?
                ORDER BY session_start_ts DESC
            """, (now.strftime("%Y-%m-%d"),)).fetchall()

        elif timeframe == "this_week":
            rows = conn.execute("""
                SELECT * FROM study_sessions
                WHERE year = ? AND week = ?
                ORDER BY day_date DESC, session_start_ts DESC
            """, (iso.year, iso.week)).fetchall()

        elif timeframe == "this_month":
            rows = conn.execute("""
                SELECT * FROM study_sessions
                WHERE year = ? AND month = ?
                ORDER BY day_date DESC, session_start_ts DESC
            """, (now.year, now.month)).fetchall()

        else:  # 'all'
            rows = conn.execute("""
                SELECT * FROM study_sessions
                ORDER BY session_start_ts DESC
                LIMIT 200
            """).fetchall()

    return [dict(r) for r in rows]


def get_all_sessions(limit: int = 100) -> List[Dict]:
    with get_db() as conn:
        rows = conn.execute("""
            SELECT * FROM study_sessions
            ORDER BY session_start_ts DESC
            LIMIT ?
        """, (limit,)).fetchall()
    return [dict(r) for r in rows]


def get_stats() -> Dict[str, Any]:
    """Dashboard stat counters."""
    now = datetime.now(timezone.utc)
    iso = now.isocalendar()
    today = now.strftime("%Y-%m-%d")

    with get_db() as conn:
        total      = conn.execute("SELECT COUNT(*) FROM study_sessions").fetchone()[0]
        today_cnt  = conn.execute("SELECT COUNT(*) FROM study_sessions WHERE day_date=?", (today,)).fetchone()[0]
        week_cnt   = conn.execute("SELECT COUNT(*) FROM study_sessions WHERE year=? AND week=?", (iso.year, iso.week)).fetchone()[0]
        video_cnt  = conn.execute("SELECT COUNT(*) FROM study_sessions WHERE session_type='video'").fetchone()[0]
        read_cnt   = conn.execute("SELECT COUNT(*) FROM study_sessions WHERE session_type='reading'").fetchone()[0]
        analyzed   = conn.execute("SELECT COUNT(*) FROM study_sessions WHERE summary IS NOT NULL").fetchone()[0]

        total_time = conn.execute(
            "SELECT COALESCE(SUM(clock_time_spent_seconds),0) FROM study_sessions"
        ).fetchone()[0]

    return {
        "total_sessions": total,
        "today": today_cnt,
        "this_week": week_cnt,
        "video_sessions": video_cnt,
        "reading_sessions": read_cnt,
        "analyzed_sessions": analyzed,
        "total_study_seconds": total_time,
    }

# ── Helpers ───────────────────────────────────────────────────────────────────

def _safe_int(v) -> Optional[int]:
    try:
        return int(v) if v is not None else None
    except (ValueError, TypeError):
        return None
