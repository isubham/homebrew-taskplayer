use super::*;

// ---- timer mutations (lock order: run -> db) ----
pub(crate) fn do_play(state: &AppState, task_id: &str, trigger: &str) {
    let now = now_ms();
    let mut run = state.run.lock().unwrap();
    let previous = run.clone();

    // Taking over a session another device is actively mid-flight on, for
    // the SAME task — continue in place (keep running_start/break_start)
    // rather than restarting the clock at 0:00. Spotify-style "play here"
    // resumes the same position; it doesn't replay the track from the top.
    // Only applies to "work"/"break" (a real countdown in progress) — an
    // "awaiting_break"/"awaiting_work" mirror falls through to the normal
    // fresh-start path below, since there's no live countdown to preserve.
    // See docs/session-sync-design.md §4.4.
    if !is_own(&run, &state.device_id)
        && run.active_task_id.as_deref() == Some(task_id)
        && matches!(run.phase.as_deref(), Some("work") | Some("break"))
    {
        let mut nr = run.clone();
        stamp_own(&mut nr, &state.device_id, &state.device_name);
        *run = nr;
        let _ = state.db.lock().unwrap().set_run(&run);
        return;
    }

    let baseline = as_local_baseline(&run, &state.device_id);
    let (mut nr, log) = timer::play(&baseline, task_id, now);
    let pause_reason = previous.active_task_id.as_deref().and_then(|active_id| {
        if nr.active_task_id.is_none() {
            Some(TIMER_PAUSE_REASON_SAME_TASK_TOGGLE)
        } else if active_id != task_id {
            Some(TIMER_PAUSE_REASON_TASK_SWITCH)
        } else {
            None
        }
    });
    stamp_own(&mut nr, &state.device_id, &state.device_name);
    *run = nr;
    let db = state.db.lock().unwrap();
    let session_result = log.as_ref().map(|item| db.add_session(item));
    let run_result = db.set_run(&run);
    if let Some(reason) = pause_reason {
        let session_status = session_result
            .as_ref()
            .map(timer_write_status)
            .unwrap_or_else(|| TIMER_WRITE_STATUS_NOT_APPLICABLE.to_string());
        let run_status = timer_write_status(&run_result);
        drop(db);
        log_timer_pause(
            state,
            reason,
            trigger,
            &previous,
            now,
            &session_status,
            &run_status,
        );
    }
}

pub(crate) fn do_stop(state: &AppState, reason: &str, trigger: &str) {
    do_stop_at(state, now_ms(), reason, trigger);
}

/// Same as `do_stop`, but logs the work segment as ending at `at_ms` instead
/// of "right now". Used when we detect the machine was asleep: the session
/// gets closed out at the last moment we know it was actually awake, so the
/// time spent asleep never gets counted as tracked work.
pub(crate) fn do_stop_at(state: &AppState, at_ms: i64, reason: &str, trigger: &str) {
    persist_stop(state, at_ms, reason, trigger, None);
}

pub(crate) fn do_stop_after_confirmed_sleep(
    state: &AppState,
    sleep_started_at: i64,
    sleep_interval_ms: i64,
) {
    persist_stop(
        state,
        sleep_started_at,
        TIMER_PAUSE_REASON_SYSTEM_SLEEP,
        TIMER_PAUSE_TRIGGER_MACOS_WORKSPACE,
        Some(sleep_interval_ms),
    );
}

fn persist_stop(
    state: &AppState,
    at_ms: i64,
    reason: &str,
    trigger: &str,
    sleep_interval_ms: Option<i64>,
) {
    let mut run = state.run.lock().unwrap();
    let previous = run.clone();
    let baseline = as_local_baseline(&run, &state.device_id);
    let (mut nr, log) = timer::stop(&baseline, at_ms);
    stamp_own(&mut nr, &state.device_id, &state.device_name);
    *run = nr;
    let db = state.db.lock().unwrap();
    let session_result = log.as_ref().map(|item| db.add_session(item));
    let run_result = db.set_run(&run);
    let session_status = session_result
        .as_ref()
        .map(timer_write_status)
        .unwrap_or_else(|| TIMER_WRITE_STATUS_NOT_APPLICABLE.to_string());
    let run_status = timer_write_status(&run_result);
    drop(db);
    if let Some(interval_ms) = sleep_interval_ms {
        log_timer_pause_after_sleep(
            state,
            reason,
            trigger,
            &previous,
            at_ms,
            interval_ms,
            &session_status,
            &run_status,
        );
    } else {
        log_timer_pause(
            state,
            reason,
            trigger,
            &previous,
            at_ms,
            &session_status,
            &run_status,
        );
    }
}

pub(crate) fn reset_run_after_import(state: &AppState) {
    let mut run = state.run.lock().unwrap();
    let previous = run.clone();
    *run = RunState::default();
    let db = state.db.lock().unwrap();
    let run_result = db.set_run(&run);
    let run_status = timer_write_status(&run_result);
    drop(db);
    if previous.active_task_id.is_some() {
        log_timer_pause(
            state,
            TIMER_PAUSE_REASON_DATA_IMPORT,
            TIMER_PAUSE_TRIGGER_IMPORT_DATA,
            &previous,
            now_ms(),
            TIMER_WRITE_STATUS_NOT_APPLICABLE,
            &run_status,
        );
    }
}
