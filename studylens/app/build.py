"""
StudyLens — One-command build script.

Usage:
    python build.py           → Build StudyLens.exe
    python build.py --clean   → Remove build artifacts before building
    python build.py --run     → Build then immediately run the exe

Output: studylens/app/dist/StudyLens.exe
"""

import sys
import os
import shutil
import subprocess
from pathlib import Path

# Fix stdout encoding for Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

APP_DIR  = Path(__file__).parent
ROOT_DIR = APP_DIR.parent
SPEC     = APP_DIR / "studylens.spec"
DIST_DIR = APP_DIR / "dist"
BUILD_DIR = APP_DIR / "build"


def clean():
    for d in [DIST_DIR, BUILD_DIR]:
        if d.exists():
            shutil.rmtree(d)
            print(f"[Build] Removed: {d}")


def install_build_deps():
    """Ensure PyInstaller, pystray, and Pillow are installed."""
    deps = ["pyinstaller", "pystray", "Pillow"]
    print(f"[Build] Installing build dependencies: {', '.join(deps)}")
    subprocess.check_call(
        [sys.executable, "-m", "pip", "install", "--quiet", *deps],
        cwd=str(ROOT_DIR),
    )


def build():
    print(f"[Build] Building StudyLens.exe from {SPEC}")
    result = subprocess.run(
        [
            sys.executable, "-m", "PyInstaller",
            str(SPEC),
            "--distpath", str(DIST_DIR),
            "--workpath", str(BUILD_DIR),
            "--noconfirm",
        ],
        cwd=str(APP_DIR),
    )
    if result.returncode != 0:
        print("[Build] ❌ Build FAILED.")
        sys.exit(1)

    exe = DIST_DIR / "StudyLens.exe"
    if exe.exists():
        size_mb = exe.stat().st_size / 1_048_576
        print(f"\n[Build] ✅ Success!")
        print(f"         Executable: {exe}")
        print(f"         Size:       {size_mb:.1f} MB")
        print(f"\n         Run it:  \"{exe}\"")
        print(f"         Or:      python build.py --run")
    else:
        print("[Build] ❌ Executable not found after build.")
        sys.exit(1)

    return exe


def run_exe(exe: Path):
    print(f"\n[Build] Launching {exe.name}...")
    subprocess.Popen([str(exe)])


if __name__ == "__main__":
    args = sys.argv[1:]
    do_clean = "--clean" in args or "-c" in args
    do_run   = "--run"   in args or "-r" in args

    if do_clean:
        clean()

    install_build_deps()
    exe = build()

    if do_run:
        run_exe(exe)
