use super::super::*;

// ---- push updates to windows + tray ----
pub(crate) fn refresh(app: &AppHandle) {
    let state = app.state::<AppState>();
    let status = build_status(state.inner(), now_ms());

    // Touching the tray item — even just *reading* it via tray_by_id, let
    // alone set_title — has to happen on the main thread. AppKit's status-item
    // machinery asserts on this internally and traps (EXC_BREAKPOINT/SIGTRAP)
    // if violated: a hard native abort that no amount of Rust-side
    // catch_unwind or panic-hooking can intercept or log (see `guard` and
    // `install_panic_hook` above — neither one is reachable from here,
    // because this was never a Rust panic to begin with).
    //
    // `refresh` runs on the 1s background tick thread on every single tick
    // that *isn't* a pomodoro transition (see the tick loop in `main()`) —
    // avoid redundant tray updates while the menu is open by only setting
    // the icon/title when they actually change.
    let app2 = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(tray) = app2.tray_by_id("tray") {
            let icon_name = match (status.active, status.phase.as_deref()) {
                (true, Some("work")) => "work",
                (true, _) => "break",
                (false, _) => "idle",
            };
            let icon = match icon_name {
                "work" => tauri::include_image!("icons/menubar-work.png"),
                "break" => tauri::include_image!("icons/menubar-break.png"),
                _ => tauri::include_image!("icons/menubar-idle.png"),
            };
            let title = if status.active {
                let name = truncate(status.task_name.as_deref().unwrap_or("Focus"), 26);
                match status.phase.as_deref() {
                    Some("break") => {
                        Some(format!(" {} · ☕ {}", name, format_hm(status.elapsed_ms)))
                    }
                    _ => Some(format!(" {} · {}", name, format_hm(status.elapsed_ms))),
                }
            } else {
                None
            };

            let app_state = app2.state::<AppState>();
            let mut tray_state = app_state.tray_state.lock().unwrap();
            if tray_state.last_icon.as_deref() != Some(icon_name) {
                let _ = tray.set_icon(Some(icon));
                tray_state.last_icon = Some(icon_name.to_string());
            }
            if tray_state.last_title != Some(title.clone()) {
                let _ = tray.set_title(title.clone());
                tray_state.last_title = Some(title);
            }
        }
        let _ = app2.emit("tick", &status);
    });
}

pub(crate) fn push(app: &AppHandle) {
    let state = app.state::<AppState>();
    let snap = build_snapshot(state.inner());
    let _ = app.emit("state-changed", &snap);
    refresh(app);
    // rebuild the tray menu (recents/current change) — menu ops must run on the main thread
    let app2 = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(tray) = app2.tray_by_id("tray") {
            if let Ok(menu) = build_tray_menu(&app2) {
                let app_state = app2.state::<AppState>();
                let menu_hash = build_tray_menu_hash(app_state.inner());
                let mut tray_state = app_state.tray_state.lock().unwrap();
                if tray_state.last_menu_hash.as_deref() != Some(&menu_hash) {
                    let _ = tray.set_menu(Some(menu));
                    tray_state.last_menu_hash = Some(menu_hash);
                }
            }
        }
    });
}

pub(crate) fn build_tray_menu_hash(state: &AppState) -> String {
    let active_id = state.run.lock().unwrap().active_task_id.clone();
    let tasks = state.db.lock().unwrap().tasks().unwrap_or_default();
    let lists = state.db.lock().unwrap().lists().unwrap_or_default();
    let recent = state.db.lock().unwrap().recent_task_ids(12);
    let music_on = *state.music_playing.lock().unwrap();

    let mut hash = String::new();
    if let Some(ref id) = active_id {
        if let Some(task) = tasks.iter().find(|x| x.id == *id) {
            hash.push_str("active:");
            hash.push_str(id);
            hash.push(':');
            hash.push_str(&task.name);
        } else {
            hash.push_str("active:missing:");
            hash.push_str(id);
        }
    } else {
        hash.push_str("active:none");
    }
    hash.push_str("|music:");
    hash.push_str(if music_on { "on" } else { "off" });

    let mut recents = Vec::new();
    for id in &recent {
        if active_id
            .as_ref()
            .map(|active| active == id)
            .unwrap_or(false)
        {
            continue;
        }
        if let Some(task) = tasks.iter().find(|x| &x.id == id) {
            if task.completed_at.is_none() {
                let emoji = lists
                    .iter()
                    .find(|l| l.id == task.list_id)
                    .map(|l| l.emoji.as_str())
                    .unwrap_or("");
                recents.push(format!("{}|{}|{}", emoji, task.id, task.name));
            }
        }
        if recents.len() >= 5 {
            break;
        }
    }
    for recent_item in recents {
        hash.push('|');
        hash.push_str(&recent_item);
    }
    hash
}
