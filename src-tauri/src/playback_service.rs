use super::*;

// ---- timer mutations (lock order: run -> db) ----
pub(crate) fn do_play(state: &AppState, task_id: &str) {
    let now = now_ms();
    let mut run = state.run.lock().unwrap();

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
    stamp_own(&mut nr, &state.device_id, &state.device_name);
    *run = nr;
    let db = state.db.lock().unwrap();
    if let Some(l) = log {
        let _ = db.add_session(&l);
    }
    let _ = db.set_run(&run);
}

pub(crate) fn do_stop(state: &AppState) {
    do_stop_at(state, now_ms());
}

/// Same as `do_stop`, but logs the work segment as ending at `at_ms` instead
/// of "right now". Used when we detect the machine was asleep: the session
/// gets closed out at the last moment we know it was actually awake, so the
/// time spent asleep never gets counted as tracked work.
pub(crate) fn do_stop_at(state: &AppState, at_ms: i64) {
    let mut run = state.run.lock().unwrap();
    let baseline = as_local_baseline(&run, &state.device_id);
    let (mut nr, log) = timer::stop(&baseline, at_ms);
    stamp_own(&mut nr, &state.device_id, &state.device_name);
    *run = nr;
    let db = state.db.lock().unwrap();
    if let Some(l) = log {
        let _ = db.add_session(&l);
    }
    let _ = db.set_run(&run);
}
