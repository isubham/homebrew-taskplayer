use super::super::*;

#[specta::specta]
#[tauri::command]
pub(crate) fn play(
    app: AppHandle,
    state: State<AppState>,
    task_id: String,
    trigger: Option<String>,
) -> Snapshot {
    do_play(
        state.inner(),
        &task_id,
        trigger
            .as_deref()
            .unwrap_or(TIMER_PAUSE_TRIGGER_FRONTEND_PLAY),
    );
    push(&app);
    build_snapshot(state.inner())
}

#[specta::specta]
#[tauri::command]
pub(crate) fn stop(app: AppHandle, state: State<AppState>) -> Snapshot {
    do_stop(
        state.inner(),
        TIMER_PAUSE_REASON_EXPLICIT_STOP,
        TIMER_PAUSE_TRIGGER_FRONTEND_STOP,
    );
    push(&app);
    build_snapshot(state.inner())
}

#[specta::specta]
#[tauri::command]
pub(crate) fn skip_break(app: AppHandle, state: State<AppState>) -> Snapshot {
    {
        let now = now_ms();
        let mut run = state.run.lock().unwrap();
        let baseline = as_local_baseline(&run, &state.device_id);
        let mut nr = timer::skip_break(&baseline, now);
        stamp_own(&mut nr, &state.device_id, &state.device_name);
        *run = nr;
        let db = state.db.lock().unwrap();
        let _ = db.set_run(&run);
    }
    push(&app);
    build_snapshot(state.inner())
}

/// Backward-compatible recovery for an `awaiting_break` state written by app
/// versions that paused at Pomodoro boundaries. New cycles start breaks in
/// `timer::tick` and never need this command.
#[specta::specta]
#[tauri::command]
pub(crate) fn start_break(app: AppHandle, state: State<AppState>) -> Snapshot {
    {
        let now = now_ms();
        let mut run = state.run.lock().unwrap();
        let baseline = as_local_baseline(&run, &state.device_id);
        let mut nr = timer::start_break(&baseline, now);
        stamp_own(&mut nr, &state.device_id, &state.device_name);
        *run = nr;
        let db = state.db.lock().unwrap();
        let _ = db.set_run(&run);
    }
    push(&app);
    build_snapshot(state.inner())
}

/// Backward-compatible recovery for an `awaiting_work` state written by app
/// versions that paused at Pomodoro boundaries. New cycles resume work in
/// `timer::tick`; `skip_break` remains the normal early-break action.
#[specta::specta]
#[tauri::command]
pub(crate) fn resume_work(app: AppHandle, state: State<AppState>) -> Snapshot {
    {
        let now = now_ms();
        let mut run = state.run.lock().unwrap();
        let baseline = as_local_baseline(&run, &state.device_id);
        let mut nr = timer::skip_break(&baseline, now);
        stamp_own(&mut nr, &state.device_id, &state.device_name);
        *run = nr;
        let db = state.db.lock().unwrap();
        let _ = db.set_run(&run);
    }
    push(&app);
    build_snapshot(state.inner())
}
