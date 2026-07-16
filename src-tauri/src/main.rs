// TaskPlayer — macOS menu-bar deep-work timer (Tauri v2 shell around taskplayer-core).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    taskplayer::run();
}
