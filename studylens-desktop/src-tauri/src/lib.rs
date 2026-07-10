// StudyLens — Tauri application shell
// All business logic lives in the Python FastAPI backend (http://127.0.0.1:7842).
//
// Strategy (dev + production):
//   In dev:  spawns Python directly via `python run_backend.py`
//   In prod: spawns the compiled sidecar exe
//
// Steps:
//   1. Spawn the backend process
//   2. Poll /health until it responds (up to 60s)
//   3. Show the window (initially hidden)
//   4. Kill the backend on exit

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager, RunEvent};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};

// ── App State ─────────────────────────────────────────────────────────────────
// Either a Tauri sidecar CommandChild (prod) or a raw std::process::Child (dev).
enum BackendProcess {
    Sidecar(CommandChild),
    Native(Child),
}

impl BackendProcess {
    fn kill(self) {
        match self {
            BackendProcess::Sidecar(c) => { let _ = c.kill(); }
            BackendProcess::Native(mut c) => { let _ = c.kill(); }
        }
    }
}

struct BackendState {
    child: Mutex<Option<BackendProcess>>,
}

// ── Poll backend health ────────────────────────────────────────────────────────
async fn wait_for_backend(max_seconds: u64) -> bool {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .unwrap_or_default();

    for _ in 0..max_seconds {
        if let Ok(resp) = client.get("http://127.0.0.1:7842/health").send().await {
            if resp.status().is_success() {
                return true;
            }
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    false
}

// ── Spawn backend via Tauri sidecar (production) ──────────────────────────────
fn spawn_sidecar(app: &AppHandle) -> Result<BackendProcess, String> {
    let sidecar_cmd = app
        .shell()
        .sidecar("backend")
        .map_err(|e| format!("Failed to create sidecar command: {e}"))?;

    let (mut rx, child) = sidecar_cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn backend sidecar: {e}"))?;

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let msg = String::from_utf8_lossy(&line);
                    log::info!("[Backend] {}", msg.trim());
                }
                CommandEvent::Stderr(line) => {
                    let msg = String::from_utf8_lossy(&line);
                    if !msg.contains("ConnectionResetError") && !msg.contains("_call_connection_lost") {
                        log::warn!("[Backend] {}", msg.trim());
                    }
                }
                CommandEvent::Error(e) => log::error!("[Backend] Process error: {e}"),
                CommandEvent::Terminated(s) => {
                    log::info!("[Backend] Terminated: {:?}", s);
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(BackendProcess::Sidecar(child))
}

// ── Spawn backend via Python directly (dev / fallback) ────────────────────────
fn spawn_python(app: &AppHandle) -> Result<BackendProcess, String> {
    // Find backend dir relative to the Tauri app resource dir
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("resource_dir error: {e}"))?;

    // Walk up: resource_dir is typically .../studylens-desktop/src-tauri
    // backend is at   .../studylens/backend/run_backend.py
    let backend_script = resource_dir
        .parent() // src-tauri
        .and_then(|p| p.parent()) // studylens-desktop
        .and_then(|p| p.parent()) // Hackathon-Unstop
        .map(|p| p.join("studylens").join("backend").join("run_backend.py"))
        .ok_or("Could not resolve backend path")?;

    if !backend_script.exists() {
        return Err(format!("Backend script not found: {:?}", backend_script));
    }

    let backend_dir = backend_script
        .parent()
        .ok_or("Could not get backend dir")?;

    log::info!("[Tauri] Spawning Python backend from {:?}", backend_script);

    let child = Command::new("python")
        .arg(&backend_script)
        .current_dir(backend_dir)
        .spawn()
        .map_err(|e| format!("Failed to spawn python: {e}"))?;

    Ok(BackendProcess::Native(child))
}

// ── Main entry ────────────────────────────────────────────────────────────────
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .manage(BackendState {
            child: Mutex::new(None),
        })
        .setup(|app| {
            let app_handle = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                // 1. Try sidecar first; fall back to direct Python
                let backend = match spawn_sidecar(&app_handle) {
                    Ok(b) => {
                        log::info!("[Tauri] Backend sidecar spawned");
                        b
                    }
                    Err(e) => {
                        log::warn!("[Tauri] Sidecar failed ({e}), falling back to Python...");
                        match spawn_python(&app_handle) {
                            Ok(b) => {
                                log::info!("[Tauri] Python backend spawned");
                                b
                            }
                            Err(e2) => {
                                log::error!("[Tauri] Both sidecar and Python failed: {e2}");
                                if let Some(window) = app_handle.get_webview_window("main") {
                                    let _ = window.show();
                                }
                                return;
                            }
                        }
                    }
                };

                // Store child so it lives until exit
                {
                    let state = app_handle.state::<BackendState>();
                    *state.child.lock().unwrap() = Some(backend);
                }

                // 2. Poll health
                log::info!("[Tauri] Waiting for backend to become ready...");
                let ready = wait_for_backend(60).await;
                if ready {
                    log::info!("[Tauri] Backend ready — showing window");
                } else {
                    log::warn!("[Tauri] Backend not ready after 60s — showing window anyway");
                }

                // 3. Show window
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let RunEvent::ExitRequested { .. } | RunEvent::Exit = event {
                let state = app_handle.state::<BackendState>();
                let mut guard = state.child.lock().unwrap();
                if let Some(child) = guard.take() {
                    log::info!("[Tauri] Killing backend on exit");
                    child.kill();
                }
            }
        });
}
