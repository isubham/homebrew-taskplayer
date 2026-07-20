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
pub(crate) fn delete_logical_session(
    app: AppHandle,
    state: State<AppState>,
    logical_session_id: String,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.delete_logical_session(&logical_session_id);
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
