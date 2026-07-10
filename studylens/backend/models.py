"""
StudyLens Backend - Pydantic models for incoming extension payloads.
Handles both 'video' (YouTube) and 'reading' (website) session types.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


class StudySessionPayload(BaseModel):
    """
    Incoming payload from the StudyLens Chrome Extension.
    Extension sends this via POST /events/video-session after a session ends.
    """
    # Meta
    schema_version: Optional[str] = "2.0"
    flush_reason: Optional[str] = None
    session_type: Optional[str] = "reading"        # 'video' | 'reading'
    session_id: Optional[str] = None
    url: Optional[str] = None
    title: Optional[str] = None
    platform: Optional[str] = None                 # 'youtube', 'website', domain name
    domain: Optional[str] = None

    # ── Video-specific ────────────────────────────────────────
    video_duration_seconds: Optional[float] = None
    clock_time_spent_seconds: Optional[float] = 0
    video_time_consumed_seconds: Optional[float] = None
    completion_percentage: Optional[int] = None
    transcript: Optional[str] = None

    # ── Reading-specific ──────────────────────────────────────
    max_scroll_percent: Optional[int] = None
    avg_reading_wpm: Optional[int] = None
    word_count: Optional[int] = None
    headings: Optional[List[str]] = Field(default_factory=list)
    sections_focused: Optional[List[Dict[str, Any]]] = Field(default_factory=list)

    # ── Timestamps ────────────────────────────────────────────
    session_start_ts: Optional[str] = None
    session_end_ts: Optional[str] = None

    # ── Raw Events ────────────────────────────────────────────
    events: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    meta: Optional[Dict[str, Any]] = None


class QueryRequest(BaseModel):
    """Body for POST /api/chat (user asks a question about their study history)."""
    question: str
    timeframe: Optional[str] = "this_week"         # today | this_week | this_month | all


# ── Notes & Todos ─────────────────────────────────────────────────────────

class NotePayload(BaseModel):
    title: str
    content: str

class TodoPayload(BaseModel):
    text: str
    completed: bool = False

