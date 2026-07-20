use super::super::*;

#[derive(serde::Serialize)]
struct Backup {
    app: &'static str,
    version: u32,
    #[serde(rename = "exportedAt")]
    exported_at: i64,
    lists: Vec<TaskList>,
    tasks: Vec<Task>,
    sessions: Vec<Session>,
    planned_sessions: Vec<PlannedSession>,
    config: SessionConfig,
}

#[derive(serde::Deserialize)]
struct RestorePayload {
    lists: Vec<TaskList>,
    tasks: Vec<Task>,
    sessions: Vec<Session>,
    #[serde(default)]
    planned_sessions: Vec<PlannedSession>,
    config: Option<SessionConfig>,
}

#[specta::specta]
#[tauri::command]
pub(crate) fn export_data(state: State<AppState>) -> Result<String, String> {
    let backup = {
        let db = state.db.lock().unwrap();
        Backup {
            app: "TaskPlayer",
            version: 2,
            exported_at: now_ms(),
            lists: db.lists().map_err(|e| e.to_string())?,
            tasks: db.tasks().map_err(|e| e.to_string())?,
            sessions: db.sessions().map_err(|e| e.to_string())?,
            planned_sessions: db.planned_sessions().map_err(|e| e.to_string())?,
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
            &data.planned_sessions,
            data.config.as_ref(),
        )
        .map_err(|e| e.to_string())?;
    }
    reset_run_after_import(state.inner());
    {
        // As in `build_snapshot`, do not hold `db` while taking `config`:
        // settings commands persist in config -> db order.
        let imported_config = state.db.lock().unwrap().get_config();
        *state.config.lock().unwrap() = imported_config;
    }
    push(&app);
    Ok(build_snapshot(state.inner()))
}
