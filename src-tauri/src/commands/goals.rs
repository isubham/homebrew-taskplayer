use super::super::*;

#[specta::specta]
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub(crate) fn save_goal(
    app: AppHandle,
    state: State<AppState>,
    id: Option<String>,
    life_area: String,
    title: String,
    description: Option<String>,
    status: String,
    is_current_focus: bool,
    next_task_id: Option<String>,
    task_ids: Vec<String>,
) -> Result<Snapshot, String> {
    {
        let db = state.db.lock().unwrap();
        db.save_goal(
            id.as_deref(),
            &life_area,
            &title,
            description.as_deref(),
            &status,
            is_current_focus,
            next_task_id.as_deref(),
            &task_ids,
        )
        .map_err(|error| error.to_string())?;
    }
    push(&app);
    Ok(build_snapshot(state.inner()))
}

#[specta::specta]
#[tauri::command]
pub(crate) fn archive_goal(
    app: AppHandle,
    state: State<AppState>,
    id: String,
) -> Result<Snapshot, String> {
    {
        let db = state.db.lock().unwrap();
        db.archive_goal(&id).map_err(|error| error.to_string())?;
    }
    push(&app);
    Ok(build_snapshot(state.inner()))
}
