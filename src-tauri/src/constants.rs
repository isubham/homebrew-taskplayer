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
pub(crate) const TIMER_PAUSE_REASON_DAY_BOUNDARY: &str = "local_day_boundary";
pub(crate) const TIMER_PAUSE_REASON_DATA_IMPORT: &str = "data_import";
pub(crate) const TIMER_PAUSE_REASON_ORPHANED_TASK: &str = "orphaned_task";
pub(crate) const TIMER_PAUSE_REASON_POMODORO_BREAK: &str = "pomodoro_break";
pub(crate) const TIMER_PAUSE_REASON_REMOTE_RECONCILE: &str = "remote_reconcile";
pub(crate) const TIMER_PAUSE_REASON_SAME_TASK_TOGGLE: &str = "same_task_toggle";
pub(crate) const TIMER_PAUSE_REASON_SYSTEM_SLEEP: &str = "confirmed_system_sleep";
pub(crate) const TIMER_PAUSE_TRIGGER_FRONTEND_PLAY: &str = "frontend_play";
pub(crate) const TIMER_PAUSE_TRIGGER_FRONTEND_STOP: &str = "frontend_stop";
pub(crate) const TIMER_PAUSE_TRIGGER_TIMER_TICK: &str = "timer_tick";
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
pub(crate) const TRAY_FINISH_SESSION_LABEL: &str = "Stop session";
pub(crate) const TRAY_RESUME_SESSION_LABEL: &str = "Start new session";

pub(crate) fn target_reached_notification_body(target_min: i64, task_name: &str) -> String {
    format!(
        "Target reached — {target_min} minutes on \"{task_name}\". Wrap up, or keep going: the clock's still counting."
    )
}
pub(crate) const SYSTEM_SLEEP_OBSERVER_REGISTERED_LOG: &str =
    "macOS sleep/wake observer registered";

pub(crate) const LOCAL_NOTES_CONFIG_FILE: &str = "local-notes.json";
pub(crate) const LOCAL_NOTES_ARCHIVE_DIRECTORY: &str = "_Archived";
pub(crate) const LOCAL_NOTES_UNSORTED_DIRECTORY: &str = "_Unsorted";
pub(crate) const LOCAL_NOTES_EXTENSION: &str = "md";
pub(crate) const LOCAL_NOTES_FRONTMATTER_DELIMITER: &str = "---";
pub(crate) const LOCAL_NOTES_TASK_ID_KEY: &str = "taskplayer_task_id";
pub(crate) const LOCAL_NOTES_FORMAT_KEY: &str = "taskplayer_format";
pub(crate) const LOCAL_NOTES_FORMAT_VERSION: u32 = 1;
pub(crate) const LOCAL_NOTES_TEMP_PREFIX: &str = ".taskplayer-note";
pub(crate) const LOCAL_NOTES_INVALID_FILENAME_CHARS: &str = "<>:\"/\\|?*";
pub(crate) const LOCAL_NOTES_FILENAME_FALLBACK: &str = "Untitled";
pub(crate) const LOCAL_NOTES_RESERVED_FILENAME_PREFIX: &str = "_";
pub(crate) const LOCAL_NOTES_RESERVED_FILENAMES: &[&str] = &["CON", "PRN", "AUX", "NUL", "CLOCK$"];
pub(crate) const LOCAL_NOTES_MAX_FILENAME_CHARS: usize = 120;
pub(crate) const LOCAL_NOTES_SHORT_ID_CHARS: usize = 6;
pub(crate) const LOCAL_NOTES_MAX_SCAN_DEPTH: usize = 6;
#[cfg(unix)]
pub(crate) const LOCAL_NOTES_FILE_MODE: u32 = 0o600;
#[cfg(unix)]
pub(crate) const LOCAL_NOTES_DIRECTORY_MODE: u32 = 0o700;
#[cfg(all(unix, test))]
pub(crate) const LOCAL_NOTES_PERMISSION_MASK: u32 = 0o777;
pub(crate) const LOCAL_NOTES_CONFLICT_MSG: &str =
    "This note changed outside TaskPlayer. Review the latest file before saving.";
pub(crate) const LOCAL_NOTES_DISABLED_MSG: &str =
    "Choose a local storage folder in Settings → Local Storage first.";
pub(crate) const LOCAL_NOTES_UNAVAILABLE_MSG: &str =
    "The local storage folder is unavailable. Reconnect it in Settings → Local Storage.";
pub(crate) const LOCAL_NOTES_TASK_NOT_FOUND_MSG: &str = "That task is no longer available.";
pub(crate) const LOCAL_NOTES_LIST_NOT_FOUND_MSG: &str = "That task's list is no longer available.";
pub(crate) const LOCAL_NOTES_INVALID_DIRECTORY_MSG: &str =
    "Choose an existing directory for Local Notes.";
pub(crate) const LOCAL_NOTES_PATH_ESCAPE_MSG: &str =
    "TaskPlayer refused a Local Notes path outside the selected folder.";
pub(crate) const LOCAL_NOTES_SYMLINK_MSG: &str =
    "TaskPlayer will not write Local Notes through a symbolic link.";
pub(crate) const LOCAL_NOTES_INVALID_FRONTMATTER_MSG: &str =
    "The Local Notes file has invalid TaskPlayer frontmatter.";
pub(crate) const LOCAL_NOTES_DESTINATION_MSG: &str =
    "TaskPlayer could not resolve the Local Notes destination.";
pub(crate) const LOCAL_NOTES_PATH_OCCUPIED_MSG: &str =
    "A different Local Notes file already uses that path.";
pub(crate) const JOURNAL_DIRECTORY: &str = "Journal";
pub(crate) const JOURNAL_ASSETS_DIRECTORY: &str = "_assets";
pub(crate) const JOURNAL_FORMAT_KEY: &str = "taskplayer_journal_format";
pub(crate) const JOURNAL_FORMAT_VERSION: u32 = 2;
pub(crate) const JOURNAL_ID_KEY: &str = "taskplayer_journal_id";
pub(crate) const JOURNAL_DATE_KEY: &str = "taskplayer_journal_date";
pub(crate) const JOURNAL_CREATED_AT_KEY: &str = "taskplayer_journal_created_at";
pub(crate) const JOURNAL_MOOD_KEY: &str = "taskplayer_journal_mood";
pub(crate) const JOURNAL_RELATED_ITEMS_KEY: &str = "taskplayer_journal_related";
pub(crate) const JOURNAL_ALLOWED_MOODS: &[&str] = &["sad", "okay", "happy"];
pub(crate) const JOURNAL_ALLOWED_RELATED_KINDS: &[&str] = &["list", "album", "task"];
pub(crate) const JOURNAL_INVALID_DATE_MSG: &str = "Choose a valid journal date.";
pub(crate) const JOURNAL_INVALID_MOOD_MSG: &str = "Choose a supported journal mood.";
pub(crate) const JOURNAL_INVALID_ENTRY_MSG: &str = "That journal entry is invalid.";
pub(crate) const JOURNAL_ENTRY_NOT_FOUND_MSG: &str = "That journal entry is no longer available.";
pub(crate) const JOURNAL_INVALID_RELATED_ITEM_MSG: &str =
    "Choose a valid list, project, or task to relate.";
pub(crate) const JOURNAL_INVALID_IMAGE_MSG: &str = "Paste a PNG, JPEG, GIF, or WebP image.";
pub(crate) const JOURNAL_IMAGE_TOO_LARGE_MSG: &str = "Pasted images must be 10 MB or smaller.";
pub(crate) const JOURNAL_MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;
pub(crate) const JOURNAL_EXCERPT_CHARS: usize = 140;
pub(crate) const JOURNAL_RELATED_LABEL_CHARS: usize = 120;
pub(crate) const JOURNAL_ENTRY_ID_CHARS: usize = 64;
pub(crate) const JOURNAL_TITLE_FALLBACK: &str = "Untitled";
pub(crate) const JOURNAL_LEGACY_ID_PREFIX: &str = "legacy-";

pub(crate) fn local_notes_area_directory(area: Option<&str>) -> &'static str {
    match area {
        Some("career") => "Career - Work",
        Some("health") => "Health & Wellbeing",
        Some("relationships") => "Relationships",
        Some("finance") => "Finances",
        Some("recreation") => "Recreation",
        _ => LOCAL_NOTES_UNSORTED_DIRECTORY,
    }
}

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
