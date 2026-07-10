"""
StudyLens — Windows System Tray Application

Manages the FastAPI backend lifecycle, lives in the system tray,
and opens the dashboard in the default browser.

Architecture:
  - FastAPI (uvicorn) runs in a daemon thread inside this process
  - pystray provides the system-tray icon and menu
  - PIL draws the tray icon programmatically (no external .ico needed)

Works both in dev mode and when frozen by PyInstaller.
"""

import sys
import os
import threading
import webbrowser
import time
import socket
from pathlib import Path

# ── Stdout UTF-8 fix (Windows CP1252 terminals) ────────────────────────────────
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# ── Resolve paths for dev vs. frozen exe ─────────────────────────────────────
if getattr(sys, "frozen", False):
    # PyInstaller bundle — files are extracted to sys._MEIPASS
    BUNDLE_DIR = Path(sys._MEIPASS)
    # Persistent data goes to %APPDATA%\StudyLens
    DATA_DIR = Path(os.environ.get("APPDATA", Path.home())) / "StudyLens"
else:
    # Development — run from studylens/app/
    BUNDLE_DIR = Path(__file__).parent.parent
    DATA_DIR = BUNDLE_DIR / "backend"

DATA_DIR.mkdir(parents=True, exist_ok=True)
BACKEND_DIR = BUNDLE_DIR / "backend"

# Expose data dir to the database module
os.environ["STUDYLENS_DATA_DIR"] = str(DATA_DIR)

# Add backend to Python path so we can import it
sys.path.insert(0, str(BACKEND_DIR))

# ── Backend imports ───────────────────────────────────────────────────────────
import uvicorn
from main import app as fastapi_app  # noqa: E402

# ── Constants ─────────────────────────────────────────────────────────────────
PORT          = 7842
DASHBOARD_URL = f"http://localhost:{PORT}"
APP_NAME      = "StudyLens"
APP_VERSION   = "2.0.0"

# ── Server state ──────────────────────────────────────────────────────────────
_server_thread:  threading.Thread | None = None
_uvicorn_server: uvicorn.Server | None   = None
_server_ready    = threading.Event()
_server_failed   = threading.Event()


def _is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


def _run_uvicorn():
    global _uvicorn_server
    config = uvicorn.Config(
        app=fastapi_app,
        host="127.0.0.1",
        port=PORT,
        log_level="warning",
        loop="asyncio",
    )
    _uvicorn_server = uvicorn.Server(config)
    try:
        _server_ready.set()
        _uvicorn_server.run()
    except Exception as e:
        print(f"[Server] Fatal: {e}")
        _server_failed.set()


def start_backend():
    """Start the FastAPI server in a daemon thread."""
    global _server_thread

    if _is_port_in_use(PORT):
        print(f"[Tray] Port {PORT} already in use — assuming backend is already running.")
        _server_ready.set()
        return

    _server_thread = threading.Thread(target=_run_uvicorn, daemon=True, name="uvicorn")
    _server_thread.start()
    # Wait up to 10s for server to be ready
    _server_ready.wait(timeout=10)
    time.sleep(0.8)   # Let uvicorn fully bind
    print(f"[Tray] Backend started: {DASHBOARD_URL}")


def stop_backend():
    """Gracefully stop the uvicorn server."""
    global _uvicorn_server
    if _uvicorn_server:
        _uvicorn_server.should_exit = True
        print("[Tray] Backend stopped.")


# ── Tray Icon Drawing ─────────────────────────────────────────────────────────

def _create_tray_image(size: int = 64, status: str = "ok") -> "Image.Image":
    """
    Draw the StudyLens tray icon programmatically.
    status: 'ok' (teal) | 'warn' (yellow) | 'error' (red)
    """
    from PIL import Image, ImageDraw, ImageFont

    colors = {
        "ok":    "#00d4c8",
        "warn":  "#fbbf24",
        "error": "#f87171",
    }
    bg_color = colors.get(status, "#00d4c8")

    img  = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded-square background
    pad = 4
    draw.rounded_rectangle([pad, pad, size - pad, size - pad], radius=12, fill=bg_color)

    # "SL" text in dark color
    try:
        font = ImageFont.truetype("arialbd.ttf", int(size * 0.38))
    except OSError:
        font = ImageFont.load_default()

    text = "SL"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(
        ((size - tw) / 2 - bbox[0], (size - th) / 2 - bbox[1]),
        text, fill="#0a0c14", font=font,
    )

    return img


# ── Tray Menu Actions ─────────────────────────────────────────────────────────

_window_proc = None

def _open_window(url: str):
    global _window_proc
    # If window is already open, do not open another
    if _window_proc and _window_proc.poll() is None:
        return

    import subprocess
    if getattr(sys, "frozen", False):
        _window_proc = subprocess.Popen([sys.executable, "--window", url])
    else:
        _window_proc = subprocess.Popen([sys.executable, __file__, "--window", url])


def action_open_dashboard(icon, item):
    _open_window(DASHBOARD_URL)


def action_open_sessions(icon, item):
    _open_window(f"{DASHBOARD_URL}/?filter=today")



def action_restart_backend(icon, item):
    icon.notify("Restarting backend...", APP_NAME)
    stop_backend()
    time.sleep(1.5)
    _server_ready.clear()
    start_backend()
    icon.notify("Backend restarted.", APP_NAME)


def _ensure_startup():
    """Silently add the application to Windows startup on launch."""
    startup_dir  = Path(os.environ["APPDATA"]) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup"
    vbs_path     = startup_dir / "StudyLens.vbs"
    
    if getattr(sys, "frozen", False):
        exe_path = Path(sys.argv[0])
        vbs_content = f'CreateObject("WScript.Shell").Run """{exe_path}""", 0, False\n'
    else:
        exe_path = Path(__file__).resolve()
        vbs_content = f'CreateObject("WScript.Shell").Run "python ""{exe_path}""", 0, False\n'

    try:
        startup_dir.mkdir(parents=True, exist_ok=True)
        vbs_path.write_text(vbs_content, encoding="utf-8")
    except Exception as e:
        print(f"[Tray] Failed to add to startup: {e}")

def action_install_startup(icon, item):
    _ensure_startup()
    startup_dir  = Path(os.environ["APPDATA"]) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup"
    icon.notify(f"StudyLens will start automatically on login.\n{startup_dir / 'StudyLens.vbs'}", APP_NAME)



def action_remove_startup(icon, item):
    vbs_path = (
        Path(os.environ["APPDATA"])
        / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup"
        / "StudyLens.vbs"
    )
    if vbs_path.exists():
        vbs_path.unlink()
        icon.notify("Removed from Windows startup.", APP_NAME)
    else:
        icon.notify("No startup entry found.", APP_NAME)


def action_about(icon, item):
    icon.notify(
        f"StudyLens v{APP_VERSION}\nAI-powered offline study tracker\n"
        f"Dashboard: {DASHBOARD_URL}\nData: {DATA_DIR}",
        APP_NAME,
    )


def action_quit(icon, item):
    print("[Tray] Quit requested.")
    stop_backend()
    icon.stop()


# ── Health Checker (updates icon color) ──────────────────────────────────────

def _health_checker(icon):
    """Background thread — pings /health and updates icon color."""
    import urllib.request
    import urllib.error

    while True:
        try:
            with urllib.request.urlopen(f"{DASHBOARD_URL}/health", timeout=2) as r:
                status = "ok" if r.status == 200 else "warn"
        except Exception:
            status = "error"

        try:
            icon.icon = _create_tray_image(status=status)
        except Exception:
            pass

        time.sleep(10)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    try:
        import pystray
        from PIL import Image
    except ImportError:
        print("[FATAL] pystray and/or Pillow are not installed.")
        print("        Run: pip install pystray Pillow")
        sys.exit(1)

    print(f"[Tray] Starting {APP_NAME} v{APP_VERSION}")
    print(f"[Tray] Data directory: {DATA_DIR}")
    print(f"[Tray] Backend dir:    {BACKEND_DIR}")

    # Start backend first
    start_backend()

    # Automatically add to Windows startup silently
    _ensure_startup()

    # Build tray icon
    tray_image = _create_tray_image(status="ok")

    menu = pystray.Menu(
        pystray.MenuItem("📚 StudyLens",           None,                   enabled=False),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("🌐 Open Dashboard",      action_open_dashboard,  default=True),
        pystray.MenuItem("📖 Today's Sessions",    action_open_sessions),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("🔄 Restart Backend",     action_restart_backend),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Windows Startup",        pystray.Menu(
            pystray.MenuItem("✅ Enable auto-start",  action_install_startup),
            pystray.MenuItem("❌ Disable auto-start", action_remove_startup),
        )),
        pystray.MenuItem("ℹ️ About",               action_about),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("❌ Quit",                action_quit),
    )

    icon = pystray.Icon(APP_NAME, tray_image, f"{APP_NAME} — Running", menu)

    # Start health checker in background
    hc_thread = threading.Thread(
        target=_health_checker, args=(icon,), daemon=True, name="health-checker"
    )
    hc_thread.start()

    # Open native window on first launch
    threading.Timer(2.0, lambda: _open_window(DASHBOARD_URL)).start()

    # Notify user the app is running
    def _notify_ready():
        time.sleep(3)
        try:
            icon.notify(f"Backend running at {DASHBOARD_URL}", APP_NAME)
        except Exception:
            pass

    threading.Thread(target=_notify_ready, daemon=True).start()

    print(f"[Tray] Icon running. Right-click the tray icon to access the menu.")
    icon.run()


if __name__ == "__main__":
    if "--window" in sys.argv:
        import webview
        # Start webview process
        url = sys.argv[-1] if sys.argv[-1].startswith("http") else DASHBOARD_URL
        webview.create_window("StudyLens Dashboard", url, width=1200, height=850)
        webview.start()
        sys.exit(0)
    else:
        main()
