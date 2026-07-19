use super::super::*;

#[specta::specta]
#[tauri::command]
pub(crate) fn add_session(
    app: AppHandle,
    state: State<AppState>,
    task_id: String,
    start: f64,
    end: f64,
) -> Result<Snapshot, String> {
    let (start, end, now) = (start as i64, end as i64, now_ms());
    if end <= start || end > now {
        return Err(RECORDED_SESSION_INVALID_MSG.to_string());
    }
    {
        let run = state.run.lock().unwrap();
        if run.phase.as_deref() == Some(RUN_PHASE_WORK)
            && run
                .running_start
                .is_some_and(|active_start| start < now && end > active_start)
        {
            return Err(RECORDED_SESSION_OVERLAP_MSG.to_string());
        }
        let db = state.db.lock().unwrap();
        let saved = db
            .add_recorded_session(
                &taskplayer_core::SessionLog {
                    task_id,
                    start,
                    end,
                },
                now,
            )
            .map_err(|error| error.to_string())?;
        if saved.is_none() {
            return Err(RECORDED_SESSION_OVERLAP_MSG.to_string());
        }
    }
    push(&app);
    Ok(build_snapshot(state.inner()))
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
    task_id: Option<String>,
    start: f64,
    end: f64,
) -> Result<Snapshot, String> {
    let (start, end, now) = (start as i64, end as i64, now_ms());
    if end <= start || end > now {
        return Err(RECORDED_SESSION_INVALID_MSG.to_string());
    }
    {
        let run = state.run.lock().unwrap();
        if run.phase.as_deref() == Some(RUN_PHASE_WORK)
            && run
                .running_start
                .is_some_and(|active_start| start < now && end > active_start)
        {
            return Err(RECORDED_SESSION_OVERLAP_MSG.to_string());
        }
        let db = state.db.lock().unwrap();
        let saved = db
            .update_recorded_session(&id, task_id.as_deref(), start, end, now)
            .map_err(|error| error.to_string())?;
        if !saved {
            return Err(RECORDED_SESSION_OVERLAP_MSG.to_string());
        }
    }
    push(&app);
    Ok(build_snapshot(state.inner()))
}

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
