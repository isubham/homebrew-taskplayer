use super::super::super::*;
#[specta::specta]
#[tauri::command]
pub(crate) fn add_task(
    app: AppHandle,
    state: State<AppState>,
    list_id: String,
    name: String,
    estimate_min: Option<i32>,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.add_task(
            &list_id,
            &name,
            estimate_min.map(|m| m as i64).filter(|m| *m > 0),
        );
    }
    push(&app);
    build_snapshot(state.inner())
}
#[specta::specta]
#[tauri::command]
pub(crate) fn rename_task(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    name: String,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.rename_task(&id, &name);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[specta::specta]
#[tauri::command]
pub(crate) fn set_depth(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    depth: Option<String>,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.set_depth(&id, depth.as_deref());
    }
    push(&app);
    build_snapshot(state.inner())
}

#[specta::specta]
#[tauri::command]
pub(crate) fn set_cadence(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    cadence: Option<String>,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.set_cadence(&id, cadence.as_deref());
    }
    push(&app);
    build_snapshot(state.inner())
}

#[specta::specta]
#[tauri::command]
pub(crate) fn set_daily_windows(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    windows: Vec<taskplayer_core::WeeklyTimeWindow>,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.set_daily_windows(&id, &windows);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[specta::specta]
#[tauri::command]
pub(crate) fn set_session_range(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    min_minutes: Option<i32>,
    max_minutes: Option<i32>,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.set_session_range(
            &id,
            min_minutes.map(|m| m as i64).filter(|minutes| *minutes > 0),
            max_minutes.map(|m| m as i64).filter(|minutes| *minutes > 0),
        );
    }
    push(&app);
    build_snapshot(state.inner())
}

#[specta::specta]
#[tauri::command]
pub(crate) fn set_description(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    text: Option<String>,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let trimmed = text.as_deref().map(str::trim).filter(|s| !s.is_empty());
        let _ = db.set_description(&id, trimmed);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[specta::specta]
#[tauri::command]
pub(crate) fn set_album(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    album: Option<String>,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.set_album(&id, album.as_deref());
    }
    push(&app);
    build_snapshot(state.inner())
}

#[specta::specta]
#[tauri::command]
pub(crate) fn move_task(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    list_id: String,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.move_task(&id, &list_id);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[specta::specta]
#[tauri::command]
pub(crate) fn reorder_tasks(
    app: AppHandle,
    state: State<AppState>,
    list_id: String,
    ordered_ids: Vec<String>,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.reorder_tasks(&list_id, &ordered_ids);
    }
    push(&app);
    build_snapshot(state.inner())
}
