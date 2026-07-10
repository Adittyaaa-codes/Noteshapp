"""
StudyLens — Educational content classifier.

Uses a 4-layer approach:
  1. Hard blocklist  (regex) — sports, entertainment, etc.  → always NO
  2. Hard allowlist  (regex) — clear study signals         → always YES
  3. ML model        (sklearn pipeline if loaded)          → probabilistic
  4. Safe fallback                                         → NO

Path resolution works in both dev mode and PyInstaller frozen bundles.
"""

import os
import re
import pickle
import sys
import logging

log = logging.getLogger(__name__)

# ── Path resolution: works in both dev and PyInstaller ────────────────────────
def _get_base_dir() -> str:
    if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
        # PyInstaller extracts --add-data "models;models" flat to _MEIPASS/models/
        # NOT to _MEIPASS/backend/models/
        return sys._MEIPASS
    return os.path.dirname(os.path.abspath(__file__))

BASE_DIR   = _get_base_dir()
MODEL_PATH = os.path.join(BASE_DIR, "models", "educational_classifier.pkl")

# Global pipeline instance
_pipeline = None

# ── Hard keyword blocklist — never educational ────────────────────────────────
_BLOCKLIST = re.compile(
    r'\b('
    r'world cup|cricket|ipl|nba|nfl|fifa|match|score|wicket|goal|trophy|'
    r'bollywood|movie|film|actor|actress|song|album|music|concert|celeb|'
    r'recipe|cooking|food|restaurant|diet|weight loss|'
    r'meme|joke|funny|roast|prank|viral|trend|gossip|'
    r'travel|trip|vacation|hotel|flight|booking|tour|'
    r'shopping|buy|price|deal|discount|coupon|amazon|flipkart|'
    r'instagram|tiktok|reels|youtube shorts|'
    r'astrology|horoscope|zodiac|tarot|'
    r'crypto price|stock price|market today'
    r')\b',
    re.IGNORECASE,
)

# ── Allowlist — strong signals that it IS educational ────────────────────────
_ALLOWLIST = re.compile(
    r'\b('
    r'explain|what is|how does|how do|why is|why does|define|difference between|'
    r'algorithm|machine learning|deep learning|neural network|ai agent|'
    r'programming|code|debug|syntax|function|class|variable|database|'
    r'physics|chemistry|biology|mathematics|calculus|statistics|'
    r'history|geography|economics|psychology|philosophy|'
    r'research|study|learn|understand|concept|theory|principle|'
    r'homework|assignment|exam|revision|notes|tutorial|course|lecture|'
    r'science|engineering|medicine|law|finance|accounting|'
    r'language|grammar|vocabulary|writing|essay|'
    r'data structure|operating system|network|cybersecurity|'
    r'climate|environment|ecology|astronomy'
    r')\b',
    re.IGNORECASE,
)


def load_model() -> None:
    """Load the scikit-learn pipeline into memory. Safe to call multiple times."""
    global _pipeline

    if not os.path.exists(MODEL_PATH):
        log.warning("[Classifier] Model not found at %s — using keyword rules only.", MODEL_PATH)
        return

    try:
        with open(MODEL_PATH, 'rb') as f:
            _pipeline = pickle.load(f)
        log.info("[Classifier] Model loaded from %s", MODEL_PATH)
    except Exception as exc:
        log.error("[Classifier] Failed to load model: %s", exc)
        _pipeline = None


def classify(text: str) -> tuple[str, float]:
    """
    Classify text as educational or not.

    Returns:
        (label, confidence) where label is "YES" or "NO"
        and confidence is 0.0–1.0.
    """
    global _pipeline

    clean = text.replace('\n', ' ').replace('\r', ' ').strip()

    if not clean:
        return ("NO", 1.0)

    # Layer 1 — Blocklist
    if _BLOCKLIST.search(clean):
        log.debug("[Classifier] BLOCKED: %s", clean[:80])
        return ("NO", 0.95)

    # Layer 2 — Allowlist
    if _ALLOWLIST.search(clean):
        log.debug("[Classifier] ALLOWED: %s", clean[:80])
        return ("YES", 0.90)

    # Layer 3 — ML model
    if _pipeline is not None:
        try:
            probs   = _pipeline.predict_proba([clean])[0]
            pred    = _pipeline.predict([clean])[0]
            classes = list(_pipeline.classes_)
            conf    = float(probs[classes.index(pred)])
            log.debug("[Classifier] ML: %s (%.0f%%) — %s", pred, conf * 100, clean[:60])
            return (pred, conf)
        except Exception as exc:
            log.error("[Classifier] ML model error: %s", exc)

    # Layer 4 — safe fallback
    log.debug("[Classifier] Fallback NO (no model + no keyword match): %s", clean[:60])
    return ("NO", 0.5)
