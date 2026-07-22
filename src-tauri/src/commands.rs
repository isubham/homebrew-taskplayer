use super::*;

mod data;
mod lists;
mod metrics;
mod music;
mod planner;
mod playback;
mod schedule;
mod sessions;
mod settings;
mod system;
mod tasks;

pub(crate) use data::*;
pub(crate) use lists::*;
pub(crate) use metrics::*;
pub(crate) use music::*;
pub(crate) use planner::*;
pub(crate) use playback::*;
pub(crate) use schedule::*;
pub(crate) use sessions::*;
pub(crate) use settings::*;
pub(crate) use system::*;
pub(crate) use tasks::*;
/// After a delete, drop any run-state references to tasks that no longer exist:
/// reset entirely if the active task is gone, and forget the remembered task if
/// it's gone (so the paused player doesn't point at a ghost).
pub(crate) fn reset_run_if_orphaned(state: &AppState, trigger: &str) {
    let ids: Vec<String> = state
        .db
        .lock()
        .unwrap()
        .tasks()
        .map(|t| t.into_iter().map(|x| x.id).collect())
        .unwrap_or_default();
    let mut run = state.run.lock().unwrap();
    let previous = run.clone();
    let mut changed = false;
    let session_task_id = run
        .active_task_id
        .clone()
        .or_else(|| run.last_task_id.clone());
    if run.active_session_id.is_some()
        && session_task_id.as_ref().is_some_and(|id| !ids.contains(id))
    {
        *run = RunState::default();
        changed = true;
    }
    if let Some(id) = run.active_task_id.clone() {
        if !ids.contains(&id) {
            *run = RunState::default();
            changed = true;
        }
    }
    if let Some(id) = run.last_task_id.clone() {
        if !ids.contains(&id) {
            run.last_task_id = None;
            changed = true;
        }
    }
    if changed {
        // Stamp + push this cleanup like any other local mutation — without
        // it, deleting a task that was the *account's* active session (e.g.
        // one another device started) would clear it here but never tell
        // the owning device to stop, since an unstamped RunState never
        // looks dirty to the sync loop (see `RunState::updated_at`'s doc
        // comment in models.rs).
        stamp_own(&mut run, &state.device_id, &state.device_name);
        let db = state.db.lock().unwrap();
        let run_result = db.set_run(&run);
        let run_status = timer_write_status(&run_result);
        drop(db);
        if previous.active_task_id.is_some() {
            log_timer_pause(
                state,
                TIMER_PAUSE_REASON_ORPHANED_TASK,
                trigger,
                &previous,
                now_ms(),
                TIMER_WRITE_STATUS_NOT_APPLICABLE,
                &run_status,
            );
        }
    }
}
