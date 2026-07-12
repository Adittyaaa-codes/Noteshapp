import json
import httpx
from typing import List, Dict
from ollama_client import OLLAMA_MODEL, OLLAMA_BASE, TIMEOUT

# ── AI Plan Generator ──────────────────────────────────────────────────────────

async def generate_daily_plan(sessions: List[Dict], capsules: List[Dict]) -> List[Dict]:
    """
    Generate next day's tasks based on what they studied today/recently.
    """
    if not sessions and not capsules:
        return []

    # Build context string
    context_lines = []
    
    # 1. Recent Capsules
    if capsules:
        context_lines.append("Recently created Study Capsules:")
        for c in capsules[:5]:
            context_lines.append(f" - {c.get('title', 'Untitled')} ({c.get('difficulty', 'medium')} difficulty). Status: {c.get('status', 'new')}. Topics: {c.get('key_concepts', '')}")
    
    # 2. Recent Sessions
    if sessions:
        context_lines.append("\nRecent Study Sessions:")
        for s in sessions[:5]:
            duration = s.get('clock_time_spent_seconds', 0) // 60
            context_lines.append(f" - {s.get('title', 'Untitled')} ({duration} min). Topics: {s.get('topics', '')}")

    context = "\n".join(context_lines)

    system_prompt = (
        "You are StudyLens, a personal AI study planner. "
        "Based on the student's recent study capsules and sessions, generate 3 specific study tasks for TOMORROW. "
        "Make them highly specific to the content they studied (e.g. 'Revise [Subtopic] from [Capsule]'). "
        "Respond ONLY with valid JSON matching exactly this schema:\n"
        '{"tasks": [\n'
        '  {"text": "<Specific task title>", "reason": "<Why they should do this based on what they just studied>", "priority": "high" | "medium" | "low"}\n'
        ']}\n'
        "Do not add any extra text or explanation outside the JSON."
    )

    payload = {
        "model": OLLAMA_MODEL,
        "format": "json",
        "stream": False,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Here is what I studied recently:\n\n{context}\n\nGenerate my tasks for tomorrow."}
        ]
    }

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(f"{OLLAMA_BASE}/api/chat", json=payload)
            resp.raise_for_status()
            raw = resp.json().get("message", {}).get("content", "{}")
            result = json.loads(raw)
            return result.get("tasks", [])
    except Exception as e:
        print(f"[Ollama] generate_daily_plan failed: {e}")
        return []
