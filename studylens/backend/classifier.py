"""
StudyLens — Educational content classifier.

Uses a 3-layer approach:
  1. Hard blocklist  (regex) — sports, entertainment, etc.  → always NO
  2. Hard allowlist  (regex) — clear study signals         → always YES
  3. ML model        (sklearn pipeline if loaded)          → probabilistic
  4. Safe fallback                                         → YES (track everything if uncertain)

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
        return sys._MEIPASS
    return os.path.dirname(os.path.abspath(__file__))

BASE_DIR   = _get_base_dir()
MODEL_PATH = os.path.join(BASE_DIR, "models", "educational_classifier.pkl")

# Global pipeline instance
_pipeline = None

# ── Keyword-based heuristic fallback ──────────────────────────────────────────
_BLOCKLIST = re.compile(
    r'\b(sports|football|soccer|nfl|nba|mma|wrestling|celebrity|gossip|'
    r'instagram|tiktok|funny|comedy|prank|gaming stream|'
    r'twitch|fortnite|roblox|minecraft gameplay|music video|lyrics|'
    r'trailer|movie review|box office|netflix|disney)\b',
    re.IGNORECASE,
)

_ALLOWLIST = re.compile(
    r'\b(tutorial|course|lecture|lesson|exam|quiz|homework|assignment|'
    r'documentation|research|paper|study|learn|algorithm|equation|formula|'
    r'programming|python|javascript|java|code|data structure|database|'
    r'calculus|algebra|physics|chemistry|biology|history|geography|'
    r'machine learning|deep learning|neural|statistics|probability|'
    r'leetcode|geeksforgeeks|w3schools|mdn|stackoverflow|github|'
    r'chatgpt|claude|gemini|wikipedia|textbook|chapter|notes|concept)\b',
    re.IGNORECASE,
)


def _keyword_classify(text: str) -> tuple:
    """Fast keyword-based fallback. Returns YES if ambiguous."""
    if _BLOCKLIST.search(text):
        return ("NO", 0.8)
    if _ALLOWLIST.search(text):
        return ("YES", 0.85)
    # Default: assume educational (track everything to avoid missing sessions)
    return ("YES", 0.5)


def load_model() -> None:
    """Load the scikit-learn pipeline into memory. Safe to call multiple times."""
    global _pipeline

    if not os.path.exists(MODEL_PATH):
        log.warning(
            "[Classifier] Model not found at %s. Using keyword-based fallback (defaults to YES).",
            MODEL_PATH,
        )
        return

    try:
        with open(MODEL_PATH, 'rb') as f:
            _pipeline = pickle.load(f)
        log.info("[Classifier] ML Model loaded from %s", MODEL_PATH)
    except Exception as exc:
        log.error("[Classifier] Failed to load ML model: %s", exc)
        _pipeline = None


def classify(text: str) -> tuple:
    """
    Classify text as educational or not.

    Returns:
        (label, confidence) where label is "YES" or "NO"
        and confidence is 0.0-1.0.
    """
    global _pipeline

    clean = text.replace('\n', ' ').replace('\r', ' ').strip()

    if not clean:
        # Empty text: default YES so we don't silently drop sessions
        return ("YES", 0.5)

    # Use the ML pipeline when available
    if _pipeline is not None:
        try:
            probs   = _pipeline.predict_proba([clean])[0]
            pred_id = _pipeline.predict([clean])[0]
            classes = list(_pipeline.classes_)
            conf    = float(probs[classes.index(pred_id)])
            label   = "YES" if pred_id == 1 else "NO"
            log.debug("[Classifier] ML: %s (%.0f%%) — %s", label, conf * 100, clean[:60])
            return (label, conf)
        except Exception as exc:
            log.error("[Classifier] ML model error: %s", exc)

    # Fallback to keyword heuristic (defaults to YES if uncertain)
    label, conf = _keyword_classify(clean)
    log.debug("[Classifier] Keyword fallback: %s (%.0f%%) — %s", label, conf * 100, clean[:60])
    return (label, conf)
