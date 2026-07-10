# -*- mode: python ; coding: utf-8 -*-
"""
StudyLens PyInstaller Spec File
Bundles the tray app + backend into a single Windows executable.

Build:   pyinstaller studylens.spec
Output:  dist/StudyLens.exe
"""

import sys
from pathlib import Path

APP_DIR     = Path(SPECPATH)           # studylens/app/
ROOT_DIR    = APP_DIR.parent           # studylens/
BACKEND_DIR = ROOT_DIR / "backend"

block_cipher = None

a = Analysis(
    [str(APP_DIR / "studylens_tray.py")],
    pathex=[str(APP_DIR), str(BACKEND_DIR)],
    binaries=[],
    datas=[
        # Bundle the entire backend directory
        (str(BACKEND_DIR / "main.py"),          "backend"),
        (str(BACKEND_DIR / "database.py"),      "backend"),
        (str(BACKEND_DIR / "ollama_client.py"), "backend"),
        (str(BACKEND_DIR / "models.py"),        "backend"),
    ],
    hiddenimports=[
        # FastAPI & ASGI
        "fastapi",
        "fastapi.middleware.cors",
        "fastapi.responses",
        "uvicorn",
        "uvicorn.main",
        "uvicorn.config",
        "uvicorn.loops.asyncio",
        "uvicorn.protocols.http.h11_impl",
        "uvicorn.lifespan.on",
        "starlette",
        "starlette.routing",
        "starlette.responses",
        "starlette.middleware.cors",
        # Pydantic
        "pydantic",
        "pydantic.v1",
        # HTTP client
        "httpx",
        "httpcore",
        "anyio",
        "anyio.from_thread",
        # Standard lib
        "sqlite3",
        "json",
        "uuid",
        "email.mime.text",
        "email.mime.multipart",
        # Window / Tray
        "webview",
        "pystray",
        "PIL",
        "PIL.Image",
        "PIL.ImageDraw",
        "PIL.ImageFont",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "matplotlib", "numpy", "pandas", "scipy", "tkinter",
        "PyQt5", "PyQt6", "wx", "PySide2", "PySide6",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="StudyLens",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,           # Compress — reduces exe size ~30%
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,      # No black terminal window
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    # icon="studylens.ico",   # Uncomment if you add a .ico file
)
