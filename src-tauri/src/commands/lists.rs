use super::super::*;
use super::reset_run_if_orphaned;

// ---- commands ----
#[specta::specta]
#[tauri::command]
pub(crate) fn get_snapshot(state: State<AppState>) -> Snapshot {
    build_snapshot(state.inner())
}
#[specta::specta]
#[tauri::command]
pub(crate) fn add_list(app: AppHandle, state: State<AppState>, name: String) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.add_list(&name);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[specta::specta]
#[tauri::command]
pub(crate) fn rename_list(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    name: String,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.rename_list(&id, &name);
    }
    let task_ids = state
        .db
        .lock()
        .unwrap()
        .tasks()
        .unwrap_or_default()
        .into_iter()
        .filter(|task| task.list_id == id)
        .map(|task| task.id)
        .collect::<Vec<_>>();
    for task_id in task_ids {
        reconcile_task_note(state.inner(), &task_id);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[specta::specta]
#[tauri::command]
pub(crate) fn set_list_style(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    emoji: String,
    color: String,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.set_list_style(&id, &emoji, &color);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[specta::specta]
#[tauri::command]
pub(crate) fn set_list_life_tag(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    area: Option<String>,
    direction: Option<String>,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.set_list_life_tag(&id, area.as_deref(), direction.as_deref());
    }
    let task_ids = state
        .db
        .lock()
        .unwrap()
        .tasks()
        .unwrap_or_default()
        .into_iter()
        .filter(|task| task.list_id == id)
        .map(|task| task.id)
        .collect::<Vec<_>>();
    for task_id in task_ids {
        reconcile_task_note(state.inner(), &task_id);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[specta::specta]
#[tauri::command]
pub(crate) fn set_list_availability(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    windows: Vec<taskplayer_core::WeeklyTimeWindow>,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.set_list_availability(&id, &windows);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[specta::specta]
#[tauri::command]
pub(crate) fn delete_list(
    app: AppHandle,
    state: State<AppState>,
    id: String,
) -> Result<Snapshot, String> {
    let task_ids = state
        .db
        .lock()
        .unwrap()
        .tasks()
        .map_err(|error| error.to_string())?
        .into_iter()
        .filter(|task| task.list_id == id)
        .map(|task| task.id)
        .collect::<Vec<_>>();
    let mut archived_task_ids = Vec::new();
    for task_id in &task_ids {
        if let Err(error) = archive_task_note(state.inner(), task_id) {
            for archived_task_id in archived_task_ids {
                reconcile_task_note(state.inner(), archived_task_id);
            }
            return Err(error);
        }
        archived_task_ids.push(task_id);
    }
    {
        let db = state.db.lock().unwrap();
        if let Err(error) = db.delete_list(&id) {
            drop(db);
            for task_id in task_ids {
                reconcile_task_note(state.inner(), &task_id);
            }
            return Err(error.to_string());
        }
    }
    reset_run_if_orphaned(state.inner(), TIMER_PAUSE_TRIGGER_LIST_DELETE);
    push(&app);
    Ok(build_snapshot(state.inner()))
}
