use super::*;

// ---- timer mutations (lock order: run -> db) ----
pub(crate) fn do_play(state: &AppState, task_id: &str, trigger: &str) -> Result<(), String> {
    let now = now_ms();
    let mut run = state.run.lock().unwrap();
    let previous = run.clone();

    // Taking over a session another device is actively mid-flight on, for
    // the SAME task — continue in place (keep running_start/break_start)
    // rather than restarting the clock at 0:00. Spotify-style "play here"
    // resumes the same position; it doesn't replay the track from the top.
    // Only this branch applies to "work"/"break" so their original phase
    // timestamps survive. A paused/legacy awaiting state resumes focus in
    // the same logical session in the branch below.
    // See docs/session-sync-design.md §4.4.
    if !is_own(&run, &state.device_id)
        && run.active_task_id.as_deref() == Some(task_id)
        && matches!(run.phase.as_deref(), Some("work") | Some("break"))
    {
        let mut nr = run.clone();
        if nr.active_session_id.is_none() {
            nr.active_session_id = Some(taskplayer_core::new_id());
        }
        stamp_own(&mut nr, &state.device_id, &state.device_name);
        *run = nr;
        let _ = state.db.lock().unwrap().set_run(&run);
        return Ok(());
    }

    let open_task_id = run
        .active_task_id
        .as_deref()
        .or(run.last_task_id.as_deref());
    if !is_own(&run, &state.device_id)
        && run.active_session_id.is_some()
        && open_task_id == Some(task_id)
    {
        let mut next = timer::resume(&run, task_id, now);
        stamp_own(&mut next, &state.device_id, &state.device_name);
        *run = next;
        let _ = state.db.lock().unwrap().set_run(&run);
        return Ok(());
    }
    if run.active_session_id.is_some() && open_task_id != Some(task_id) {
        return Err(ONGOING_SESSION_TASK_CONFLICT_MSG.to_string());
    }

    let baseline = as_local_baseline(&run, &state.device_id);
    let session_task_id = baseline
        .active_task_id
        .as_deref()
        .or(baseline.last_task_id.as_deref());
    if baseline.active_session_id.is_some() && session_task_id != Some(task_id) {
        return Err(ONGOING_SESSION_TASK_CONFLICT_MSG.to_string());
    }
    let (mut nr, log, pause_reason) =
        if baseline.active_task_id.as_deref() == Some(task_id) && baseline.phase.is_some() {
            let (next, log) = timer::pause(&baseline, now);
            (next, log, Some(TIMER_PAUSE_REASON_SAME_TASK_TOGGLE))
        } else if baseline.active_session_id.is_some() {
            (timer::resume(&baseline, task_id, now), None, None)
        } else {
            (
                timer::begin(&baseline, task_id, &taskplayer_core::new_id(), now),
                None,
                None,
            )
        };
    stamp_own(&mut nr, &state.device_id, &state.device_name);
    *run = nr;
    let db = state.db.lock().unwrap();
    let session_result = log
        .as_ref()
        .map(|item| db.add_session_interval(item, previous.active_session_id.as_deref(), None));
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
    Ok(())
}

pub(crate) fn do_finish_session(state: &AppState, at_ms: i64) {
    let mut run = state.run.lock().unwrap();
    let logical_session_id = run.active_session_id.clone();
    let session_task_id = run
        .active_task_id
        .clone()
        .or_else(|| run.last_task_id.clone());
    let owned = is_own(&run, &state.device_id);
    let baseline = as_local_baseline(&run, &state.device_id);
    let (mut next, log) = timer::finish(&baseline, at_ms);
    stamp_own(&mut next, &state.device_id, &state.device_name);
    *run = next;
    let db = state.db.lock().unwrap();
    if let Some(logical_session_id) = logical_session_id.as_deref() {
        if owned {
            if let Some(segment) = log.as_ref() {
                let _ = db.add_session_interval(segment, Some(logical_session_id), Some(at_ms));
            }
        }
        let finished_rows = db
            .finish_logical_session(logical_session_id, at_ms)
            .unwrap_or(0);
        if finished_rows == 0 {
            if let Some(task_id) = session_task_id {
                let _ = db.add_session_interval(
                    &taskplayer_core::SessionLog {
                        task_id,
                        start: at_ms,
                        end: at_ms,
                    },
                    Some(logical_session_id),
                    Some(at_ms),
                );
            }
        }
    } else if let Some(segment) = log.as_ref() {
        let _ = db.add_session(segment);
    }
    let _ = db.set_run(&run);
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
