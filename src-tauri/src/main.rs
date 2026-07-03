// TaskPlayer — macOS menu-bar deep-work timer (Tauri v2 shell around taskplayer-core).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};

use taskplayer_core::models::now_ms;
use taskplayer_core::{
    task_total_ms, timer, Db, RunState, Session, SessionConfig, Snapshot, Status, Task, TaskList,
};

struct AppState {
    db: Mutex<Db>,
    run: Mutex<RunState>,
    config: Mutex<SessionConfig>,
}

// ---- snapshot / status builders ----
fn build_snapshot(state: &AppState) -> Snapshot {
    let db = state.db.lock().unwrap();
    Snapshot {
        lists: db.lists().unwrap_or_default(),
        tasks: db.tasks().unwrap_or_default(),
        sessions: db.sessions().unwrap_or_default(),
        config: state.config.lock().unwrap().clone(),
        run: state.run.lock().unwrap().clone(),
    }
}

fn build_status(state: &AppState, now: i64) -> Status {
    let run = state.run.lock().unwrap().clone();
    let config = state.config.lock().unwrap().clone();
    let db = state.db.lock().unwrap();

    let mut st = Status {
        active: false,
        phase: run.phase.clone(),
        task_id: run.active_task_id.clone(),
        task_name: None,
        list_name: None,
        list_color: None,
        elapsed_ms: 0,
        minutes: 0,
        task_total_ms: 0,
    };

    if let Some(tid) = run.active_task_id.clone() {
        st.active = true;
        if let Ok(tasks) = db.tasks() {
            if let Some(t) = tasks.iter().find(|x| x.id == tid) {
                st.task_name = Some(t.name.clone());
                if let Ok(lists) = db.lists() {
                    if let Some(l) = lists.iter().find(|x| x.id == t.list_id) {
                        st.list_name = Some(l.name.clone());
                        st.list_color = Some(l.color.clone());
                    }
                }
            }
        }
        if let Ok(sessions) = db.sessions() {
            st.task_total_ms = task_total_ms(&sessions, &run, &tid, now);
        }
        st.elapsed_ms = if run.phase.as_deref() == Some("break") {
            timer::break_remaining(&run, &config, now)
        } else {
            timer::work_elapsed(&run, now)
        };
        st.minutes = st.elapsed_ms / 60_000;
    }
    st
}

/// Trim a title to `n` characters (char-safe), adding an ellipsis if cut.
fn truncate(s: &str, n: usize) -> String {
    if s.chars().count() > n {
        format!("{}…", s.chars().take(n.saturating_sub(1)).collect::<String>())
    } else {
        s.to_string()
    }
}

// ---- push updates to windows + tray ----
fn refresh(app: &AppHandle) {
    let state = app.state::<AppState>();
    let status = build_status(state.inner(), now_ms());

    if let Some(tray) = app.tray_by_id("tray") {
        // The template icon already shows the play glyph, so the title is just
        // the time (a coffee cup marks break so the constant icon isn't misread).
        // show the task being worked on next to the icon (truncated), then time
        let title = if status.active {
            let name = truncate(status.task_name.as_deref().unwrap_or("Focus"), 26);
            match status.phase.as_deref() {
                Some("break") => Some(format!(" {} · ☕ {}m", name, status.elapsed_ms / 60_000)),
                _ => Some(format!(" {} · {}m", name, status.minutes)),
            }
        } else {
            None
        };
        let _ = tray.set_title(title);
    }
    let _ = app.emit("tick", &status);
}

fn push(app: &AppHandle) {
    let state = app.state::<AppState>();
    let snap = build_snapshot(state.inner());
    let _ = app.emit("state-changed", &snap);
    refresh(app);
    // rebuild the tray menu (recents/current change) — menu ops must run on the main thread
    let app2 = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(tray) = app2.tray_by_id("tray") {
            if let Ok(menu) = build_tray_menu(&app2) {
                let _ = tray.set_menu(Some(menu));
            }
        }
    });
}

// ---- timer mutations (lock order: run -> db) ----
fn do_play(state: &AppState, task_id: &str) {
    let now = now_ms();
    let mut run = state.run.lock().unwrap();
    let (nr, log) = timer::play(&run, task_id, now);
    *run = nr;
    let db = state.db.lock().unwrap();
    if let Some(l) = log {
        let _ = db.add_session(&l);
    }
    let _ = db.set_run(&run);
}

fn do_stop(state: &AppState) {
    let now = now_ms();
    let mut run = state.run.lock().unwrap();
    let (nr, log) = timer::stop(&run, now);
    *run = nr;
    let db = state.db.lock().unwrap();
    if let Some(l) = log {
        let _ = db.add_session(&l);
    }
    let _ = db.set_run(&run);
}

// ---- commands ----
#[tauri::command]
fn get_snapshot(state: State<AppState>) -> Snapshot {
    build_snapshot(state.inner())
}

#[tauri::command]
fn add_list(app: AppHandle, state: State<AppState>, name: String) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.add_list(&name);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn rename_list(app: AppHandle, state: State<AppState>, id: String, name: String) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.rename_list(&id, &name);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn delete_list(app: AppHandle, state: State<AppState>, id: String) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.delete_list(&id);
    }
    reset_run_if_orphaned(state.inner());
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn add_task(app: AppHandle, state: State<AppState>, list_id: String, name: String) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.add_task(&list_id, &name);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn rename_task(app: AppHandle, state: State<AppState>, id: String, name: String) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.rename_task(&id, &name);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn set_depth(app: AppHandle, state: State<AppState>, id: String, depth: Option<String>) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.set_depth(&id, depth.as_deref());
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn set_description(app: AppHandle, state: State<AppState>, id: String, text: Option<String>) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let trimmed = text.as_deref().map(str::trim).filter(|s| !s.is_empty());
        let _ = db.set_description(&id, trimmed);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn move_task(app: AppHandle, state: State<AppState>, id: String, list_id: String) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.move_task(&id, &list_id);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn set_done(app: AppHandle, state: State<AppState>, id: String) -> Snapshot {
    // completing the active task stops its timer first (logs the segment)
    if state.run.lock().unwrap().active_task_id.as_deref() == Some(id.as_str()) {
        do_stop(state.inner());
    }
    {
        let db = state.db.lock().unwrap();
        let already = db
            .tasks()
            .unwrap_or_default()
            .into_iter()
            .find(|t| t.id == id)
            .and_then(|t| t.completed_at)
            .is_some();
        let _ = db.set_completed(&id, if already { None } else { Some(now_ms()) });
    }
    // don't leave a completed task lingering as the "remembered" one
    {
        let mut run = state.run.lock().unwrap();
        if run.last_task_id.as_deref() == Some(id.as_str()) {
            run.last_task_id = None;
            let db = state.db.lock().unwrap();
            let _ = db.set_run(&run);
        }
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn set_estimate(app: AppHandle, state: State<AppState>, id: String, minutes: Option<i64>) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.set_estimate(&id, minutes.filter(|m| *m > 0));
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn add_session(app: AppHandle, state: State<AppState>, task_id: String, start: i64, end: i64) -> Snapshot {
    if end > start {
        let db = state.db.lock().unwrap();
        let _ = db.add_session(&taskplayer_core::SessionLog { task_id, start, end });
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn delete_session(app: AppHandle, state: State<AppState>, id: String) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.delete_session(&id);
    }
    push(&app);
    build_snapshot(state.inner())
}

// ---- data export / import ----
#[derive(serde::Serialize)]
struct Backup {
    app: &'static str,
    version: u32,
    #[serde(rename = "exportedAt")]
    exported_at: i64,
    lists: Vec<TaskList>,
    tasks: Vec<Task>,
    sessions: Vec<Session>,
    config: SessionConfig,
}

#[derive(serde::Deserialize)]
struct RestorePayload {
    lists: Vec<TaskList>,
    tasks: Vec<Task>,
    sessions: Vec<Session>,
    config: Option<SessionConfig>,
}

/// Serialize all data to a JSON backup in ~/Downloads and reveal it in Finder.
/// Returns the written file path.
#[tauri::command]
fn export_data(state: State<AppState>) -> Result<String, String> {
    let backup = {
        let db = state.db.lock().unwrap();
        Backup {
            app: "TaskPlayer",
            version: 1,
            exported_at: now_ms(),
            lists: db.lists().map_err(|e| e.to_string())?,
            tasks: db.tasks().map_err(|e| e.to_string())?,
            sessions: db.sessions().map_err(|e| e.to_string())?,
            config: db.get_config(),
        }
    };
    let json = serde_json::to_string_pretty(&backup).map_err(|e| e.to_string())?;

    let home = std::env::var("HOME").ok().map(PathBuf::from);
    let dir = home
        .as_ref()
        .map(|h| h.join("Downloads"))
        .filter(|d| d.exists())
        .or(home)
        .unwrap_or_else(std::env::temp_dir);
    let path = dir.join(format!("TaskPlayer-backup-{}.json", now_ms()));
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    let _ = std::process::Command::new("open").arg("-R").arg(&path).status();
    Ok(path.to_string_lossy().into_owned())
}

/// Replace all data from a backup JSON string. Clears the run state so nothing
/// is left "playing" against tasks that may no longer exist.
#[tauri::command]
fn import_data(app: AppHandle, state: State<AppState>, payload: String) -> Result<Snapshot, String> {
    let data: RestorePayload =
        serde_json::from_str(&payload).map_err(|_| "That doesn't look like a TaskPlayer backup file.".to_string())?;
    {
        let db = state.db.lock().unwrap();
        db.import_replace(&data.lists, &data.tasks, &data.sessions, data.config.as_ref())
            .map_err(|e| e.to_string())?;
    }
    {
        let mut run = state.run.lock().unwrap();
        *run = RunState::default();
        let db = state.db.lock().unwrap();
        let _ = db.set_run(&run);
    }
    {
        let db = state.db.lock().unwrap();
        *state.config.lock().unwrap() = db.get_config();
    }
    push(&app);
    Ok(build_snapshot(state.inner()))
}

#[tauri::command]
fn delete_task(app: AppHandle, state: State<AppState>, id: String) -> Snapshot {
    if state.run.lock().unwrap().active_task_id.as_deref() == Some(id.as_str()) {
        do_stop(state.inner());
    }
    {
        let db = state.db.lock().unwrap();
        let _ = db.delete_task(&id);
    }
    reset_run_if_orphaned(state.inner());
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn play(app: AppHandle, state: State<AppState>, task_id: String) -> Snapshot {
    do_play(state.inner(), &task_id);
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn stop(app: AppHandle, state: State<AppState>) -> Snapshot {
    do_stop(state.inner());
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn skip_break(app: AppHandle, state: State<AppState>) -> Snapshot {
    {
        let now = now_ms();
        let mut run = state.run.lock().unwrap();
        *run = timer::skip_break(&run, now);
        let db = state.db.lock().unwrap();
        let _ = db.set_run(&run);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn set_mode(app: AppHandle, state: State<AppState>, mode: String) -> Snapshot {
    {
        let mut c = state.config.lock().unwrap();
        c.mode = mode;
        let db = state.db.lock().unwrap();
        let _ = db.set_config(&c);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn set_config_field(app: AppHandle, state: State<AppState>, key: String, value: i64) -> Snapshot {
    {
        let mut c = state.config.lock().unwrap();
        match key.as_str() {
            "targetMin" => c.target_min = value.clamp(1, 240),
            "workMin" => c.work_min = value.clamp(1, 120),
            "breakMin" => c.break_min = value.clamp(1, 60),
            _ => {}
        }
        let db = state.db.lock().unwrap();
        let _ = db.set_config(&c);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn open_main(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// After a delete, drop any run-state references to tasks that no longer exist:
/// reset entirely if the active task is gone, and forget the remembered task if
/// it's gone (so the paused player doesn't point at a ghost).
fn reset_run_if_orphaned(state: &AppState) {
    let ids: Vec<String> = state
        .db
        .lock()
        .unwrap()
        .tasks()
        .map(|t| t.into_iter().map(|x| x.id).collect())
        .unwrap_or_default();
    let mut run = state.run.lock().unwrap();
    let mut changed = false;
    if let Some(id) = run.active_task_id.clone() {
        if !ids.contains(&id) {
            *run = RunState::default();
            changed = true;
        }
    }
    if let Some(id) = run.last_task_id.clone() {
        if !ids.contains(&id) {
            run.last_task_id = None;
            changed = true;
        }
    }
    if changed {
        let _ = state.db.lock().unwrap().set_run(&run);
    }
}

/// Build the tray dropdown: current task, Play/Pause, the last 3 recently-played
/// tasks (click to switch), then Open / Quit. Rebuilt on every state change.
fn build_tray_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let state = app.state::<AppState>();
    let active = state.run.lock().unwrap().active_task_id.clone();
    let tasks = state.db.lock().unwrap().tasks().unwrap_or_default();
    let lists = state.db.lock().unwrap().lists().unwrap_or_default();
    let recent = state.db.lock().unwrap().recent_task_ids(12);

    let mut owned: Vec<Box<dyn IsMenuItem<tauri::Wry>>> = Vec::new();

    if let Some(id) = &active {
        if let Some(t) = tasks.iter().find(|x| &x.id == id) {
            owned.push(Box::new(MenuItem::with_id(app, "current", format!("♪  {}", t.name), false, None::<&str>)?));
        }
    }
    owned.push(Box::new(MenuItem::with_id(
        app, "toggle", if active.is_some() { "Pause" } else { "Play" }, true, None::<&str>,
    )?));

    // up to 3 recently played, skipping the current and completed tasks
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
        if recents.len() >= 3 {
            break;
        }
    }
    if !recents.is_empty() {
        owned.push(Box::new(PredefinedMenuItem::separator(app)?));
        owned.push(Box::new(MenuItem::with_id(app, "rec_hd", "Recently played", false, None::<&str>)?));
        for t in &recents {
            let emoji = lists.iter().find(|l| l.id == t.list_id).map(|l| l.emoji.as_str()).unwrap_or("");
            owned.push(Box::new(MenuItem::with_id(
                app, format!("recent:{}", t.id), format!("{}  {}", emoji, t.name), true, None::<&str>,
            )?));
        }
    }

    owned.push(Box::new(PredefinedMenuItem::separator(app)?));
    owned.push(Box::new(MenuItem::with_id(app, "open", "Open TaskPlayer", true, None::<&str>)?));
    owned.push(Box::new(PredefinedMenuItem::separator(app)?));
    owned.push(Box::new(PredefinedMenuItem::quit(app, Some("Quit TaskPlayer"))?));

    let refs: Vec<&dyn IsMenuItem<tauri::Wry>> = owned.iter().map(|b| b.as_ref()).collect();
    Menu::with_items(app, &refs)
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // --- open the SQLite database in the OS app-data dir ---
            let dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir());
            std::fs::create_dir_all(&dir).ok();
            let db_path = dir.join("taskplayer.sqlite3");
            let db = Db::open(db_path.to_str().unwrap()).expect("failed to open database");
            let run = db.get_run();
            let config = db.get_config();
            app.manage(AppState {
                db: Mutex::new(db),
                run: Mutex::new(run),
                config: Mutex::new(config),
            });

            // --- menu-bar tray ---
            let menu = build_tray_menu(app.handle())?;

            let tray = TrayIconBuilder::with_id("tray")
                .icon(tauri::include_image!("icons/menubar.png"))
                .icon_as_template(true)
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| {
                    let id = event.id().as_ref();
                    if let Some(task_id) = id.strip_prefix("recent:") {
                        let state = app.state::<AppState>();
                        do_play(state.inner(), task_id);
                        push(app);
                        return;
                    }
                    match id {
                    "open" => open_main(app.clone()),
                    "toggle" => {
                        let state = app.state::<AppState>();
                        let active = state.run.lock().unwrap().active_task_id.is_some();
                        if active {
                            do_stop(state.inner());
                        } else {
                            // resume the remembered task if it still exists, else the first task
                            let last = state.run.lock().unwrap().last_task_id.clone();
                            let target = {
                                let db = state.db.lock().unwrap();
                                let tasks = db.tasks().unwrap_or_default();
                                last.filter(|id| tasks.iter().any(|t| &t.id == id && t.completed_at.is_none()))
                                    .or_else(|| tasks.iter().find(|t| t.completed_at.is_none()).map(|t| t.id.clone()))
                            };
                            if let Some(id) = target {
                                do_play(state.inner(), &id);
                            }
                        }
                        push(app);
                    }
                    _ => {}
                    }
                });
            tray.build(app)?;

            // --- 1s background loop: pomodoro transitions + tray refresh ---
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_millis(1000));
                let state = handle.state::<AppState>();
                let now = now_ms();
                let (run, config) = {
                    (
                        state.run.lock().unwrap().clone(),
                        state.config.lock().unwrap().clone(),
                    )
                };
                let (nr, t) = timer::tick(&run, &config, now);
                let mut transitioned = false;
                match t {
                    timer::Tick::None => {}
                    timer::Tick::ToBreak(log) => {
                        // lock order run -> db (matches command handlers) to avoid deadlock
                        let run_clone = {
                            let mut r = state.run.lock().unwrap();
                            *r = nr;
                            r.clone()
                        };
                        let db = state.db.lock().unwrap();
                        let _ = db.add_session(&log);
                        let _ = db.set_run(&run_clone);
                        transitioned = true;
                    }
                    timer::Tick::ToWork => {
                        let run_clone = {
                            let mut r = state.run.lock().unwrap();
                            *r = nr;
                            r.clone()
                        };
                        let _ = state.db.lock().unwrap().set_run(&run_clone);
                        transitioned = true;
                    }
                }
                if transitioned {
                    push(&handle);
                } else {
                    refresh(&handle);
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            // keep the app alive in the menu bar when the main window is closed
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_snapshot,
            add_list,
            rename_list,
            delete_list,
            add_task,
            rename_task,
            set_depth,
            set_estimate,
            set_done,
            set_description,
            move_task,
            delete_task,
            add_session,
            delete_session,
            export_data,
            import_data,
            play,
            stop,
            skip_break,
            set_mode,
            set_config_field,
            open_main
        ])
        .run(tauri::generate_context!())
        .expect("error while running TaskPlayer");
}
