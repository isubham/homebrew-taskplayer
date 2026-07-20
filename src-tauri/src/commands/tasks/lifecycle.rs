use super::super::super::*;
use super::super::reset_run_if_orphaned;

#[specta::specta]
#[tauri::command]
pub(crate) fn reorder_lists(
    app: AppHandle,
    state: State<AppState>,
    ordered_ids: Vec<String>,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.reorder_lists(&ordered_ids);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[specta::specta]
#[tauri::command]
pub(crate) fn reorder_life_areas(
    app: AppHandle,
    state: State<AppState>,
    ordered_area_keys: Vec<String>,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.reorder_life_areas(&ordered_area_keys);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[specta::specta]
#[tauri::command]
pub(crate) fn set_done(app: AppHandle, state: State<AppState>, id: String) -> Snapshot {
    // Completing the task finishes its ongoing logical session first.
    // The open-session check must be computed in its own `let` statement —
    // binding it here drops the `state.run` MutexGuard immediately. Inlining
    // the lock directly into the `if` condition would keep that temporary
    // guard alive for the whole if-body (Rust extends a temporary's scope to
    // the enclosing statement, which for `if cond { block }` used as a
    // statement is the entire construct), so `do_finish_session`'s own `state.run.lock()`
    // below would deadlock against itself whenever the task being completed
    // is the one currently running.
    let has_open_session = {
        let run = state.run.lock().unwrap();
        run.active_session_id.is_some()
            && run
                .active_task_id
                .as_deref()
                .or(run.last_task_id.as_deref())
                == Some(id.as_str())
    };
    if has_open_session {
        do_finish_session(state.inner(), now_ms());
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

#[specta::specta]
#[tauri::command]
pub(crate) fn set_estimate(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    minutes: Option<i32>,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.set_estimate(&id, minutes.map(|m| m as i64).filter(|m| *m > 0));
    }
    push(&app);
    build_snapshot(state.inner())
}

#[specta::specta]
#[tauri::command]
pub(crate) fn set_deadline(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    deadline_at: Option<f64>,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.set_deadline(&id, deadline_at.map(|d| d as i64));
    }
    push(&app);
    build_snapshot(state.inner())
}

#[specta::specta]
#[tauri::command]
pub(crate) fn set_task_impact(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    tier: Option<String>,
    sign: i32,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        // Sign only ever comes from the frontend's own 2-button toggle
        // (for/against — see the Impact & areas editor in render.js), so
        // clamping here rather than trusting it verbatim keeps a stray
        // value (0, a typo'd payload, etc.) from silently zeroing out every
        // jewel computation downstream instead of just doing nothing.
        let sign_i64 = if sign < 0 { -1 } else { 1 };
        let _ = db.set_task_impact(&id, tier.as_deref(), sign_i64);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[specta::specta]
#[tauri::command]
pub(crate) fn delete_task(app: AppHandle, state: State<AppState>, id: String) -> Snapshot {
    // See the comment in `set_done`: the guard must drop before Finish
    // acquires the run lock again.
    let has_open_session = {
        let run = state.run.lock().unwrap();
        run.active_session_id.is_some()
            && run
                .active_task_id
                .as_deref()
                .or(run.last_task_id.as_deref())
                == Some(id.as_str())
    };
    if has_open_session {
        do_finish_session(state.inner(), now_ms());
    }
    {
        let db = state.db.lock().unwrap();
        let _ = db.delete_task(&id);
    }
    reset_run_if_orphaned(state.inner(), TIMER_PAUSE_TRIGGER_TASK_DELETE);
    push(&app);
    build_snapshot(state.inner())
}
