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
pub(crate) fn delete_list(app: AppHandle, state: State<AppState>, id: String) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.delete_list(&id);
    }
    reset_run_if_orphaned(state.inner());
    push(&app);
    build_snapshot(state.inner())
}
