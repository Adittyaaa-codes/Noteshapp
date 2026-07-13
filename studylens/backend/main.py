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
  GET  /api/capsules           — Study Capsules CRUD
  GET  /api/growth             — Growth data (daily hours, streak, records)
  GET  /api/ai-plan            — AI-generated study plan
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
from typing import Optional, List

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

from database import (
    init_db, upsert_session, update_llm_analysis,
    query_by_timeframe, get_all_sessions, get_stats, get_db,
    get_daily_study_hours, get_weekly_study_hours,
    get_subject_distribution, get_study_streak, get_personal_records,
    get_capsules, create_capsule, update_capsule, delete_capsule,
    get_latest_ai_plan, save_ai_plan, accept_ai_plan, reject_ai_plan,
)
from models import StudySessionPayload, QueryRequest, NotePayload, TodoPayload
from ollama_client import (
    analyze_session, synthesize_query, is_ollama_running,
    classify_page, generate_study_analysis, stream_text_action
)
from plan_ai import generate_daily_plan
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
    log.info("[StudyLens] Shutting down")


# ── App Setup ─────────────────────────────────────────────────────────────────

app = FastAPI(
    title="StudyLens API",
    description="Offline study analytics backend with SQLite + Ollama LLM",
    version="2.1.0",
    lifespan=lifespan,
)


# ── CORS middleware ───────────────────────────────────────────────────────────
@app.middleware("http")
async def cors_middleware(request: Request, call_next):
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
    """Fire-and-forget: send session to Ollama, store results, and auto-create a Study Capsule."""
    try:
        result = await analyze_session(payload_dict)
        if result:
            summary = result.get("summary", "")
            topics  = result.get("topics", [])
            update_llm_analysis(row_id, summary, topics, result)
            title = payload_dict.get("title", "?")[:60]
            score = result.get("productivity_score", "?")
            
            # Automatically create a Study Capsule for this session
            important_pts = result.get("important_points", [])
            if isinstance(important_pts, list):
                important_pts = "\n".join(f"- {p}" for p in important_pts)
            else:
                important_pts = str(important_pts)
                
            capsule_data = {
                "session_id": row_id,
                "title": payload_dict.get("title") or "Auto-generated Capsule",
                "duration_seconds": payload_dict.get("clock_time_spent_seconds", 0),
                "platform": payload_dict.get("platform", "unknown"),
                "url": payload_dict.get("url", ""),
                "ai_notes": summary,
                "key_concepts": ", ".join(topics) if topics else "",
                "revision_summary": result.get("revision_summary", ""),
                "important_points": important_pts,
                "tags": ", ".join(topics[:3]) if topics else "auto",
                "difficulty": "medium",
                "status": "new"
            }
            create_capsule(capsule_data)
            
            log.info("[Ollama] Analyzed & Capsulized: '%s' | Score: %s/10 | Topics: %s",
                     title, score, ", ".join(topics))
    except Exception as exc:
        log.warning("[Ollama] Analysis failed for row %s: %s", row_id[:8], exc)


# ── Health & Ready Endpoints ──────────────────────────────────────────────────

@app.get("/health")
async def health():
    ollama_ok = await is_ollama_running()
    return {
        "status": "ok",
        "version": "2.1.0",
        "ollama": ollama_ok,
        "model": os.getenv("OLLAMA_MODEL", "qwen2.5:0.5b"),
        "ai_setup": setup_state["phase"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/ready")
async def ready():
    if _is_ready:
        return {"status": "ready"}
    return JSONResponse({"status": "starting"}, status_code=503)


# ── AI Status & Control ───────────────────────────────────────────────────────

@app.get("/api/ai/status")
async def ai_status():
    return setup_state


@app.post("/api/ai/retry")
async def ai_retry(background_tasks: BackgroundTasks):
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
    return StreamingResponse(
        stream_text_action(body.action, body.selected_text, body.surrounding_context, body.tone),
        media_type="text/event-stream",
    )


# ── Educational Classifier ────────────────────────────────────────────────────

class FastTextClassifyRequest(BaseModel):
    text: str


@app.post("/classify/educational")
async def fasttext_classify(body: FastTextClassifyRequest):
    label, confidence = classify(body.text)
    return {"label": label, "confidence": confidence}


# ── Page Classification ───────────────────────────────────────────────────────

class ClassifyRequest(BaseModel):
    title: str
    url: str
    context: str = ""


@app.post("/api/classify")
async def classify_page_endpoint(body: ClassifyRequest):
    if setup_state.get("phase") not in ("ready",):
        return {"is_study": True, "confidence": 0.5, "reason": "AI not ready yet"}
    result = await classify_page(body.title, body.url, body.context)
    return result


# ── Session Ingestion ─────────────────────────────────────────────────────────

@app.post("/events/video-session")
async def ingest_session(request: Request, background_tasks: BackgroundTasks):
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
    return get_stats()


# ── Session Queries ───────────────────────────────────────────────────────────

@app.get("/api/sessions")
async def list_sessions(
    timeframe: str = Query("all"),
    limit: int = Query(100, ge=1, le=500),
):
    sessions = get_all_sessions(limit=limit) if timeframe == "all" else query_by_timeframe(timeframe)
    for s in sessions:
        s.pop("raw_payload", None)
    return {"sessions": sessions, "count": len(sessions)}


@app.get("/api/analysis")
async def get_analysis(
    timeframe: str = Query("this_week"),
):
    sessions = query_by_timeframe(timeframe)
    analysis = await generate_study_analysis(sessions, timeframe)
    return analysis


@app.get("/api/query")
async def query_sessions(
    timeframe: str = Query("this_week"),
    synthesis: bool = Query(False),
    q: Optional[str] = Query(None),
):
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


@app.get("/api/notes/{note_id}")
def get_note(note_id: str):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM notes WHERE id=?", (note_id,)).fetchone()
        if not row:
            return JSONResponse({"error": "Not found"}, status_code=404)
        return dict(row)


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


# ── Study Capsules CRUD ───────────────────────────────────────────────────────

class CapsulePayload(BaseModel):
    session_id: Optional[str] = None
    title: str
    date: Optional[str] = None
    duration_seconds: Optional[int] = 0
    platform: Optional[str] = None
    url: Optional[str] = None
    ai_notes: Optional[str] = None
    key_concepts: Optional[str] = None
    important_points: Optional[str] = None
    revision_summary: Optional[str] = None
    tags: Optional[str] = None
    difficulty: Optional[str] = "medium"
    status: Optional[str] = "new"
    personal_notes: Optional[str] = None
    is_pinned: Optional[bool] = False


@app.get("/api/capsules")
def list_capsules():
    return get_capsules()


@app.post("/api/capsules")
def create_capsule_endpoint(payload: CapsulePayload):
    data = payload.dict()
    cap_id = create_capsule(data)
    return {"status": "ok", "id": cap_id}


@app.put("/api/capsules/{cap_id}")
def update_capsule_endpoint(cap_id: str, payload: CapsulePayload):
    update_capsule(cap_id, payload.dict())
    return {"status": "ok"}


@app.delete("/api/capsules/{cap_id}")
def delete_capsule_endpoint(cap_id: str):
    delete_capsule(cap_id)
    return {"status": "ok"}


@app.post("/api/capsules/{cap_id}/regenerate")
async def regenerate_capsule(cap_id: str):
    """Re-run AI analysis for a capsule — stream back new notes."""
    with get_db() as conn:
        row = conn.execute("SELECT * FROM study_capsules WHERE id=?", (cap_id,)).fetchone()
    if not row:
        return JSONResponse({"error": "Not found"}, status_code=404)

    capsule = dict(row)
    # Build a fake session payload for Ollama analysis
    fake_session = {
        "title": capsule.get("title", ""),
        "url": capsule.get("url", ""),
        "platform": capsule.get("platform", ""),
        "clock_time_spent_seconds": capsule.get("duration_seconds", 0),
    }
    result = await analyze_session(fake_session)
    if result:
        update_capsule(cap_id, {
            **capsule,
            "ai_notes": result.get("summary", capsule.get("ai_notes")),
            "key_concepts": ", ".join(result.get("topics", [])),
        })
    return {"status": "ok", "updated": bool(result)}


# ── Growth Data ───────────────────────────────────────────────────────────────

@app.get("/api/growth")
def get_growth_data(days: int = Query(30, ge=7, le=365)):
    daily   = get_daily_study_hours(days)
    weekly  = get_weekly_study_hours(12)
    subjects = get_subject_distribution()
    streak  = get_study_streak()
    records = get_personal_records()

    # Generate AI insights from data
    total_hours = sum(d["hours"] for d in daily)
    today_hours = daily[-1]["hours"] if daily else 0
    yesterday_hours = daily[-2]["hours"] if len(daily) > 1 else 0

    insights = []
    if today_hours > yesterday_hours and yesterday_hours > 0:
        diff = round(today_hours - yesterday_hours, 1)
        insights.append(f"You studied {diff}h more than yesterday — great momentum!")
    elif today_hours > 0 and yesterday_hours == 0:
        insights.append("You're back to studying today — every session counts!")
    elif today_hours == 0:
        insights.append("Even a short study session today helps maintain your learning habit.")

    if streak >= 7:
        insights.append(f"🔥 Incredible! You've maintained a {streak}-day study streak!")
    elif streak >= 3:
        insights.append(f"You're on a {streak}-day streak — keep it up!")

    if subjects:
        top = subjects[0]
        insights.append(f"You've spent the most time on '{top['topic']}' ({top['minutes']} min total).")

    avg_daily = total_hours / days if days > 0 else 0
    if avg_daily >= 2:
        insights.append(f"Your average of {avg_daily:.1f}h/day over the last {days} days is excellent!")

    return {
        "daily_hours":          daily,
        "weekly_hours":         weekly,
        "subject_distribution": subjects,
        "streak":               streak,
        "personal_records":     records,
        "insights":             insights,
        "total_hours":          round(total_hours, 1),
        "avg_daily_hours":      round(avg_daily, 2),
    }


# ── AI Study Plan ─────────────────────────────────────────────────────────────

class PlanActionPayload(BaseModel):
    plan_id: str


@app.get("/api/ai-plan")
async def get_ai_plan():
    """Get the latest AI plan for today, or generate a new one from recent sessions and history."""
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    plan = get_latest_ai_plan()

    # Return existing plan (pending, accepted, or rejected) if it's from today
    if plan and plan.get("plan_date") == today_str:
        try:
            return {
                "id": plan["id"],
                "plan_date": plan["plan_date"],
                "tasks": json.loads(plan["plan_json"]),
                "status": plan["status"],
            }
        except Exception:
            pass

    # Generate a new plan from last 50 sessions, recent capsules, and todos
    sessions = get_all_sessions(limit=50)
    capsules = get_capsules()[:20]
    
    with get_db() as conn:
        todo_rows = conn.execute("SELECT * FROM todos ORDER BY created_at DESC LIMIT 100").fetchall()
        todos = [dict(r) for r in todo_rows]

    if len(sessions) < 1 and len(capsules) < 1:
        return {"tasks": [], "status": "insufficient_data", "message": "Study for 1-2 days to get an AI plan!"}

    # Ask Ollama to generate tasks based on study history and learning progress
    plan_tasks = await generate_daily_plan(sessions, capsules, todos)

    if not plan_tasks:
        return {"tasks": [], "status": "no_topics", "message": "Failed to generate AI plan."}

    plan_id = save_ai_plan(plan_tasks, today_str)
    return {
        "id": plan_id,
        "plan_date": today_str,
        "tasks": plan_tasks,
        "status": "pending",
    }


@app.post("/api/ai-plan/accept")
def accept_plan(payload: PlanActionPayload):
    accept_ai_plan(payload.plan_id)
    # Fetch plan tasks and create todos
    with get_db() as conn:
        row = conn.execute("SELECT plan_json FROM ai_plans WHERE id=?", (payload.plan_id,)).fetchone()
        if row:
            tasks = json.loads(row["plan_json"])
            for task in tasks:
                todo_id = str(uuid.uuid4())
                conn.execute(
                    "INSERT INTO todos (id, text, completed) VALUES (?, ?, 0)",
                    (todo_id, task.get("text", "Study task")),
                )
    return {"status": "ok"}


@app.post("/api/ai-plan/reject")
def reject_plan(payload: PlanActionPayload):
    reject_ai_plan(payload.plan_id)
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
