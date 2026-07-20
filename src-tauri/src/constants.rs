pub(crate) const REFRESH_SKEW_MS: i64 = 5 * 60 * 1000;
pub(crate) const SESSION_EXPIRED_MSG: &str =
    "Not signed in (your session expired) — sign out and sign back in.";
pub(crate) const SYNC_RETRY_MSG: &str =
    "Sync paused by a connection issue — retrying automatically.";
pub(crate) const PLANNED_SESSION_INVALID_MSG: &str =
    "Choose an unfinished one-time task and an end time after the start time.";
pub(crate) const PLANNED_SESSION_NOT_FOUND_MSG: &str =
    "That planned session is no longer available.";
pub(crate) const AUTOMATIC_PLAN_TIME_ZONE_MSG: &str =
    "The local time zone could not be read. Reopen Planner and try again.";
pub(crate) const AUTOMATIC_PLAN_ACCEPT_MSG: &str =
    "The calendar changed before this preview was accepted. Review a fresh suggestion.";
pub(crate) const RECORDED_SESSION_INVALID_MSG: &str =
    "Recorded work must end after it starts and no later than the current time.";
pub(crate) const RECORDED_SESSION_OVERLAP_MSG: &str =
    "That time now overlaps another recorded or active session. Review the latest history and choose another time.";
pub(crate) const ONGOING_SESSION_TASK_CONFLICT_MSG: &str =
    "Finish the current session before starting a different task.";
pub(crate) const RUN_PHASE_WORK: &str = "work";
pub(crate) const TIMER_PAUSE_LOG_EVENT: &str = "timer.pause";
pub(crate) const TIMER_PAUSE_REASON_EXPLICIT_STOP: &str = "explicit_stop";
pub(crate) const TIMER_PAUSE_REASON_DATA_IMPORT: &str = "data_import";
pub(crate) const TIMER_PAUSE_REASON_ORPHANED_TASK: &str = "orphaned_task";
pub(crate) const TIMER_PAUSE_REASON_POMODORO_BREAK: &str = "pomodoro_break";
pub(crate) const TIMER_PAUSE_REASON_REMOTE_RECONCILE: &str = "remote_reconcile";
pub(crate) const TIMER_PAUSE_REASON_SAME_TASK_TOGGLE: &str = "same_task_toggle";
pub(crate) const TIMER_PAUSE_REASON_SYSTEM_SLEEP: &str = "confirmed_system_sleep";
pub(crate) const TIMER_PAUSE_TRIGGER_FRONTEND_PLAY: &str = "frontend_play";
pub(crate) const TIMER_PAUSE_TRIGGER_FRONTEND_STOP: &str = "frontend_stop";
pub(crate) const TIMER_PAUSE_TRIGGER_IMPORT_DATA: &str = "import_data";
pub(crate) const TIMER_PAUSE_TRIGGER_LIST_DELETE: &str = "list_delete";
pub(crate) const TIMER_PAUSE_TRIGGER_PLANNED_SESSION: &str = "planned_session";
pub(crate) const TIMER_PAUSE_TRIGGER_POMODORO_TICK: &str = "pomodoro_tick";
pub(crate) const TIMER_PAUSE_TRIGGER_SYNC_PULL: &str = "sync_pull";
pub(crate) const TIMER_PAUSE_TRIGGER_MACOS_WORKSPACE: &str = "macos_workspace";
pub(crate) const TIMER_PAUSE_TRIGGER_TASK_DELETE: &str = "task_delete";
pub(crate) const TIMER_PAUSE_TRIGGER_TRAY_RECENT: &str = "tray_recent";
pub(crate) const TIMER_PAUSE_TRIGGER_TRAY_TOGGLE: &str = "tray_toggle";
pub(crate) const TIMER_WRITE_STATUS_NOT_APPLICABLE: &str = "not_applicable";
pub(crate) const TIMER_WRITE_STATUS_SYNC_APPLIED: &str = "sync_applied";
pub(crate) const TIMER_WRITE_STATUS_OK: &str = "ok";
pub(crate) const TIMER_WRITE_STATUS_ERROR: &str = "error";
pub(crate) const TIMER_TICK_INTERVAL_MS: u64 = 1_000;
pub(crate) const TARGET_REACHED_NOTIFICATION_TITLE: &str = "Target reached 🎯";
pub(crate) const TRAY_FINISH_SESSION_ID: &str = "finish_session";
pub(crate) const TRAY_FINISH_SESSION_LABEL: &str = "Finish session";
pub(crate) const TRAY_RESUME_SESSION_LABEL: &str = "Resume";

pub(crate) fn target_reached_notification_body(target_min: i64, task_name: &str) -> String {
    format!(
        "Target reached — {target_min} minutes on \"{task_name}\". Wrap up, or keep going: the clock's still counting."
    )
}
pub(crate) const SYSTEM_SLEEP_OBSERVER_REGISTERED_LOG: &str =
    "macOS sleep/wake observer registered";

pub(crate) const SOUND_OPTIONS: &[&str] = &[
    "Basso",
    "Blow",
    "Bottle",
    "Frog",
    "Funk",
    "Glass",
    "Hero",
    "Morse",
    "Ping",
    "Pop",
    "Purr",
    "Sosumi",
    "Submarine",
    "Tink",
];
