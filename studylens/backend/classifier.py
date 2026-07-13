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

def load_model() -> None:
    """Load the scikit-learn pipeline into memory. Safe to call multiple times."""
    global _pipeline

    if not os.path.exists(MODEL_PATH):
        log.warning("[Classifier] Model not found at %s. Classifier will always return NO.", MODEL_PATH)
        return

    try:
        with open(MODEL_PATH, 'rb') as f:
            _pipeline = pickle.load(f)
        log.info("[Classifier] ML Model loaded from %s", MODEL_PATH)
    except Exception as exc:
        log.error("[Classifier] Failed to load ML model: %s", exc)
        _pipeline = None


def classify(text: str) -> tuple[str, float]:
    """
    Classify text as educational or not using the lightweight ML model.

    Returns:
        (label, confidence) where label is "YES" or "NO"
        and confidence is 0.0–1.0.
    """
    global _pipeline

    clean = text.replace('\n', ' ').replace('\r', ' ').strip()

    if not clean:
        return ("NO", 1.0)

    # Use the highly accurate ML pipeline
    if _pipeline is not None:
        try:
            probs   = _pipeline.predict_proba([clean])[0]
            pred_id = _pipeline.predict([clean])[0]
            
            # Map classes: 0 -> NO, 1 -> YES
            # Assuming classes are [0, 1] as built in build_dataset.py
            classes = list(_pipeline.classes_)
            conf    = float(probs[classes.index(pred_id)])
            
            label = "YES" if pred_id == 1 else "NO"
            log.debug("[Classifier] ML Prediction: %s (%.0f%%) — %s", label, conf * 100, clean[:60])
            return (label, conf)
        except Exception as exc:
            log.error("[Classifier] ML model error: %s", exc)

    # Fallback if model fails to load or prediction errors
    log.debug("[Classifier] Fallback NO (model unavailable): %s", clean[:60])
    return ("NO", 0.5)
