// StudyLens — Tauri application shell
// Backend is managed externally (run separately).
// This shell just: opens the window, shows it once the webview is ready.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::time::Duration;
use tauri::{Manager, RunEvent};

// ── Main entry ────────────────────────────────────────────────────────────────
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Give the Vite dev server / webview a moment to fully load
            // before showing the window. This eliminates the blank/white flash.
            tauri::async_runtime::spawn(async move {
                // Wait for the webview to be ready (200ms is enough for local dev)
                tokio::time::sleep(Duration::from_millis(300)).await;

                if let Some(window) = app_handle.get_webview_window("main") {
                    // Set focus and show
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            if let RunEvent::ExitRequested { .. } | RunEvent::Exit = event {
                // Nothing to clean up — backend is external
            }
        });
}
