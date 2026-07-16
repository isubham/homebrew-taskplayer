use super::super::*;

#[specta::specta]
#[tauri::command]
pub(crate) fn add_session(
    app: AppHandle,
    state: State<AppState>,
    task_id: String,
    start: f64,
    end: f64,
) -> Snapshot {
    if end > start {
        let db = state.db.lock().unwrap();
        let _ = db.add_session(&taskplayer_core::SessionLog {
            task_id,
            start: start as i64,
            end: end as i64,
        });
    }
    push(&app);
    build_snapshot(state.inner())
}
#[specta::specta]
#[tauri::command]
pub(crate) fn delete_session(app: AppHandle, state: State<AppState>, id: String) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.delete_session(&id);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[specta::specta]
#[tauri::command]
pub(crate) fn update_session(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    start: f64,
    end: f64,
) -> Snapshot {
    if end > start {
        let db = state.db.lock().unwrap();
        let _ = db.update_session(&id, start as i64, end as i64);
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
#[specta::specta]
#[tauri::command]
pub(crate) fn export_data(state: State<AppState>) -> Result<String, String> {
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
    let _ = std::process::Command::new("open")
        .arg("-R")
        .arg(&path)
        .status();
    Ok(path.to_string_lossy().into_owned())
}

/// Reveals `taskplayer.log` in Finder (creating an empty one first if
/// nothing's been logged yet), the same "open -R" pattern export_data uses —
/// so "attach your logs to a bug report" is a single click in Settings
/// instead of "go find ~/Library/Logs yourself." Returns the path so the
/// frontend can show it, in case Finder itself doesn't grab focus.
#[specta::specta]
#[tauri::command]
pub(crate) fn reveal_logs() -> Result<String, String> {
    std::fs::create_dir_all(log_dir()).map_err(|e| e.to_string())?;
    let path = log_file_path();
    if !path.exists() {
        std::fs::write(&path, "").map_err(|e| e.to_string())?;
    }
    let _ = std::process::Command::new("open")
        .arg("-R")
        .arg(&path)
        .status();
    Ok(path.to_string_lossy().into_owned())
}

/// Replace all data from a backup JSON string. Clears the run state so nothing
/// is left "playing" against tasks that may no longer exist.
#[specta::specta]
#[tauri::command]
pub(crate) fn import_data(
    app: AppHandle,
    state: State<AppState>,
    payload: String,
) -> Result<Snapshot, String> {
    let data: RestorePayload = serde_json::from_str(&payload)
        .map_err(|_| "That doesn't look like a TaskPlayer backup file.".to_string())?;
    {
        let db = state.db.lock().unwrap();
        db.import_replace(
            &data.lists,
            &data.tasks,
            &data.sessions,
            data.config.as_ref(),
        )
        .map_err(|e| e.to_string())?;
    }
    {
        let mut run = state.run.lock().unwrap();
        *run = RunState::default();
        let db = state.db.lock().unwrap();
        let _ = db.set_run(&run);
    }
    {
        // As in `build_snapshot`, do not hold `db` while taking `config`:
        // settings commands persist in config -> db order.
        let imported_config = state.db.lock().unwrap().get_config();
        *state.config.lock().unwrap() = imported_config;
    }
    push(&app);
    Ok(build_snapshot(state.inner()))
}
