// Tauri application entry point
// All logic is in lib.rs

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    studylens_desktop_lib::run()
}
