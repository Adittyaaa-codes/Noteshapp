"""
StudyLens — Automatic Ollama + Model Setup

On first launch:
  1. Checks if Ollama is already running
  2. If not installed: downloads OllamaSetup.exe silently
  3. Runs the installer with /S (silent)
  4. Starts the Ollama service
  5. Pulls the default AI model via Ollama's streaming HTTP API
  6. Reports progress every step via setup_state dict

The setup_state is served by GET /api/ai/status so the
dashboard can display a real-time progress banner.
"""

import os
import sys
import json
import time
import threading
import subprocess
import urllib.request
import urllib.error
from pathlib import Path

# ── Default model (Qwen2.5-0.5B is very lightweight and fast) ──────────────────────────
OLLAMA_MODEL   = os.getenv("OLLAMA_MODEL", "qwen2.5:0.5b")
OLLAMA_BASE    = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_DL_URL  = "https://ollama.com/download/OllamaSetup.exe"

# ── Shared state exposed via /api/ai/status ───────────────────────────────────
setup_state: dict = {
    "phase":             "idle",   # idle|checking|downloading_ollama|installing_ollama
                                   # starting_ollama|pulling_model|ready|error
    "message":           "Checking AI setup...",
    "progress":          0,        # 0–100
    "ollama_installed":  False,
    "model_ready":       False,
    "error":             None,
}

_setup_lock    = threading.Lock()
_setup_started = False


# ── Internal helpers ──────────────────────────────────────────────────────────

def _update(phase: str, message: str, progress: int, **extra):
    setup_state.update({"phase": phase, "message": message, "progress": progress, **extra})
    print(f"[AI Setup] [{phase}] {message}  ({progress}%)")


def _is_ollama_running() -> bool:
    try:
        with urllib.request.urlopen(f"{OLLAMA_BASE}/api/tags", timeout=3) as r:
            return r.status == 200
    except Exception:
        return False


def _find_ollama_exe() -> str | None:
    """Search common install locations and PATH for ollama.exe."""
    local_app = os.environ.get("LOCALAPPDATA", "")
    prog_files = os.environ.get("PROGRAMFILES", "")
    candidates = [
        Path(local_app)  / "Programs" / "Ollama" / "ollama.exe",
        Path(prog_files) / "Ollama"   / "ollama.exe",
    ]
    for p in candidates:
        if p.exists():
            return str(p)
    # Try PATH (works if user installed to a custom location)
    try:
        result = subprocess.run(
            ["where", "ollama"], capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            return result.stdout.strip().splitlines()[0]
    except Exception:
        pass
    return None


def _no_window_flags() -> int:
    """CREATE_NO_WINDOW flag on Windows so no console pops up."""
    return subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0


# ── Step 1: Download Ollama installer ─────────────────────────────────────────

def _download_ollama(dest: Path):
    _update("downloading_ollama", "Downloading Ollama installer...", 5)

    def _progress(count, block, total):
        if total > 0:
            raw_pct = min(int(count * block * 100 / total), 100)
            overall = 5 + int(raw_pct * 0.25)          # maps 0-100% → 5-30% overall
            _update("downloading_ollama", f"Downloading Ollama: {raw_pct}%", overall)

    urllib.request.urlretrieve(OLLAMA_DL_URL, str(dest), _progress)
    _update("downloading_ollama", "Ollama installer downloaded.", 30)


# ── Step 2: Run silent installer ──────────────────────────────────────────────

def _install_ollama(installer: Path):
    _update("installing_ollama", "Installing Ollama (this takes ~30 seconds)...", 31)
    try:
        subprocess.run(
            [str(installer), "/S"],
            check=True,
            timeout=180,
            creationflags=_no_window_flags(),
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError("Ollama installer timed out after 3 minutes.")
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"Ollama installer exited with code {e.returncode}.")
    _update("installing_ollama", "Ollama installed.", 48)


# ── Step 3: Start Ollama service ─────────────────────────────────────────────

def _start_ollama():
    _update("starting_ollama", "Starting Ollama service...", 49)
    exe = _find_ollama_exe()
    if not exe:
        raise RuntimeError("Ollama executable not found after installation.")

    subprocess.Popen(
        [exe, "serve"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=_no_window_flags(),
    )

    # Wait up to 45 seconds for the service to bind
    for i in range(45):
        time.sleep(1)
        if _is_ollama_running():
            _update("starting_ollama", "Ollama service is running.", 54, ollama_installed=True)
            return
        pct = 49 + i
        _update("starting_ollama", f"Waiting for Ollama to start... ({i+1}s)", min(pct, 53))

    raise RuntimeError("Ollama service did not respond within 45 seconds.")


# ── Step 4: Pull model via Ollama streaming HTTP API ─────────────────────────

def _pull_model():
    _update("pulling_model", f"Downloading AI model '{OLLAMA_MODEL}'... (2–10 min first time)", 55)

    payload = json.dumps({"name": OLLAMA_MODEL, "stream": True}).encode()
    req = urllib.request.Request(
        f"{OLLAMA_BASE}/api/pull",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            for raw_line in resp:
                if not raw_line.strip():
                    continue
                try:
                    data = json.loads(raw_line)
                except json.JSONDecodeError:
                    continue

                status    = data.get("status", "")
                total     = data.get("total", 0)
                completed = data.get("completed", 0)

                if total and total > 0:
                    raw_pct = int(completed * 100 / total)
                    overall = 55 + int(raw_pct * 0.40)   # maps 0-100% → 55-95%
                    _update(
                        "pulling_model",
                        f"Downloading AI model: {raw_pct}%",
                        min(overall, 95),
                    )
                elif status:
                    _update("pulling_model", f"Model: {status}", setup_state["progress"])

    except urllib.error.URLError as e:
        raise RuntimeError(f"Could not reach Ollama API: {e}")

    _update("pulling_model", f"Model '{OLLAMA_MODEL}' downloaded.", 96)


# ── Check if model already exists ────────────────────────────────────────────

def _model_already_pulled() -> bool:
    try:
        with urllib.request.urlopen(f"{OLLAMA_BASE}/api/tags", timeout=5) as r:
            data = json.loads(r.read())
            model_names = [m["name"].split(":")[0] for m in data.get("models", [])]
            return OLLAMA_MODEL.split(":")[0] in model_names
    except Exception:
        return False


# ── Public API ────────────────────────────────────────────────────────────────

def run_setup():
    """Full idempotent setup pipeline. Safe to call multiple times."""
    global _setup_started

    with _setup_lock:
        if _setup_started:
            return
        _setup_started = True

    try:
        _update("checking", "Checking AI setup...", 1)

        # Already fully ready?
        if _is_ollama_running() and _model_already_pulled():
            _update("ready", "AI is ready!", 100, ollama_installed=True, model_ready=True)
            return

        # Ollama running but model missing
        if _is_ollama_running():
            _update("pulling_model", "Ollama running. Checking model...", 54, ollama_installed=True)
        else:
            # Need to install Ollama?
            if not _find_ollama_exe():
                data_dir  = Path(os.environ.get("STUDYLENS_DATA_DIR", Path.home()))
                installer = data_dir / "OllamaSetup.exe"
                _download_ollama(installer)
                _install_ollama(installer)
                try:
                    installer.unlink()
                except Exception:
                    pass
            else:
                _update("starting_ollama", "Ollama found. Starting service...", 20)

            _start_ollama()

        setup_state["ollama_installed"] = True

        # Pull model if needed
        if not _model_already_pulled():
            _pull_model()

        _update("ready", "AI is fully set up and ready!", 100, ollama_installed=True, model_ready=True)

    except Exception as exc:
        msg = str(exc)
        print(f"[AI Setup] FAILED: {msg}")
        setup_state.update({
            "phase":   "error",
            "message": f"Setup failed: {msg}",
            "error":   msg,
            "progress": 0,
        })


def start_setup_in_background():
    """Called from FastAPI lifespan — fires and forgets."""
    t = threading.Thread(target=run_setup, daemon=True, name="ai-setup")
    t.start()


def retry_setup():
    """Reset state and try again — called from /api/ai/retry."""
    global _setup_started
    with _setup_lock:
        _setup_started = False
    setup_state.update({
        "phase":    "idle",
        "message":  "Retrying...",
        "progress": 0,
        "error":    None,
    })
    start_setup_in_background()
