use super::*;

// ---- cross-device session ownership (see docs/session-sync-design.md) ----

/// Best-effort human-readable device name ("Subham's MacBook Pro") for the
/// "Playing on ..." UI. `scutil --get ComputerName` is the same friendly
/// name shown in System Settings > Sharing — nicer than a raw hostname, and
/// needs no new dependency (matches this codebase's stated preference for a
/// small hand-rolled thing over a generic crate — see the top of sync.rs).
/// Never blocks the feature: falls back to a generic label if the command
/// fails or returns nothing for any reason.
pub(crate) fn device_name() -> String {
    std::process::Command::new("scutil")
        .args(["--get", "ComputerName"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "Mac".to_string())
}

/// Whether `run`'s live session belongs to this device. `None` covers a
/// pre-migration or freshly-reset `RunState` (e.g. right after
/// `import_data`) — treated as "ours", never as a foreign session, per
/// `RunState::device_id`'s doc comment in models.rs.
pub(crate) fn is_own(run: &RunState, device_id: &str) -> bool {
    run.device_id
        .as_deref()
        .map(|d| d == device_id)
        .unwrap_or(true)
}

/// Marks `run` as this device's own live session — stamps `device_id`/
/// `device_name` and bumps `updated_at` to now. Called after every LOCAL
/// play/stop/phase-transition (never inside `timer.rs`, which stays pure and
/// I/O-free) so the next push cycle picks the change up and other devices
/// can tell this session apart from their own. Deliberately unconditional
/// (not "only if it wasn't already ours") — every local mutation reasserts
/// ownership, which is also exactly how "press play here" takes a session
/// over from whichever device previously owned it.
pub(crate) fn stamp_own(run: &mut RunState, device_id: &str, device_name: &str) {
    run.device_id = Some(device_id.to_string());
    run.device_name = Some(device_name.to_string());
    run.updated_at = now_ms();
}

/// If `run` is currently mirroring another device's session, returns a
/// sanitized clone with the active/phase/timing fields cleared (but
/// `cycles_completed`/`last_task_id` preserved) — safe to feed into
/// `timer::play`/`timer::stop` so a local action never fabricates a bogus
/// completed `Session` for work that happened (or is mid-flight) on someone
/// else's device. Returns `run` unchanged if it's already this device's own.
pub(crate) fn as_local_baseline(run: &RunState, device_id: &str) -> RunState {
    if is_own(run, device_id) {
        run.clone()
    } else {
        RunState {
            active_task_id: None,
            running_start: None,
            phase: None,
            break_start: None,
            last_task_id: run.last_task_id.clone(),
            cycles_completed: run.cycles_completed,
            long_break: false,
            device_id: run.device_id.clone(),
            device_name: run.device_name.clone(),
            updated_at: run.updated_at,
        }
    }
}

/// Called after every sync cycle. `sync::pull` (inside `sync::sync_once`)
/// writes a newer remote `run_state` row straight to `Db` — bypassing
/// `AppState.run`, the in-memory copy every command handler and the tick
/// loop actually read/write — so without this, a session taken over
/// remotely would never show up in the frontend until the next app restart.
/// This reconciles the two: adopts whatever `Db` now has as the in-memory
/// truth, and — only if the takeover wasn't a same-segment continuation (see
/// `do_play`) — logs whatever work segment was running here first, ending
/// "now" (discovery time — necessarily approximate, bounded by the sync
/// cadence), so the time isn't silently lost. See docs/session-sync-design.md §4.4.
pub(crate) fn reconcile_run_after_sync(state: &AppState) {
    let mut run = state.run.lock().unwrap();
    let db_run = state.db.lock().unwrap().get_run();

    if db_run == *run {
        return;
    }

    let we_owned_locally = is_own(&run, &state.device_id) && run.active_task_id.is_some();
    let still_ours_remotely = is_own(&db_run, &state.device_id);
    // A clean handoff-in-place — another device took over this exact
    // segment (`do_play`'s continuation branch: same task, same phase, same
    // running_start/break_start, just a new owner) — means THAT device is
    // now responsible for eventually logging the whole thing, start to
    // finish. Logging our own partial segment here too would double-count
    // the overlap between "our" logged portion and its eventual full one.
    let same_segment_continues = db_run.active_task_id == run.active_task_id
        && db_run.phase == run.phase
        && db_run.running_start == run.running_start
        && db_run.break_start == run.break_start;

    if we_owned_locally && !same_segment_continues && run.phase.as_deref() == Some("work") {
        if let (Some(task_id), Some(start)) = (run.active_task_id.clone(), run.running_start) {
            let pause_at = now_ms();
            let session_status = if still_ours_remotely {
                TIMER_WRITE_STATUS_NOT_APPLICABLE.to_string()
            } else {
                let db = state.db.lock().unwrap();
                timer_write_status(&db.add_session(&taskplayer_core::SessionLog {
                    task_id,
                    start,
                    end: pause_at,
                }))
            };
            log_timer_pause(
                state,
                TIMER_PAUSE_REASON_REMOTE_RECONCILE,
                TIMER_PAUSE_TRIGGER_SYNC_PULL,
                &run,
                pause_at,
                &session_status,
                TIMER_WRITE_STATUS_SYNC_APPLIED,
            );
        }
    }

    *run = db_run;
}

/// Same in-memory/`Db` reconciliation problem as `reconcile_run_after_sync`,
/// for `SessionConfig` — `sync::pull` can write a newer `config` row straight
/// to `Db`, bypassing `AppState.config`. Much simpler than the run-state
/// case: settings aren't "owned" by a device the way a live session is, so
/// there's no ownership/takeover logic here, just adopt whatever's newer.
pub(crate) fn reconcile_config_after_sync(state: &AppState) {
    let mut config = state.config.lock().unwrap();
    let db_config = state.db.lock().unwrap().get_config();
    if db_config != *config {
        *config = db_config;
    }
}
