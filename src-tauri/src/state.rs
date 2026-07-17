use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use taskplayer_core::{Db, RunState, SessionConfig};

use crate::audio_interruption::{AudioInterruptionMonitor, MediaTakeover};
use crate::auth;

pub(crate) struct AppState {
    pub(crate) db: Mutex<Db>,
    pub(crate) run: Mutex<RunState>,
    pub(crate) config: Mutex<SessionConfig>,
    /// This device's stable id (`Db::get_device_id()`) and best-effort
    /// display name — loaded/computed once at startup (see `device_name()`).
    /// Drives cross-device session sync (docs/session-sync-design.md);
    /// immutable for the process lifetime, so no `Mutex` needed.
    pub(crate) device_id: String,
    pub(crate) device_name: String,
    /// PKCE verifier for the in-flight sign-in attempt, if any. Only one
    /// sign-in flow happens at a time, so a single slot is enough.
    pub(crate) pending_pkce: Mutex<Option<auth::Pkce>>,
    /// Current Supabase session access token, if signed in, plus when it
    /// expires — so the sync loop can refresh it proactively instead of
    /// only reacting once a request comes back 401. The refresh token
    /// itself lives in `data_dir/session.json` (see auth.rs), never here.
    pub(crate) access_token: Mutex<Option<AccessToken>>,
    pub(crate) sync_status: Mutex<SyncStatus>,
    pub(crate) tray_state: Mutex<TrayState>,
    /// Whether the focus-music widget is currently playing. Mirrored from
    /// the frontend (music.js's `<audio>` element lives entirely in the
    /// webview, Rust has no direct visibility into it) via the
    /// `set_music_playing` command, purely so the tray menu's music toggle
    /// label can read "Pause music" vs. "Play music" correctly.
    pub(crate) music_playing: Mutex<bool>,
    pub(crate) audio_interruption_monitor: Mutex<AudioInterruptionMonitor>,
    pub(crate) media_takeover: Mutex<MediaTakeover>,
    /// The update `check_for_update` last found, if any and not yet consumed
    /// by `install_update`. A single slot is enough — only one "is there an
    /// update" round-trip is ever in flight from the Settings page at a time.
    pub(crate) pending_update: Mutex<Option<tauri_plugin_updater::Update>>,
    /// Version string of the last update the background checker already
    /// notified about, so the 4-hourly poll doesn't re-notify for the same
    /// release every cycle until the user actually installs it.
    pub(crate) last_notified_update_version: Mutex<Option<String>>,
    /// OS app-data directory — also where the SQLite file and session.json live.
    pub(crate) data_dir: PathBuf,
    /// Dedupe state for the tick loop's non-pomodoro notifications (target
    /// reached, open-mode hourly check-in). Keyed on `running_start`, so a
    /// new work segment automatically re-arms both. Purely in-memory: after
    /// an app restart the worst case is one repeated notification, not a
    /// missed one, so it isn't worth persisting.
    pub(crate) session_notify: Mutex<SessionNotify>,
}

/// See `AppState::session_notify`.
#[derive(Default)]
pub(crate) struct SessionNotify {
    /// `running_start` of the work segment whose target-reached notification
    /// already fired (target mode).
    pub(crate) target_fired_for: Option<i64>,
    /// `running_start` of the segment the hourly check-in last fired for,
    /// plus how many full hours had elapsed when it did (open mode).
    pub(crate) nudge_fired_for: Option<i64>,
    pub(crate) nudge_hours: i64,
    /// Schedule reminders are evaluated once per ten-second bucket and
    /// deduped per concrete weekday occurrence. The ledger is intentionally
    /// device-local and short-lived; it prevents notification spam without
    /// becoming a user-visible history of missed routines.
    pub(crate) schedule_checked_bucket: Option<i64>,
    pub(crate) schedule_fired: HashMap<String, i64>,
}

#[derive(Clone, Default)]
pub(crate) struct SyncStatus {
    pub(crate) syncing: bool,
    pub(crate) last_synced_at: Option<i64>,
    pub(crate) last_sync_error: Option<String>,
}

#[derive(Clone, Default)]
pub(crate) struct TrayState {
    pub(crate) last_icon: Option<String>,
    pub(crate) last_title: Option<Option<String>>,
    pub(crate) last_menu_hash: Option<String>,
}

#[derive(Clone)]
pub(crate) struct AccessToken {
    pub(crate) token: String,
    /// Wall-clock ms (same epoch as `now_ms()`) at which Supabase considers
    /// this token expired.
    pub(crate) expires_at_ms: i64,
}
