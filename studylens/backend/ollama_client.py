"""
StudyLens Backend - Ollama HTTP client.
Handles async session analysis and natural language query synthesis.
"""

import os
import json
import httpx
from typing import Optional, Dict, Any, List

OLLAMA_BASE  = os.getenv("OLLAMA_URL",   "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:0.5b")
TIMEOUT      = 300.0   # seconds — local LLMs can be slow on first token
CLASSIFY_TIMEOUT = 60.0  # faster timeout for real-time classification


# ── Health Check ─────────────────────────────────────────────────────────────

async def is_ollama_running() -> bool:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(f"{OLLAMA_BASE}/api/tags")
            return r.status_code == 200
    except Exception:
        return False


# ── Page Classifier ───────────────────────────────────────────────────────────

async def classify_page(title: str, url: str, context: str = "") -> Dict[str, Any]:
    """
    Ask Ollama if a page is study/educational content.
    Returns: {is_study: bool, confidence: float, reason: str}
    Falls back to True (track everything) if Ollama is unavailable.
    """
    snippet = context[:400] if context else ""
    prompt = (
        f"Title: {title}\n"
        f"URL: {url}\n"
        f"Content snippet: {snippet}\n\n"
        "Is this page educational or study-related content? "
        "Consider: tutorials, documentation, research, lectures, problem solving, "
        "textbooks, coding practice, academic content, learning resources.\n"
        "Do NOT consider: social media feeds, entertainment, news, shopping, games, "
        "personal video content unrelated to learning.\n"
        'Respond ONLY with JSON: {"is_study": true/false, "confidence": 0.0-1.0, '
        '"reason": "<one short sentence>"}'
    )

    payload = {
        "model":  OLLAMA_MODEL,
        "format": "json",
        "stream": False,
        "messages": [
            {"role": "system", "content":
                "You are a study content classifier. Respond only with valid JSON."},
            {"role": "user", "content": prompt},
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=CLASSIFY_TIMEOUT) as client:
            resp = await client.post(f"{OLLAMA_BASE}/api/chat", json=payload)
            resp.raise_for_status()
            raw = resp.json().get("message", {}).get("content", "{}")
            result = json.loads(raw)
            return {
                "is_study":   bool(result.get("is_study", True)),
                "confidence": float(result.get("confidence", 0.5)),
                "reason":     str(result.get("reason", "")),
            }
    except Exception as e:
        print(f"[Ollama] classify_page failed ({e}) — defaulting to track")
        return {"is_study": True, "confidence": 0.5, "reason": "Ollama unavailable, defaulting to track"}


# ── Study Analysis Generator ──────────────────────────────────────────────────

async def generate_study_analysis(sessions: List[Dict], timeframe: str) -> Dict[str, Any]:
    """
    Generate a rich AI analysis of the user's study sessions.
    Returns a structured dict with narrative, topics, insights, etc.
    """
    if not sessions:
        return {
            "narrative": f"No study activity recorded for {timeframe.replace('_', ' ')}. Start browsing study content to see your analysis here!",
            "topics": [],
            "subject_breakdown": [],
            "insights": [],
            "total_minutes": 0,
            "session_count": 0,
            "strongest_subject": None,
            "study_streak": 0,
        }

    # Build a compact context tree
    total_seconds = 0
    topic_counts: Dict[str, int] = {}
    day_map: Dict[str, List[str]] = {}

    for s in sessions:
        day   = s.get("day_date", "?")
        title = (s.get("title") or "Untitled")[:60]
        clock = s.get("clock_time_spent_seconds") or 0
        stype = s.get("session_type", "?")
        summ  = s.get("summary") or ""
        tops  = [t.strip() for t in (s.get("topics") or "").split(",") if t.strip()]
        total_seconds += clock

        for t in tops:
            topic_counts[t] = topic_counts.get(t, 0) + 1

        entry = f"  [{stype}] {title} ({clock//60}min)"
        if summ:
            entry += f" — {summ[:80]}"
        day_map.setdefault(day, []).append(entry)

    tree_lines = []
    for day in sorted(day_map.keys(), reverse=True)[:7]:
        tree_lines.append(f"{day}:")
        tree_lines.extend(day_map[day])

    total_hrs = round(total_seconds / 3600, 1)
    top_topics = sorted(topic_counts.items(), key=lambda x: -x[1])[:8]

    context = (
        f"Timeframe: {timeframe.replace('_', ' ')}\n"
        f"Total study time: {total_hrs} hours across {len(sessions)} sessions\n"
        f"Top topics: {', '.join(t for t, _ in top_topics) or 'not yet analyzed'}\n\n"
        f"Session log:\n" + "\n".join(tree_lines)
    )

    system_prompt = (
        "You are StudyLens, a personal AI study coach. "
        "Analyze the student's study sessions and produce an encouraging, specific, actionable report. "
        "Respond ONLY with valid JSON in this exact schema:\n"
        '{"narrative": "<2-3 engaging paragraphs summarizing what they studied, what they achieved, and patterns observed>", '
        '"insights": ["<insight 1>", "<insight 2>", "<insight 3>"], '
        '"recommendations": ["<actionable tip 1>", "<actionable tip 2>"], '
        '"strongest_subject": "<the topic they spent most time on>", '
        '"focus_quality": <integer 1-10 based on session depth and consistency>}'
    )

    payload = {
        "model":  OLLAMA_MODEL,
        "format": "json",
        "stream": False,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": f"Generate my study analysis:\n\n{context}"},
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(f"{OLLAMA_BASE}/api/chat", json=payload)
            resp.raise_for_status()
            raw = resp.json().get("message", {}).get("content", "{}")
            result = json.loads(raw)
    except Exception as e:
        print(f"[Ollama] generate_study_analysis failed: {e}")
        result = {
            "narrative": f"You have {len(sessions)} study sessions recorded ({total_hrs}h total). AI analysis is temporarily unavailable — make sure Ollama is running.",
            "insights": [],
            "recommendations": [],
            "strongest_subject": top_topics[0][0] if top_topics else None,
            "focus_quality": 5,
        }

    # Merge with computed stats
    result["total_minutes"]      = round(total_seconds / 60)
    result["session_count"]      = len(sessions)
    result["topics"]             = [t for t, _ in top_topics]
    result["subject_breakdown"]  = [{"topic": t, "count": c} for t, c in top_topics]
    result["timeframe"]          = timeframe
    return result




# ── Build context string for a single session ─────────────────────────────────

def _build_session_context(session: Dict[str, Any]) -> str:
    stype       = session.get("session_type", "reading")
    title       = session.get("title", "Unknown")
    platform    = session.get("platform", "unknown")
    clock_time  = session.get("clock_time_spent_seconds") or 0
    events      = session.get("events") or []

    # Summarise event stream compactly
    ev_counts: Dict[str, int] = {}
    for e in events:
        t = e.get("type", "UNKNOWN")
        ev_counts[t] = ev_counts.get(t, 0) + 1
    ev_summary = ", ".join(f"{k}×{v}" for k, v in ev_counts.items()) or "none"

    if stype == "video":
        duration   = session.get("video_duration_seconds") or 0
        completion = session.get("completion_percentage") or 0
        transcript = (session.get("transcript") or "")[:800]   # cap at 800 chars
        extra = (
            f"  Video Duration: {duration}s\n"
            f"  Completion: {completion}%\n"
            f"  Event stream: {ev_summary}\n"
            f"  Transcript (excerpt): {transcript or 'not available'}"
        )
    else:
        scroll    = session.get("max_scroll_percent") or 0
        wpm       = session.get("avg_reading_wpm") or 0
        wc        = session.get("word_count") or 0
        headings  = ", ".join((session.get("headings") or [])[:8]) or "none"
        sections  = session.get("sections_focused") or []
        sec_str   = ", ".join(
            f"{s.get('section','?')} ({s.get('duration_seconds','?')}s)"
            for s in sections[:5]
        ) or "none"
        extra = (
            f"  Scroll Depth: {scroll}%\n"
            f"  Reading Speed: {wpm} WPM\n"
            f"  Word Count: {wc}\n"
            f"  Headings: {headings}\n"
            f"  Sections focused on: {sec_str}"
        )

    return (
        f"Title: {title}\n"
        f"Type: {stype} | Platform: {platform}\n"
        f"Duration: {clock_time}s\n"
        f"{extra}"
    )


# ── Session Analyzer (background task) ───────────────────────────────────────

async def analyze_session(session: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Send a single session to Ollama for analysis.
    Returns a dict with keys: summary, topics, productivity_score
    Returns None if Ollama is unavailable or returns bad JSON.
    """
    context = _build_session_context(session)

    system_prompt = (
        "You are StudyLens, an intelligent study session analyzer. "
        "Given a study session transcript or description, strictly extract the key information. "
        "Do NOT hallucinate or rewrite content beyond what is provided. "
        'Respond ONLY with valid JSON matching exactly this schema:\n'
        '{\n'
        '  "summary": "Detailed notes grouped by subtopics. For each subtopic, write 2-3 lines explaining the concepts strictly based on the content received.",\n'
        '  "topics": ["<topic1>", "<topic2>"],\n'
        '  "productivity_score": <integer 1-10>,\n'
        '  "revision_summary": "<Quick 1-sentence revision summary>",\n'
        '  "important_points": ["<bullet point 1>", "<bullet point 2>"]\n'
        '}\n'
        "Do not add any extra text, markdown, or explanation outside the JSON."
    )

    payload = {
        "model":   OLLAMA_MODEL,
        "format":  "json",
        "stream":  False,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": f"Analyze this study session:\n\n{context}"},
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(f"{OLLAMA_BASE}/api/chat", json=payload)
            resp.raise_for_status()
            raw_content = resp.json().get("message", {}).get("content", "{}")
            result = json.loads(raw_content)

            # Validate expected keys exist
            if "summary" not in result or "topics" not in result:
                raise ValueError("Missing required keys in Ollama response")

            # Ensure topics is a list of strings
            if not isinstance(result["topics"], list):
                result["topics"] = [str(result["topics"])]

            result.setdefault("productivity_score", 5)
            return result

    except json.JSONDecodeError as e:
        print(f"[Ollama] JSON parse error: {e}")
        return None
    except Exception as e:
        print(f"[Ollama] analyze_session failed: {e}")
        return None


# ── Query Synthesizer ─────────────────────────────────────────────────────────

async def synthesize_query(sessions: List[Dict], user_question: str, timeframe: str) -> str:
    """
    Build a PageIndex tree from SQLite rows and ask Ollama to synthesize
    a natural language answer to the user's question.
    """
    if not sessions:
        return f"No study sessions found for timeframe '{timeframe}'."

    # Build PageIndex tree (grouped by day)
    tree: Dict[str, List[str]] = {}
    total_seconds = 0

    for s in sessions:
        day   = s.get("day_date", "unknown")
        title = s.get("title", "Untitled")
        stype = s.get("session_type", "?")
        summ  = s.get("summary") or "Not yet analyzed."
        tops  = s.get("topics") or ""
        clock = s.get("clock_time_spent_seconds") or 0
        total_seconds += clock

        entry = f"  - [{stype.upper()}] '{title}' ({clock}s) | {summ} Topics: {tops}"
        tree.setdefault(day, []).append(entry)

    tree_text = ""
    for day in sorted(tree.keys(), reverse=True):
        tree_text += f"\n{day}:\n" + "\n".join(tree[day]) + "\n"

    total_hrs = round(total_seconds / 3600, 1)

    context = (
        f"Study Index for '{timeframe}' (Total study time: {total_hrs} hours):\n"
        f"{tree_text}"
    )

    system_prompt = (
        "You are StudyLens, an offline personal study assistant. "
        "Use ONLY the provided study index to answer the user's question accurately and concisely. "
        "Do not invent topics or sessions that are not in the index. "
        "Be friendly and specific. Format your answer in clear, readable paragraphs."
    )

    payload = {
        "model":  OLLAMA_MODEL,
        "stream": False,
        "messages": [
            {"role": "system",    "content": system_prompt},
            {"role": "user",      "content": f"{context}\n\nUser question: {user_question}"},
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(f"{OLLAMA_BASE}/api/chat", json=payload)
            resp.raise_for_status()
            return resp.json().get("message", {}).get("content", "Could not synthesize an answer.")
    except Exception as e:
        print(f"[Ollama] synthesize_query failed: {e}")
        return f"Ollama is currently unavailable ({e}). Here is the raw study index:\n{tree_text}"


# ── AI Text Actions (Streaming) ───────────────────────────────────────────────

ACTION_PROMPTS = {
    "rewrite": ("Rewrite the text with the same meaning but different phrasing.", 2.0),
    "fix_grammar": ("Fix all grammar, spelling, and punctuation errors. Preserve the original voice and style.", 1.2),
    "change_tone": ("Change the tone of the text to {tone}. Keep the core meaning the same.", 1.5),
    "shorten": ("Condense the text to roughly half its original length while preserving key meaning.", 1.0),
    "lengthen": ("Expand and elaborate on the text. Add detailed explanations, examples, and deep context. Provide a much longer, comprehensive version.", 4.0),
    "clarify": ("Simplify the structure and wording to improve clarity and remove ambiguity.", 1.3),
    "continue": ("Continue writing the next paragraph in the same voice and topic.", 0), # Absolute token limit instead of multiplier
    "summarize": ("Provide a concise summary of the text.", 0.4),
    "emojiify": ("Rewrite the text by inserting highly relevant emojis naturally throughout the sentences. Keep the exact original meaning but make it visually expressive with emojis.", 1.2),
    "custom": ("Custom action using provided prompt.", 4.0)
}

async def stream_text_action(action: str, selected_text: str, surrounding_context: str = None, tone: str = None):
    """
    Generator that streams Server-Sent Events (SSE) from Ollama, applies early-stage
    sanitization to strip preambles, and yields final chunks to the client.
    """
    if action not in ACTION_PROMPTS:
        yield f'data: {json.dumps({"error": "Unknown action"})}\n\n'
        return
        
    instruction, length_multiplier = ACTION_PROMPTS[action]

    if action == "custom":
        system_prompt = tone or "You are an expert study assistant. Respond strictly as requested."
        user_prompt = selected_text
        num_predict = 1000
    elif action == "continue":
        if selected_text:
            instruction = "Expand on the selected text. Continue the existing idea, adding details, explanation, and context, preserving the tone, style, and formatting. Do not change the topic."
            length_multiplier = 2.5
        else:
            instruction = "Continue writing the next paragraph in the same voice and topic based on the preceding text."
            length_multiplier = 0

    else:
        input_text = selected_text or surrounding_context or ""
        if len(input_text) > 4000:
            input_text = input_text[-4000:]
        input_tokens = len(input_text) // 4
        num_predict = 200 if length_multiplier == 0 else max(200, int(input_tokens * length_multiplier))

        rules = [
            "- Output ONLY the transformed text. No preamble, no explanation, no quotes, no markdown formatting (unless expanding existing formatting), no 'Here is...' lead-in.",
            "- Preserve the original language of the input."
        ]
        rules.append(f"- Keep output within roughly {num_predict} tokens.")

        if action == "change_tone":
            system_prompt = (
                "You are an expert editor embedded in a notes app.\n"
                f"Task: Change the tone of the text to {tone}. Keep the core meaning the same.\n"
                "Rules:\n" + "\n".join(rules)
            )
        else:
            system_prompt = (
                "You are a precise text-modification assistant embedded in a notes app.\n"
                f"Task: {instruction}\n"
                "Rules:\n" + "\n".join(rules)
            )
        
        user_prompt = f"Text to modify:\n{input_text}"


    payload = {
        "model": OLLAMA_MODEL,
        "stream": True,
        "options": {
            "temperature": 0.75,
            "top_p": 0.9,
            "num_predict": num_predict
        },
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
    }

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, read=8.0)) as client:
            async with client.stream("POST", f"{OLLAMA_BASE}/api/chat", json=payload) as resp:
                if resp.status_code != 200:
                    yield f'data: {json.dumps({"error": f"Ollama HTTP {resp.status_code}"})}\n\n'
                    return

                buffer = ""
                stripping_preamble = True
                preamble_patterns = ["Here is", "Here's", "Sure,", "Certainly", "Here "]
                
                async for line in resp.aiter_lines():
                    if not line.strip():
                        continue
                        
                    try:
                        chunk = json.loads(line)
                        delta = chunk.get("message", {}).get("content", "")
                        done = chunk.get("done", False)

                        if stripping_preamble:
                            buffer += delta
                            # If buffer is very short, wait a bit
                            if len(buffer) < 25 and not done:
                                continue
                            
                            # Strip quotes/markdown at the start
                            buffer = buffer.lstrip(" \\\"'`\n")
                            if buffer.startswith("```"):
                                # Strip markdown code fence
                                lines = buffer.split("\\n", 1)
                                if len(lines) > 1:
                                    buffer = lines[1]
                                else:
                                    buffer = buffer[3:].lstrip("markdown").lstrip()

                            # Strip conversational preamble
                            for pat in preamble_patterns:
                                if buffer.lower().startswith(pat.lower()):
                                    # Strip up to the first colon or newline
                                    colon_idx = buffer.find(":")
                                    nl_idx = buffer.find("\\n")
                                    idx = colon_idx if colon_idx != -1 else (nl_idx if nl_idx != -1 else len(pat))
                                    buffer = buffer[idx:].lstrip(" :\\n\\\"'")
                                    break
                                    
                            stripping_preamble = False
                            delta = buffer
                            buffer = ""

                        if done:
                            # Final trailing sanitization
                            delta = delta.rstrip(" \\\"'`\n")
                            if delta.endswith("```"):
                                delta = delta[:-3].rstrip()
                            if delta:
                                yield f'data: {json.dumps({"delta": delta})}\n\n'
                            yield f'data: {json.dumps({"done": True})}\n\n'
                        elif delta:
                            yield f'data: {json.dumps({"delta": delta})}\n\n'
                            
                    except json.JSONDecodeError:
                        continue
    except httpx.ReadTimeout:
        yield f'data: {json.dumps({"error": "Generation timed out"})}\n\n'
    except Exception as e:
        yield f'data: {json.dumps({"error": f"Ollama connection error: {str(e)}"})}\n\n'

