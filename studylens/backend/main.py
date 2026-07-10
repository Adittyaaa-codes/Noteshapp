"""
StudyLens Backend — FastAPI application.

Endpoints:
  POST /events/video-session   — Ingest session from Chrome Extension
  GET  /api/query              — Time-filtered session retrieval
  GET  /api/analysis           — AI-generated study analysis
  POST /api/ai/text-action     — Streaming inline AI text editing
  GET  /api/stats              — Dashboard stat counters
  GET  /api/sessions           — Raw session list (JSON)
  GET  /api/notes              — Notes CRUD
  GET  /api/todos              — Todos CRUD
  GET  /health                 — Health check (used by extension popup + Tauri)
  GET  /ready                  — Ready check (used by Tauri startup polling)
  POST /classify/educational   — Fast ML-based educational content classification
"""

import sys
import os
import json
import logging
import asyncio
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

# ── Logging setup (before any other imports that might log) ──────────────────
LOG_LEVEL = os.getenv("STUDYLENS_LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stdout,
)
log = logging.getLogger("studylens")

# ── Windows encoding fix ──────────────────────────────────────────────────────
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from fastapi import FastAPI, Request, BackgroundTasks, Query
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
import uvicorn

from database import init_db, upsert_session, update_llm_analysis, \
                     query_by_timeframe, get_all_sessions, get_stats, get_db
from models import StudySessionPayload, QueryRequest, NotePayload, TodoPayload
from ollama_client import (
    analyze_session, synthesize_query, is_ollama_running,
    classify_page, generate_study_analysis, stream_text_action
)
from setup_ai import start_setup_in_background, retry_setup, setup_state
from classifier import load_model, classify


# ── Startup readiness flag ────────────────────────────────────────────────────
_is_ready = False


# ── Startup / Shutdown (lifespan) ────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _is_ready

    # ── Database ──────────────────────────────────────────────
    try:
        init_db()
        log.info("[DB] Initialized successfully")
    except Exception as exc:
        log.error("[DB] Failed to initialize: %s", exc)
        # Do not crash — DB may still work on next request

    # ── ML Classifier ─────────────────────────────────────────
    try:
        load_model()
    except Exception as exc:
        log.error("[Classifier] Failed to load model: %s", exc)

    model = os.getenv("OLLAMA_MODEL", "qwen2.5:0.5b")
    log.info("[StudyLens] Server started on port 7842")
    log.info("[StudyLens] AI model target: %s", model)

    # ── Mark ready ────────────────────────────────────────────
    _is_ready = True

    # ── Kick off Ollama setup in background ───────────────────
    start_setup_in_background()

    yield
    # Shutdown (SQLite closes automatically via context managers)
    log.info("[StudyLens] Shutting down")


# ── App Setup ─────────────────────────────────────────────────────────────────

app = FastAPI(
    title="StudyLens API",
    description="Offline study analytics backend with SQLite + Ollama LLM",
    version="2.0.0",
    lifespan=lifespan,
)


# ── CORS middleware (single, handles Chrome Extension MV3 null origins) ───────
@app.middleware("http")
async def cors_middleware(request: Request, call_next):
    """
    Single CORS middleware that handles:
      - Regular browser origins
      - Chrome Extension 'null' origins (from service workers)
      - OPTIONS preflight requests
    """
    if request.method == "OPTIONS":
        return JSONResponse(
            content={},
            status_code=200,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Max-Age": "86400",
            },
        )
    response = await call_next(request)
    response.headers["Access-Control-Allow-Origin"]  = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
    response.headers["Access-Control-Allow-Headers"] = "*"
    return response


# ── Background Task: Ollama Enrichment ───────────────────────────────────────

async def _analyze_and_store(row_id: str, payload_dict: dict):
    """Fire-and-forget: send session to Ollama and store results."""
    try:
        result = await analyze_session(payload_dict)
        if result:
            summary = result.get("summary", "")
            topics  = result.get("topics", [])
            update_llm_analysis(row_id, summary, topics, result)
            title = payload_dict.get("title", "?")[:60]
            score = result.get("productivity_score", "?")
            log.info("[Ollama] Analyzed: '%s' | Score: %s/10 | Topics: %s",
                     title, score, ", ".join(topics))
    except Exception as exc:
        log.warning("[Ollama] Analysis failed for row %s: %s", row_id[:8], exc)


# ── Health & Ready Endpoints ──────────────────────────────────────────────────

@app.get("/health")
async def health():
    """Lightweight health check. Always returns 200 once the server is up."""
    ollama_ok = await is_ollama_running()
    return {
        "status": "ok",
        "version": "2.0.0",
        "ollama": ollama_ok,
        "model": os.getenv("OLLAMA_MODEL", "qwen2.5:0.5b"),
        "ai_setup": setup_state["phase"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/ready")
async def ready():
    """
    Readiness check — only returns 200 when DB and classifier are initialized.
    Tauri polls this before showing the main window.
    """
    if _is_ready:
        return {"status": "ready"}
    return JSONResponse({"status": "starting"}, status_code=503)


# ── AI Status & Control ───────────────────────────────────────────────────────

@app.get("/api/ai/status")
async def ai_status():
    """Real-time AI setup progress for the dashboard."""
    return setup_state


@app.post("/api/ai/retry")
async def ai_retry(background_tasks: BackgroundTasks):
    """Retry a failed AI setup."""
    background_tasks.add_task(retry_setup)
    return {"status": "retrying"}


# ── AI Text Actions (Streaming SSE) ──────────────────────────────────────────

class AITextActionRequest(BaseModel):
    action: str
    selected_text: str = ""
    surrounding_context: Optional[str] = None
    tone: Optional[str] = None


@app.post("/api/ai/text-action")
async def ai_text_action(body: AITextActionRequest):
    """Streaming endpoint for inline AI text editing."""
    return StreamingResponse(
        stream_text_action(body.action, body.selected_text, body.surrounding_context, body.tone),
        media_type="text/event-stream",
    )


# ── Educational Classifier (fast, local ML) ──────────────────────────────────

class FastTextClassifyRequest(BaseModel):
    text: str


@app.post("/classify/educational")
async def fasttext_classify(body: FastTextClassifyRequest):
    """
    Local scikit-learn binary classification.
    Used by the extension to decide whether to track content.
    """
    label, confidence = classify(body.text)
    return {"label": label, "confidence": confidence}


# ── Page Classification (Ollama-based, richer context) ───────────────────────

class ClassifyRequest(BaseModel):
    title: str
    url: str
    context: str = ""


@app.post("/api/classify")
async def classify_page_endpoint(body: ClassifyRequest):
    """
    Ollama-based classification — called by extension before starting a session.
    Falls back to tracking=True if AI isn't ready yet.
    """
    if setup_state.get("phase") not in ("ready",):
        return {"is_study": True, "confidence": 0.5, "reason": "AI not ready yet"}

    result = await classify_page(body.title, body.url, body.context)
    log.debug("[Classify] %s (%.0f%%) — %s", result['is_study'], result['confidence'] * 100, body.title[:50])
    return result


# ── Session Ingestion (from Chrome Extension) ─────────────────────────────────

@app.post("/events/video-session")
async def ingest_session(request: Request, background_tasks: BackgroundTasks):
    """
    Primary ingestion endpoint — called by the StudyLens Chrome Extension.
    Accepts raw JSON body to tolerate any extra fields from the extension.
    """
    try:
        body = await request.body()
        if not body:
            return JSONResponse({"status": "empty", "received": False}, status_code=200)
        payload_dict = json.loads(body)
    except Exception as exc:
        log.warning("[Ingest] Parse error: %s", exc)
        return JSONResponse({"status": "parse_error", "received": False}, status_code=200)

    if not isinstance(payload_dict, dict):
        return JSONResponse({"status": "invalid", "received": False}, status_code=200)

    try:
        row_id = upsert_session(payload_dict)
    except Exception as exc:
        log.error("[Ingest] DB error: %s", exc)
        return JSONResponse({"status": "db_error", "received": False}, status_code=200)

    stype  = payload_dict.get("session_type", "?")
    title  = (payload_dict.get("title") or "Untitled")[:80]
    events = len(payload_dict.get("events") or [])
    log.info("[Ingest] %-8s | %s | %d events → id=%s", stype.upper(), title, events, row_id[:8])

    background_tasks.add_task(_analyze_and_store, row_id, payload_dict)

    return JSONResponse({"status": "success", "received": True, "id": row_id})


# ── Dashboard Stats ───────────────────────────────────────────────────────────

@app.get("/api/stats")
async def get_dashboard_stats():
    """Counters for the dashboard stat bar."""
    return get_stats()


# ── Session Queries ───────────────────────────────────────────────────────────

@app.get("/api/sessions")
async def list_sessions(
    timeframe: str = Query("all", description="today | this_week | this_month | all"),
    limit: int = Query(100, ge=1, le=500),
):
    """Return sessions as JSON, optionally filtered by timeframe."""
    sessions = get_all_sessions(limit=limit) if timeframe == "all" else query_by_timeframe(timeframe)
    for s in sessions:
        s.pop("raw_payload", None)
    return {"sessions": sessions, "count": len(sessions)}


@app.get("/api/analysis")
async def get_analysis(
    timeframe: str = Query("this_week", description="today | this_week | this_month | all"),
):
    """AI-generated study analysis for the given timeframe."""
    sessions = query_by_timeframe(timeframe)
    analysis = await generate_study_analysis(sessions, timeframe)
    return analysis


@app.get("/api/query")
async def query_sessions(
    timeframe: str = Query("this_week"),
    synthesis: bool = Query(False),
    q: Optional[str] = Query(None),
):
    """Session retrieval with optional AI synthesis."""
    sessions = query_by_timeframe(timeframe)

    result = {
        "timeframe": timeframe,
        "session_count": len(sessions),
        "sessions": [
            {
                "id":                        s.get("id"),
                "title":                     s.get("title"),
                "session_type":              s.get("session_type"),
                "platform":                  s.get("platform"),
                "day_date":                  s.get("day_date"),
                "clock_time_spent_seconds":  s.get("clock_time_spent_seconds"),
                "summary":                   s.get("summary"),
                "topics":                    s.get("topics"),
            }
            for s in sessions
        ],
        "synthesis": None,
    }

    if synthesis and sessions:
        question = q or f"What did I study {timeframe.replace('_', ' ')}?"
        result["synthesis"] = await synthesize_query(sessions, question, timeframe)

    return result


# ── Notes CRUD ────────────────────────────────────────────────────────────────

@app.get("/api/notes")
def get_notes():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM notes ORDER BY updated_at DESC").fetchall()
        return [dict(r) for r in rows]


@app.post("/api/notes")
def create_note(payload: NotePayload):
    note_id = str(uuid.uuid4())
    with get_db() as conn:
        conn.execute(
            "INSERT INTO notes (id, title, content) VALUES (?, ?, ?)",
            (note_id, payload.title, payload.content),
        )
    return {"status": "ok", "id": note_id}


@app.put("/api/notes/{note_id}")
def update_note(note_id: str, payload: NotePayload):
    with get_db() as conn:
        conn.execute(
            "UPDATE notes SET title=?, content=?, updated_at=datetime('now') WHERE id=?",
            (payload.title, payload.content, note_id),
        )
    return {"status": "ok"}


@app.delete("/api/notes/{note_id}")
def delete_note(note_id: str):
    with get_db() as conn:
        conn.execute("DELETE FROM notes WHERE id=?", (note_id,))
    return {"status": "ok"}


# ── Todos CRUD ────────────────────────────────────────────────────────────────

@app.get("/api/todos")
def get_todos():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM todos ORDER BY created_at DESC").fetchall()
        return [dict(r) for r in rows]


@app.post("/api/todos")
def create_todo(payload: TodoPayload):
    todo_id = str(uuid.uuid4())
    with get_db() as conn:
        conn.execute(
            "INSERT INTO todos (id, text, completed) VALUES (?, ?, ?)",
            (todo_id, payload.text, payload.completed),
        )
    return {"status": "ok", "id": todo_id}


@app.put("/api/todos/{todo_id}")
def update_todo(todo_id: str, payload: TodoPayload):
    with get_db() as conn:
        conn.execute(
            "UPDATE todos SET text=?, completed=? WHERE id=?",
            (payload.text, payload.completed, todo_id),
        )
    return {"status": "ok"}


@app.delete("/api/todos/{todo_id}")
def delete_todo(todo_id: str):
    with get_db() as conn:
        conn.execute("DELETE FROM todos WHERE id=?", (todo_id,))
    return {"status": "ok"}


# ── Static React Frontend (dev fallback only) ─────────────────────────────────

from fastapi.staticfiles import StaticFiles

if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
    frontend_dist = os.path.join(sys._MEIPASS, "frontend", "dist")
else:
    frontend_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))

if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="static")
    log.info("[StudyLens] Serving frontend from %s", frontend_dist)
else:
    @app.get("/")
    def no_frontend():
        return {"msg": "Frontend not built. Run: npm run build in the frontend directory."}


# ── Direct run (dev only) ─────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=7842, log_level="info", reload=False)
