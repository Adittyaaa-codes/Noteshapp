import json
import httpx
from typing import List, Dict, Optional
from ollama_client import OLLAMA_MODEL, OLLAMA_BASE, TIMEOUT

# ── AI Plan Generator ──────────────────────────────────────────────────────────

async def generate_daily_plan(sessions: List[Dict], capsules: List[Dict], todos: List[Dict]) -> List[Dict]:
    """
    Generate next day's tasks based on what they studied today/recently,
    evolving topics logically rather than repeating completed ones.
    """
    # Build context string
    context_lines = []
    
    # 1. Recent Sessions & Topics studied
    if sessions:
        context_lines.append("Recent Study Sessions:")
        for s in sessions[:15]:
            duration = s.get('clock_time_spent_seconds', 0) // 60
            context_lines.append(f" - Session: '{s.get('title', 'Untitled')}' ({duration} min). Topics covered: {s.get('topics', 'None')}")
    
    # 2. Study Capsules (shows status/difficulty)
    if capsules:
        context_lines.append("\nStudy Capsules (Learning Progress):")
        for c in capsules[:15]:
            context_lines.append(
                f" - Capsule: '{c.get('title', 'Untitled')}' "
                f"(Difficulty: {c.get('difficulty', 'medium')}, "
                f"Status: {c.get('status', 'new')}). "
                f"Key concepts: {c.get('key_concepts', 'None')}"
            )
            
    # 3. Todos (pending vs completed)
    if todos:
        context_lines.append("\nUser's Tasks/Todos:")
        completed = [t.get('text') for t in todos if t.get('completed')]
        pending = [t.get('text') for t in todos if not t.get('completed')]
        if completed:
            context_lines.append(f" - Completed tasks (do not repeat): {', '.join(completed[:10])}")
        if pending:
            context_lines.append(f" - Pending tasks (needs follow-up): {', '.join(pending[:10])}")

    context = "\n".join(context_lines)

    system_prompt = (
        "You are StudyLens, a personal AI study planner.\n"
        "Your task is to generate exactly 3 specific, highly actionable study tasks for the student's next day.\n"
        "To make this planning intelligent and non-repetitive, follow these rules:\n"
        "1. DO NOT repeat topics that have already been mastered, completed, or heavily studied recently.\n"
        "2. EVOLVE the study topics based on the student's learning progress. For example:\n"
        "   - If they studied 'OS Deadlock' today, suggest a next-level topic like 'OS Memory Management' or 'OS Page Replacement' tomorrow.\n"
        "   - If they studied 'DBMS Transactions', suggest 'DBMS Concurrency Control' or 'DBMS Recovery' tomorrow.\n"
        "   - If they studied 'DSA Arrays', suggest 'DSA Sliding Window' or 'DSA Two Pointers' tomorrow.\n"
        "3. Focus on their weak areas (topics with hard difficulty or low study duration) and follow up on pending todos.\n"
        "4. Output tasks that are highly concrete and specific, referencing the concept and next logical step.\n\n"
        "Respond ONLY with valid JSON matching exactly this schema:\n"
        '{"tasks": [\n'
        '  {"text": "<Concrete study task>", "reason": "<Educational rationale based on progress from previous topics>", "priority": "high" | "medium" | "low"}\n'
        ']}\n'
        "Do not add any extra text, markdown code blocks, or explanation outside the JSON."
    )

    payload = {
        "model": OLLAMA_MODEL,
        "format": "json",
        "stream": False,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Here is my study history and task list:\n\n{context}\n\nGenerate my tasks for tomorrow."}
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
