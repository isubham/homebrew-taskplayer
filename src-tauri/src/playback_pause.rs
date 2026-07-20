use super::*;

pub(crate) fn do_stop(state: &AppState, reason: &str, trigger: &str) {
    do_stop_at(state, now_ms(), reason, trigger);
}

/// Same as `do_stop`, but stores the focus interval as ending at `at_ms`
/// instead of right now. Confirmed sleep uses the last known awake moment so
/// time spent asleep becomes a break inside the still-open logical session.
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
    let (mut next, log) = timer::pause(&baseline, at_ms);
    stamp_own(&mut next, &state.device_id, &state.device_name);
    *run = next;
    let db = state.db.lock().unwrap();
    let session_result = log
        .as_ref()
        .map(|item| db.add_session_interval(item, previous.active_session_id.as_deref(), None));
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
