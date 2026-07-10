# StudyLens — Installation & Setup Guide

StudyLens is an AI-powered, fully offline study tracker. It captures your YouTube watch sessions and website reading activity, stores everything locally, and lets you ask questions like "What did I study this week?" using a local LLM.

---

## Prerequisites

| Requirement | Download |
|---|---|
| Python 3.9+ | https://python.org |
| Ollama (for AI analysis) | https://ollama.com |

---

## Option A — Run from Source (Development)

```bash
# 1. Install backend dependencies
cd studylens/backend
pip install -r requirements.txt

# 2. Install app dependencies  
cd ../app
pip install -r requirements_app.txt

# 3. Pull an Ollama model (once)
ollama pull llama3

# 4. Start the tray application
python studylens_tray.py
```

The tray icon will appear in your system tray. Click it to open the dashboard.

---

## Option B — Build a distributable .exe

```bash
cd studylens/app
python build.py          # Builds dist/StudyLens.exe
python build.py --run    # Builds and immediately runs the exe
python build.py --clean  # Cleans and rebuilds from scratch
```

**Output:** `studylens/app/dist/StudyLens.exe`

Anyone can double-click `StudyLens.exe` — no Python installation needed on their machine.

---

## Option C — Full Windows Installer (for distribution)

1. Build the exe first: `python build.py`
2. Download and install [Inno Setup 6](https://jrsoftware.org/isinfo.php)
3. Open `studylens/app/installer.iss` in Inno Setup Compiler
4. Click **Build → Compile**
5. Output: `studylens/app/installer_output/StudyLens_Setup.exe`

This creates a proper Windows installer that:
- Creates Start Menu shortcuts
- Optionally adds a Desktop shortcut
- Can auto-start StudyLens on Windows login

---

## Chrome Extension Setup

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** → select `studylens/extension/`
4. The extension is now active. Browse YouTube or any website to start tracking.

---

## Ollama Setup

```bash
# Install Ollama from https://ollama.com, then pull a model:
ollama pull llama3        # Recommended (4-8 GB RAM)
ollama pull phi3          # Lightweight option (2-4 GB RAM)
ollama pull mistral       # Good balance

# Verify it's running:
curl http://localhost:11434/api/tags
```

The StudyLens dashboard shows Ollama status in the top-right corner.

---

## Data Storage

| Location | Contents |
|---|---|
| `studylens/backend/studylens.db` (dev) | SQLite database with all sessions |
| `%APPDATA%\StudyLens\studylens.db` (exe) | Same, for packaged application |

---

## Windows Auto-Start

Right-click the tray icon → **Windows Startup → Enable auto-start**

This adds a silent VBScript entry to your Windows Startup folder so StudyLens starts automatically when you log in.

---

## Ports Used

| Port | Service |
|---|---|
| `7842` | StudyLens backend & dashboard |
| `11434` | Ollama (local LLM) |
