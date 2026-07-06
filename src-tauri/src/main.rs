// TaskPlayer — macOS menu-bar deep-work timer (Tauri v2 shell around taskplayer-core).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;
mod config;
mod sync;

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;

use taskplayer_core::models::now_ms;
use taskplayer_core::{
    task_total_ms, timer, AccountInfo, Db, RunState, Session, SessionConfig, Snapshot, Status,
    Task, TaskList,
};

struct AppState {
    db: Mutex<Db>,
    run: Mutex<RunState>,
    config: Mutex<SessionConfig>,
    /// PKCE verifier for the in-flight sign-in attempt, if any. Only one
    /// sign-in flow happens at a time, so a single slot is enough.
    pending_pkce: Mutex<Option<auth::Pkce>>,
    /// Current Supabase session access token, if signed in. The refresh
    /// token lives in `data_dir/session.json` (see auth.rs), never here.
    access_token: Mutex<Option<String>>,
    sync_status: Mutex<SyncStatus>,
    /// Whether the focus-music widget is currently playing. Mirrored from
    /// the frontend (music.js's `<audio>` element lives entirely in the
    /// webview, Rust has no direct visibility into it) via the
    /// `set_music_playing` command, purely so the tray menu's music toggle
    /// label can read "Pause music" vs. "Play music" correctly.
    music_playing: Mutex<bool>,
    /// OS app-data directory — also where the SQLite file and session.json live.
    data_dir: PathBuf,
}

#[derive(Clone, Default)]
struct SyncStatus {
    syncing: bool,
    last_synced_at: Option<i64>,
}

// ---- snapshot / status builders ----
fn build_snapshot(state: &AppState) -> Snapshot {
    let db = state.db.lock().unwrap();
    let sync_status = state.sync_status.lock().unwrap().clone();
    Snapshot {
        lists: db.lists().unwrap_or_default(),
        tasks: db.tasks().unwrap_or_default(),
        sessions: db.sessions().unwrap_or_default(),
        config: state.config.lock().unwrap().clone(),
        run: state.run.lock().unwrap().clone(),
        account: db.get_account(),
        syncing: sync_status.syncing,
        last_synced_at: sync_status.last_synced_at,
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

/// Format milliseconds as "1h 05m" / "1h" / "45m", matching the frontend's fmtHM.
fn format_hm(ms: i64) -> String {
    let minutes = ms / 60_000;
    let hours = minutes / 60;
    let remainder = minutes % 60;
    if hours > 0 {
        if remainder > 0 {
            format!("{}h {}m", hours, remainder)
        } else {
            format!("{}h", hours)
        }
    } else {
        format!("{}m", minutes)
    }
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
                Some("break") => Some(format!(" {} · ☕ {}", name, format_hm(status.elapsed_ms))),
                _ => Some(format!(" {} · {}", name, format_hm(status.elapsed_ms))),
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
    do_stop_at(state, now_ms());
}

/// Same as `do_stop`, but logs the work segment as ending at `at_ms` instead
/// of "right now". Used when we detect the machine was asleep: the session
/// gets closed out at the last moment we know it was actually awake, so the
/// time spent asleep never gets counted as tracked work.
fn do_stop_at(state: &AppState, at_ms: i64) {
    let mut run = state.run.lock().unwrap();
    let (nr, log) = timer::stop(&run, at_ms);
    *run = nr;
    let db = state.db.lock().unwrap();
    if let Some(l) = log {
        let _ = db.add_session(&l);
    }
    let _ = db.set_run(&run);
}

/// Common tail of both the sign-in callback and the startup silent refresh:
/// persist the refresh token, remember the access token in memory, cache
/// the profile, and notify the frontend.
fn apply_session(app: &AppHandle, session: auth::Session) {
    let state = app.state::<AppState>();
    if let Err(e) = auth::save_refresh_token(&state.data_dir, &session.refresh_token) {
        // Not fatal — this run stays signed in via the in-memory access
        // token; the user will just be prompted to sign in again next
        // launch if the write never succeeds (e.g. a full disk).
        eprintln!("failed to save the refresh token: {e}");
    }
    *state.access_token.lock().unwrap() = Some(session.access_token);
    {
        let db = state.db.lock().unwrap();
        let _ = db.set_account(Some(&session.account));
    }
    push(app);
    run_sync(app);
}

/// Runs one push+pull cycle if signed in; no-ops silently otherwise. Safe to
/// call from a background thread (it blocks on network I/O) — every caller
/// here already runs on one, never the main/event thread.
fn run_sync(app: &AppHandle) {
    let state = app.state::<AppState>();
    let Some(access_token) = state.access_token.lock().unwrap().clone() else { return };
    let Some(user_id) = state.db.lock().unwrap().get_account().map(|a| a.id) else { return };

    state.sync_status.lock().unwrap().syncing = true;
    push(app);

    let result = {
        let db = state.db.lock().unwrap();
        sync::sync_once(&db, &access_token, &user_id)
    };

    {
        let mut status = state.sync_status.lock().unwrap();
        status.syncing = false;
        status.last_synced_at = Some(now_ms());
    }

    if let Err(e) = &result {
        eprintln!("sync failed: {e}");
    }
    push(app);
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
fn add_task(app: AppHandle, state: State<AppState>, list_id: String, name: String, estimate_min: Option<i64>) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.add_task(&list_id, &name, estimate_min.filter(|m| *m > 0));
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
fn set_album(app: AppHandle, state: State<AppState>, id: String, album: Option<String>) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.set_album(&id, album.as_deref());
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
fn reorder_tasks(app: AppHandle, state: State<AppState>, list_id: String, ordered_ids: Vec<String>) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.reorder_tasks(&list_id, &ordered_ids);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn reorder_lists(app: AppHandle, state: State<AppState>, ordered_ids: Vec<String>) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.reorder_lists(&ordered_ids);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn set_done(app: AppHandle, state: State<AppState>, id: String) -> Snapshot {
    // completing the active task stops its timer first (logs the segment).
    // The `is_active` bool must be computed in its own `let` statement —
    // binding it here drops the `state.run` MutexGuard immediately. Inlining
    // the lock directly into the `if` condition would keep that temporary
    // guard alive for the whole if-body (Rust extends a temporary's scope to
    // the enclosing statement, which for `if cond { block }` used as a
    // statement is the entire construct), so `do_stop`'s own `state.run.lock()`
    // below would deadlock against itself whenever the task being completed
    // is the one currently running.
    let is_active = state.run.lock().unwrap().active_task_id.as_deref() == Some(id.as_str());
    if is_active {
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

#[tauri::command]
fn update_session(app: AppHandle, state: State<AppState>, id: String, start: i64, end: i64) -> Snapshot {
    if end > start {
        let db = state.db.lock().unwrap();
        let _ = db.update_session(&id, start, end);
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
    // see the comment in `set_done` — this bool must be its own `let`
    // statement so the `state.run` guard drops before `do_stop` re-locks it.
    let is_active = state.run.lock().unwrap().active_task_id.as_deref() == Some(id.as_str());
    if is_active {
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

/// Opens the system browser to Google's consent screen and returns
/// immediately — the deep-link callback (registered in `setup()`) drives
/// the rest of the flow asynchronously and calls `push()` once signed in.
#[tauri::command]
fn sign_in_google(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    let pkce = auth::generate_pkce();
    let url = auth::authorize_url(&pkce);
    *state.pending_pkce.lock().unwrap() = Some(pkce);
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
fn sign_out(app: AppHandle, state: State<AppState>) -> Snapshot {
    auth::clear_refresh_token(&state.data_dir);
    *state.access_token.lock().unwrap() = None;
    *state.sync_status.lock().unwrap() = SyncStatus::default();
    {
        let db = state.db.lock().unwrap();
        let _ = db.set_account(None::<&AccountInfo>);
    }
    push(&app);
    build_snapshot(state.inner())
}

/// Fire-and-forget, like `sign_in_google` — the eventual `push()`/`refresh()`
/// inside `run_sync` notifies the frontend once the sync finishes.
#[tauri::command]
fn sync_now(app: AppHandle) {
    std::thread::spawn(move || run_sync(&app));
}

#[tauri::command]
fn open_main(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Mirrors the focus-music widget's play/pause state into Rust purely so the
/// tray's music toggle can show the right label — the actual `<audio>`
/// element lives in the webview (music.js), Rust never touches it directly.
/// The frontend calls this every time window.Music's own state changes.
#[tauri::command]
fn set_music_playing(app: AppHandle, state: State<AppState>, playing: bool) -> Snapshot {
    *state.music_playing.lock().unwrap() = playing;
    push(&app);
    build_snapshot(state.inner())
}

/// Opens a URL in the system's default browser — used by the in-app "View on
/// Audius" button (a plain `<a href>` would just navigate the app's own
/// webview away instead).
#[tauri::command]
fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
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

    // Focus-music controls — separate from the task Play/Pause above, since
    // the ambient music and the work timer are two different things a
    // person might want to control independently from the tray.
    owned.push(Box::new(PredefinedMenuItem::separator(app)?));
    let music_on = *state.music_playing.lock().unwrap();
    owned.push(Box::new(MenuItem::with_id(
        app, "music_toggle", if music_on { "⏸  Pause music" } else { "▶  Play music" }, true, None::<&str>,
    )?));
    owned.push(Box::new(MenuItem::with_id(app, "music_next", "⏭  Next track", true, None::<&str>)?));

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
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
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
                pending_pkce: Mutex::new(None),
                access_token: Mutex::new(None),
                sync_status: Mutex::new(SyncStatus::default()),
                music_playing: Mutex::new(false),
                data_dir: dir.clone(),
            });

            // --- Google Sign-In: deep-link callback + silent refresh on startup ---
            {
                let handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    let Some(url) = event.urls().first().cloned() else { return };
                    let Some(code) = auth::extract_code(url.as_str()) else { return };
                    let pkce = {
                        let state = handle.state::<AppState>();
                        let taken = state.pending_pkce.lock().unwrap().take();
                        taken
                    };
                    let Some(pkce) = pkce else {
                        eprintln!("received an OAuth callback with no sign-in in progress — ignoring");
                        return;
                    };
                    let handle2 = handle.clone();
                    std::thread::spawn(move || match auth::exchange_code(&code, &pkce.verifier) {
                        Ok(session) => apply_session(&handle2, session),
                        Err(e) => eprintln!("Google sign-in failed: {e}"),
                    });
                });
            }
            {
                let handle = app.handle().clone();
                let dir = dir.clone();
                std::thread::spawn(move || {
                    let Some(refresh_token) = auth::load_refresh_token(&dir) else { return };
                    if let Err(e) = auth::refresh_session(&refresh_token).map(|s| apply_session(&handle, s)) {
                        // Fail closed: never crash/hang on a missing or
                        // corrupt session file — just stay signed out.
                        eprintln!("silent session refresh failed, staying signed out: {e}");
                    }
                });
            }

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
                    // The actual <audio> element lives in the webview (music.js), so
                    // Rust can't play/pause/skip it directly — just forward the
                    // intent as an event and let the frontend act on it.
                    "music_toggle" => { let _ = app.emit("music-toggle", ()); }
                    "music_next" => { let _ = app.emit("music-next", ()); }
                    _ => {}
                    }
                });
            tray.build(app)?;

            // --- 1s background loop: pomodoro transitions + tray refresh ---
            // Also doubles as sleep/wake detection: this thread is suspended
            // along with the rest of the process while the Mac is asleep, so
            // a `sleep(1000)` that comes back having taken much longer than
            // 1s means the system was actually asleep (there's no reliable,
            // dependency-free "sleep" notification otherwise). When that
            // happens, and a task was running, we stop the clock as of the
            // last tick we know was real — so the nap never gets logged as
            // work — rather than at the (much later) wake-up time.
            const SLEEP_GAP_MS: i64 = 5_000;
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut last_seen = now_ms();
                loop {
                std::thread::sleep(Duration::from_millis(1000));
                let state = handle.state::<AppState>();
                let now = now_ms();
                let woke_from_sleep_at = last_seen;
                let gap = now - last_seen;
                last_seen = now;
                if gap > SLEEP_GAP_MS {
                    let was_working = state.run.lock().unwrap().phase.as_deref() == Some("work");
                    if was_working {
                        do_stop_at(state.inner(), woke_from_sleep_at);
                        push(&handle);
                    }
                }
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
                }
            });

            // --- 60s background loop: push/pull sync when signed in ---
            // Separate from the 1s loop above on purpose — that one is
            // tuned for a snappy pomodoro/tray refresh; this one does
            // blocking network I/O and would be wasteful (and rate-limit-y)
            // to run every second.
            let sync_handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_secs(60));
                run_sync(&sync_handle);
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            // keep the app alive in the menu bar when the main window is closed
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
            // Catches "I switched to my other laptop and back" without
            // shortening the 60s baseline interval for everyone else.
            if let WindowEvent::Focused(true) = event {
                let handle = window.app_handle().clone();
                std::thread::spawn(move || run_sync(&handle));
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_snapshot,
            add_list,
            rename_list,
            reorder_lists,
            delete_list,
            add_task,
            rename_task,
            set_depth,
            set_estimate,
            set_done,
            set_description,
            set_album,
            move_task,
            reorder_tasks,
            delete_task,
            add_session,
            update_session,
            delete_session,
            export_data,
            import_data,
            play,
            stop,
            skip_break,
            set_mode,
            set_config_field,
            sign_in_google,
            sign_out,
            sync_now,
            open_main,
            set_music_playing,
            open_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running TaskPlayer");
}
