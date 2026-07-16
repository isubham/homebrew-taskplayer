use super::super::*;

pub(crate) fn build_tray_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let state = app.state::<AppState>();
    let active = state.run.lock().unwrap().active_task_id.clone();
    let tasks = state.db.lock().unwrap().tasks().unwrap_or_default();
    let lists = state.db.lock().unwrap().lists().unwrap_or_default();
    let recent = state.db.lock().unwrap().recent_task_ids(12);

    let mut owned: Vec<Box<dyn IsMenuItem<tauri::Wry>>> = Vec::new();

    if let Some(id) = &active {
        if let Some(t) = tasks.iter().find(|x| &x.id == id) {
            owned.push(Box::new(MenuItem::with_id(
                app,
                "current",
                format!("♪  {}", t.name),
                false,
                None::<&str>,
            )?));
        }
    }
    owned.push(Box::new(MenuItem::with_id(
        app,
        "toggle",
        if active.is_some() { "Pause" } else { "Play" },
        true,
        None::<&str>,
    )?));

    // Focus-music controls — separate from the task Play/Pause above, since
    // the ambient music and the work timer are two different things a
    // person might want to control independently from the tray.
    owned.push(Box::new(PredefinedMenuItem::separator(app)?));
    let music_on = *state.music_playing.lock().unwrap();
    owned.push(Box::new(MenuItem::with_id(
        app,
        "music_toggle",
        if music_on {
            "⏸  Pause music"
        } else {
            "▶  Play music"
        },
        true,
        None::<&str>,
    )?));
    owned.push(Box::new(MenuItem::with_id(
        app,
        "music_next",
        "⏭  Next track",
        true,
        None::<&str>,
    )?));

    // up to 5 recently played, skipping the current and completed tasks
    let mut recents: Vec<&Task> = Vec::new();
    for id in &recent {
        if Some(id) == active.as_ref() {
            continue;
        }
        if let Some(t) = tasks.iter().find(|x| &x.id == id) {
            if t.completed_at.is_none() {
                recents.push(t);
            }
        }
        if recents.len() >= 5 {
            break;
        }
    }
    if !recents.is_empty() {
        owned.push(Box::new(PredefinedMenuItem::separator(app)?));
        owned.push(Box::new(MenuItem::with_id(
            app,
            "rec_hd",
            "Recently played",
            false,
            None::<&str>,
        )?));
        for t in &recents {
            let emoji = lists
                .iter()
                .find(|l| l.id == t.list_id)
                .map(|l| l.emoji.as_str())
                .unwrap_or("");
            owned.push(Box::new(MenuItem::with_id(
                app,
                format!("recent:{}", t.id),
                format!("{}  {}", emoji, t.name),
                true,
                None::<&str>,
            )?));
        }
    }

    owned.push(Box::new(PredefinedMenuItem::separator(app)?));
    owned.push(Box::new(MenuItem::with_id(
        app,
        "open",
        "Open TaskPlayer",
        true,
        None::<&str>,
    )?));
    owned.push(Box::new(PredefinedMenuItem::separator(app)?));
    owned.push(Box::new(PredefinedMenuItem::quit(
        app,
        Some("Quit TaskPlayer"),
    )?));

    let refs: Vec<&dyn IsMenuItem<tauri::Wry>> = owned.iter().map(|b| b.as_ref()).collect();
    Menu::with_items(app, &refs)
}
