"""
StudyLens Backend — sidecar entry point.

This file is compiled by PyInstaller into backend-x86_64-pc-windows-msvc.exe
and spawned by Tauri as a sidecar process.
"""

import sys
import os
import multiprocessing

# ── PyInstaller freeze support (must be first) ────────────────────────────────
multiprocessing.freeze_support()

# ── Fix path so backend modules resolve correctly ─────────────────────────────
if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
    bundle_dir = sys._MEIPASS
else:
    bundle_dir = os.path.dirname(os.path.abspath(__file__))

if bundle_dir not in sys.path:
    sys.path.insert(0, bundle_dir)

# ── Windows encoding fix ──────────────────────────────────────────────────────
if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
    try:
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

# ── Import app object directly (required for PyInstaller frozen bundles) ──────
# uvicorn.run("main:app", ...) uses importlib which fails in frozen mode.
# Instead, import the app object directly and pass it to uvicorn.
from main import app  # noqa: E402

import uvicorn

uvicorn.run(
    app,                   # <-- object reference, not string
    host="127.0.0.1",
    port=7842,
    log_level="warning",
    access_log=False,
)
