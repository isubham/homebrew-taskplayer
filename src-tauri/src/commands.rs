use super::*;

mod lists;
mod playback;
mod schedule;
mod sessions;
mod settings;
mod system;
mod tasks;

pub(crate) use lists::*;
pub(crate) use playback::*;
pub(crate) use schedule::*;
pub(crate) use sessions::*;
pub(crate) use settings::*;
pub(crate) use system::*;
pub(crate) use tasks::*;
/// After a delete, drop any run-state references to tasks that no longer exist:
/// reset entirely if the active task is gone, and forget the remembered task if
/// it's gone (so the paused player doesn't point at a ghost).
pub(crate) fn reset_run_if_orphaned(state: &AppState) {
    let ids: Vec<String> = state
        .db
        .lock()
        .unwrap()
        .tasks()
        .map(|t| t.into_iter().map(|x| x.id).collect())
        .unwrap_or_default();
    let mut run = state.run.lock().unwrap();
    let mut changed = false;
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
        let _ = state.db.lock().unwrap().set_run(&run);
    }
}
