"""
StudyLens Backend - SQLite database layer.
Implements PageIndex schema for O(1) time-based filtering.
"""

import os
import sqlite3
import json
import uuid
from datetime import datetime, timezone, timedelta
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

            -- Study Capsules Table
            CREATE TABLE IF NOT EXISTS study_capsules (
                id                  TEXT PRIMARY KEY,
                session_id          TEXT,
                title               TEXT NOT NULL,
                date                TEXT NOT NULL,
                duration_seconds    INTEGER DEFAULT 0,
                platform            TEXT,
                url                 TEXT,
                ai_notes            TEXT,
                key_concepts        TEXT,
                important_points    TEXT,
                revision_summary    TEXT,
                tags                TEXT,
                difficulty          TEXT DEFAULT 'medium',
                status              TEXT DEFAULT 'new',
                personal_notes      TEXT,
                is_pinned           BOOLEAN DEFAULT 0,
                created_at          TEXT DEFAULT (datetime('now')),
                updated_at          TEXT DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_capsules_date
                ON study_capsules (date);

            -- AI Study Plans Table
            CREATE TABLE IF NOT EXISTS ai_plans (
                id          TEXT PRIMARY KEY,
                plan_date   TEXT NOT NULL,
                plan_json   TEXT NOT NULL,
                status      TEXT DEFAULT 'pending',
                created_at  TEXT DEFAULT (datetime('now'))
            );

            -- Personal Records Table
            CREATE TABLE IF NOT EXISTS personal_records (
                id          TEXT PRIMARY KEY,
                record_type TEXT NOT NULL UNIQUE,
                value       REAL NOT NULL,
                value_label TEXT,
                achieved_at TEXT NOT NULL,
                updated_at  TEXT DEFAULT (datetime('now'))
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

        # This week study hours
        week_time = conn.execute(
            "SELECT COALESCE(SUM(clock_time_spent_seconds),0) FROM study_sessions WHERE year=? AND week=?",
            (iso.year, iso.week)
        ).fetchone()[0]

        # This month study hours
        month_time = conn.execute(
            "SELECT COALESCE(SUM(clock_time_spent_seconds),0) FROM study_sessions WHERE year=? AND month=?",
            (now.year, now.month)
        ).fetchone()[0]

        avg_focus  = conn.execute("""
            SELECT AVG(CAST(json_extract(llm_analysis, '$.productivity_score') AS REAL))
            FROM study_sessions WHERE llm_analysis IS NOT NULL
        """).fetchone()[0]

        notes_cnt  = conn.execute("SELECT COUNT(*) FROM notes").fetchone()[0]
        todos_done = conn.execute("SELECT COUNT(*) FROM todos WHERE completed=1").fetchone()[0]
        todos_pend = conn.execute("SELECT COUNT(*) FROM todos WHERE completed=0").fetchone()[0]
        capsules   = conn.execute("SELECT COUNT(*) FROM study_capsules").fetchone()[0]

    return {
        "total_sessions":      total,
        "sessions_today":      today_cnt,
        "this_week":           week_cnt,
        "this_week_hours":     round(week_time / 3600, 2),
        "this_month_hours":    round(month_time / 3600, 2),
        "video_sessions":      video_cnt,
        "reading_sessions":    read_cnt,
        "analyzed_sessions":   analyzed,
        "total_time_seconds":  total_time,
        "total_study_seconds": total_time,
        "avg_focus_score":     round(avg_focus, 1) if avg_focus else None,
        "notes_count":         notes_cnt,
        "todos_completed":     todos_done,
        "todos_pending":       todos_pend,
        "capsules_count":      capsules,
    }



# ── Growth Data ───────────────────────────────────────────────────────────────

def get_daily_study_hours(days: int = 30) -> List[Dict]:
    """Returns per-day study time for the last N days."""
    now = datetime.now(timezone.utc)
    result = []
    with get_db() as conn:
        for i in range(days - 1, -1, -1):
            d = now - timedelta(days=i)
            date_str = d.strftime("%Y-%m-%d")
            row = conn.execute("""
                SELECT COALESCE(SUM(clock_time_spent_seconds), 0) as total
                FROM study_sessions WHERE day_date = ?
            """, (date_str,)).fetchone()
            result.append({
                "date":   date_str,
                "label":  d.strftime("%b %d"),
                "hours":  round((row["total"] or 0) / 3600, 2),
                "minutes": round((row["total"] or 0) / 60, 1),
            })
    return result


def get_weekly_study_hours(weeks: int = 12) -> List[Dict]:
    """Returns per-week study time for the last N weeks."""
    now = datetime.now(timezone.utc)
    result = []
    with get_db() as conn:
        for i in range(weeks - 1, -1, -1):
            target = now - timedelta(weeks=i)
            iso = target.isocalendar()
            row = conn.execute("""
                SELECT COALESCE(SUM(clock_time_spent_seconds), 0) as total
                FROM study_sessions WHERE year = ? AND week = ?
            """, (iso.year, iso.week)).fetchone()
            result.append({
                "week":   f"W{iso.week}",
                "year":   iso.year,
                "hours":  round((row["total"] or 0) / 3600, 2),
            })
    return result


def get_subject_distribution() -> List[Dict]:
    """Returns time per topic/subject derived from session topics."""
    with get_db() as conn:
        rows = conn.execute("""
            SELECT topics, clock_time_spent_seconds
            FROM study_sessions
            WHERE topics IS NOT NULL AND topics != '' AND clock_time_spent_seconds > 0
        """).fetchall()

    topic_time: Dict[str, int] = {}
    for row in rows:
        topics_str = row["topics"] or ""
        secs = row["clock_time_spent_seconds"] or 0
        topics_list = [t.strip() for t in topics_str.split(",") if t.strip()]
        if topics_list:
            per_topic = secs // len(topics_list)
            for t in topics_list:
                t_key = t.title()
                topic_time[t_key] = topic_time.get(t_key, 0) + per_topic

    sorted_topics = sorted(topic_time.items(), key=lambda x: x[1], reverse=True)
    return [
        {"topic": t, "minutes": round(s / 60, 1), "seconds": s}
        for t, s in sorted_topics[:10]
    ]


def get_study_streak() -> int:
    """Returns current consecutive study day streak."""
    now = datetime.now(timezone.utc)
    streak = 0
    with get_db() as conn:
        for i in range(0, 365):
            d = now - timedelta(days=i)
            date_str = d.strftime("%Y-%m-%d")
            row = conn.execute("""
                SELECT COUNT(*) as cnt FROM study_sessions WHERE day_date = ?
            """, (date_str,)).fetchone()
            if row["cnt"] > 0:
                streak += 1
            else:
                break
    return streak


def get_personal_records() -> Dict[str, Any]:
    """Returns personal best records."""
    with get_db() as conn:
        # Best single day
        best_day = conn.execute("""
            SELECT day_date, SUM(clock_time_spent_seconds) as total
            FROM study_sessions
            GROUP BY day_date ORDER BY total DESC LIMIT 1
        """).fetchone()

        # Longest single session
        longest = conn.execute("""
            SELECT title, clock_time_spent_seconds, day_date
            FROM study_sessions
            WHERE clock_time_spent_seconds IS NOT NULL
            ORDER BY clock_time_spent_seconds DESC LIMIT 1
        """).fetchone()

        # Best week
        best_week = conn.execute("""
            SELECT year, week, SUM(clock_time_spent_seconds) as total
            FROM study_sessions
            GROUP BY year, week ORDER BY total DESC LIMIT 1
        """).fetchone()

        # Total sessions
        total = conn.execute("SELECT COUNT(*) as c FROM study_sessions").fetchone()

    records = {}
    if best_day:
        records["best_day"] = {
            "date": best_day["day_date"],
            "hours": round((best_day["total"] or 0) / 3600, 2),
            "label": f"{round((best_day['total'] or 0) / 3600, 1)}h"
        }
    if longest:
        records["longest_session"] = {
            "title": longest["title"] or "Untitled",
            "date": longest["day_date"],
            "minutes": round((longest["clock_time_spent_seconds"] or 0) / 60, 1),
            "label": f"{round((longest['clock_time_spent_seconds'] or 0) / 60, 0):.0f} min"
        }
    if best_week:
        records["best_week"] = {
            "week": f"W{best_week['week']} {best_week['year']}",
            "hours": round((best_week["total"] or 0) / 3600, 2),
            "label": f"{round((best_week['total'] or 0) / 3600, 1)}h"
        }
    records["total_sessions"] = total["c"] if total else 0
    return records


# ── Capsules CRUD ─────────────────────────────────────────────────────────────

def get_capsules() -> List[Dict]:
    with get_db() as conn:
        rows = conn.execute("""
            SELECT * FROM study_capsules ORDER BY is_pinned DESC, created_at DESC
        """).fetchall()
    return [dict(r) for r in rows]


def create_capsule(data: Dict) -> str:
    cap_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    with get_db() as conn:
        conn.execute("""
            INSERT INTO study_capsules
            (id, session_id, title, date, duration_seconds, platform, url,
             ai_notes, key_concepts, important_points, revision_summary,
             tags, difficulty, status, personal_notes, is_pinned, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            cap_id,
            data.get("session_id"),
            data.get("title", "Untitled Capsule"),
            data.get("date", now[:10]),
            data.get("duration_seconds", 0),
            data.get("platform"),
            data.get("url"),
            data.get("ai_notes"),
            data.get("key_concepts"),
            data.get("important_points"),
            data.get("revision_summary"),
            data.get("tags"),
            data.get("difficulty", "medium"),
            data.get("status", "new"),
            data.get("personal_notes"),
            1 if data.get("is_pinned") else 0,
            now, now,
        ))
    return cap_id


def update_capsule(cap_id: str, data: Dict):
    now = datetime.now(timezone.utc).isoformat()
    with get_db() as conn:
        conn.execute("""
            UPDATE study_capsules SET
                title=?, ai_notes=?, key_concepts=?, important_points=?,
                revision_summary=?, tags=?, difficulty=?, status=?,
                personal_notes=?, is_pinned=?, updated_at=?
            WHERE id=?
        """, (
            data.get("title"),
            data.get("ai_notes"),
            data.get("key_concepts"),
            data.get("important_points"),
            data.get("revision_summary"),
            data.get("tags"),
            data.get("difficulty", "medium"),
            data.get("status", "new"),
            data.get("personal_notes"),
            1 if data.get("is_pinned") else 0,
            now,
            cap_id,
        ))


def delete_capsule(cap_id: str):
    with get_db() as conn:
        conn.execute("DELETE FROM study_capsules WHERE id=?", (cap_id,))


# ── AI Plans CRUD ─────────────────────────────────────────────────────────────

def get_latest_ai_plan() -> Optional[Dict]:
    with get_db() as conn:
        row = conn.execute("""
            SELECT * FROM ai_plans ORDER BY created_at DESC LIMIT 1
        """).fetchone()
    return dict(row) if row else None


def save_ai_plan(plan_data: List[Dict], plan_date: Optional[str] = None) -> str:
    plan_id = str(uuid.uuid4())
    if not plan_date:
        plan_date = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")
    now = datetime.now(timezone.utc).isoformat()
    with get_db() as conn:
        conn.execute("""
            INSERT INTO ai_plans (id, plan_date, plan_json, status, created_at)
            VALUES (?, ?, ?, 'pending', ?)
        """, (plan_id, plan_date, json.dumps(plan_data), now))
    return plan_id


def accept_ai_plan(plan_id: str):
    with get_db() as conn:
        conn.execute("UPDATE ai_plans SET status='accepted' WHERE id=?", (plan_id,))


def reject_ai_plan(plan_id: str):
    with get_db() as conn:
        conn.execute("UPDATE ai_plans SET status='rejected' WHERE id=?", (plan_id,))


# ── Helpers ───────────────────────────────────────────────────────────────────

def _safe_int(v) -> Optional[int]:
    try:
        return int(v) if v is not None else None
    except (ValueError, TypeError):
        return None
