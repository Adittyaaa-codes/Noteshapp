# StudyLens Desktop

A native desktop application wrapping the StudyLens AI study workspace.

Built with **Tauri v2**, **React 19**, **TypeScript**, **TailwindCSS v4**, **Zustand**, and **TipTap**.

The Python FastAPI backend continues to run unchanged on `http://127.0.0.1:7842`.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 20 | https://nodejs.org |
| Rust | stable | https://rustup.rs |
| Cargo | (included with Rust) | — |
| WebView2 | (Windows) | Ships with Windows 11 / install via Microsoft |

---

## Setup

```bash
# 1. Install npm dependencies
npm install

# 2. Run in development mode (requires Python backend running on :7842)
npm run tauri dev

# 3. Build native installer
npm run tauri build
```

---

## Folder Structure

```
src/
├── components/         Generic UI components
│   └── ui/
├── features/           Feature modules (one folder per page)
│   ├── dashboard/      Dashboard + stats
│   ├── notes/          Notes list
│   ├── editor/         TipTap editor + AI toolbar + stream overlay
│   └── todos/          Task list
├── hooks/              Shared React hooks
├── layouts/            App shell layout (Sidebar + Main)
├── routes/             React Router definitions (lazy-loaded)
├── services/
│   └── api.ts          Centralised HTTP client → FastAPI backend
├── stores/             Zustand global stores
│   ├── useThemeStore   Dark/light mode
│   ├── useNotesStore   Notes CRUD
│   ├── useTodosStore   Todos CRUD + optimistic updates
│   └── useDashboardStore Stats + AI analysis
└── utils/              cn, formatDuration, stripHtml, etc.

src-tauri/              Rust shell (minimal, no business logic)
├── src/
│   ├── main.rs
│   └── lib.rs
├── tauri.conf.json
└── capabilities/
```

---

## Architecture

```
Browser Extension  →  FastAPI :7842  ←  Tauri Desktop (fetch / SSE)
                           ↓
                       SQLite DB
                           ↓
                    Local LLM (Ollama / llama.cpp)
```

The Tauri shell handles:
- Native window lifecycle
- System tray (future)
- File pickers (future)
- Notifications (future)

All business logic lives in the Python backend.

---

## Backend

Start the Python backend before running the desktop app:

```bash
# From studylens/app/
python studylens_tray.py
# OR directly:
cd studylens/backend && uvicorn main:app --host 127.0.0.1 --port 7842
```
