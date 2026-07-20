use super::*;

#[derive(Debug, Serialize, Deserialize)]
pub(super) struct RemoteRunState {
    pub(super) user_id: String,
    pub(super) device_id: String,
    pub(super) device_name: Option<String>,
    pub(super) active_task_id: Option<String>,
    pub(super) running_start: Option<i64>,
    pub(super) phase: Option<String>,
    pub(super) break_start: Option<i64>,
    #[serde(default)]
    pub(super) active_session_id: Option<String>,
    #[serde(default)]
    pub(super) session_work_ms: i64,
    #[serde(default)]
    pub(super) pomodoro_work_ms: i64,
    pub(super) last_task_id: Option<String>,
    #[serde(default)]
    pub(super) cycles_completed: i64,
    #[serde(default)]
    pub(super) long_break: bool,
    pub(super) updated_at: i64,
}

impl RemoteRunState {
    /// `None` if there's no `device_id` to publish yet (shouldn't happen in
    /// practice — `main.rs` always stamps `device_id` before a `RunState`
    /// becomes push-dirty — but this keeps that invariant enforced here
    /// instead of unwrapping and risking a push-loop panic if it's ever
    /// violated).
    pub(super) fn from_local(r: &RunState, user_id: &str) -> Option<Self> {
        Some(RemoteRunState {
            user_id: user_id.to_string(),
            device_id: r.device_id.clone()?,
            device_name: r.device_name.clone(),
            active_task_id: r.active_task_id.clone(),
            running_start: r.running_start,
            phase: r.phase.clone(),
            break_start: r.break_start,
            active_session_id: r.active_session_id.clone(),
            session_work_ms: r.session_work_ms,
            pomodoro_work_ms: r.pomodoro_work_ms,
            last_task_id: r.last_task_id.clone(),
            cycles_completed: r.cycles_completed,
            long_break: r.long_break,
            updated_at: r.updated_at,
        })
    }
    pub(super) fn into_local(self) -> RunState {
        RunState {
            active_task_id: self.active_task_id,
            running_start: self.running_start,
            phase: self.phase,
            break_start: self.break_start,
            active_session_id: self.active_session_id,
            session_work_ms: self.session_work_ms,
            pomodoro_work_ms: self.pomodoro_work_ms,
            last_task_id: self.last_task_id,
            cycles_completed: self.cycles_completed,
            long_break: self.long_break,
            device_id: Some(self.device_id),
            device_name: self.device_name,
            updated_at: self.updated_at,
        }
    }
}

/// Wire shape for the `config` singleton table — same "one row per account"
/// shape as `run_state` (see that struct's doc comment), just for pomodoro/
/// target settings instead of the live session. No device identity here:
/// unlike a live session, settings aren't "owned" by whichever device
/// touched them last in any meaningful sense — it's a plain LWW sync, the
/// same as `lists`/`tasks`/`sessions`, just shaped as a singleton instead of
/// a collection.
#[derive(Debug, Serialize, Deserialize)]
pub(super) struct RemoteConfig {
    pub(super) user_id: String,
    pub(super) mode: String,
    pub(super) target_min: i64,
    pub(super) work_min: i64,
    pub(super) break_min: i64,
    pub(super) break_sound: String,
    pub(super) work_sound: String,
    #[serde(default = "default_remote_cycles_before_long_break")]
    pub(super) cycles_before_long_break: i64,
    #[serde(default = "default_remote_long_break_min")]
    pub(super) long_break_min: i64,
    pub(super) updated_at: i64,
}

pub(super) fn default_remote_cycles_before_long_break() -> i64 {
    SessionConfig::default().cycles_before_long_break
}

pub(super) fn default_remote_long_break_min() -> i64 {
    SessionConfig::default().long_break_min
}

impl RemoteConfig {
    pub(super) fn from_local(c: &SessionConfig, user_id: &str) -> Self {
        RemoteConfig {
            user_id: user_id.to_string(),
            mode: c.mode.clone(),
            target_min: c.target_min,
            work_min: c.work_min,
            break_min: c.break_min,
            break_sound: c.break_sound.clone(),
            work_sound: c.work_sound.clone(),
            cycles_before_long_break: c.cycles_before_long_break,
            long_break_min: c.long_break_min,
            updated_at: c.updated_at,
        }
    }
    pub(super) fn into_local(self) -> SessionConfig {
        SessionConfig {
            mode: self.mode,
            target_min: self.target_min,
            work_min: self.work_min,
            break_min: self.break_min,
            break_sound: self.break_sound,
            work_sound: self.work_sound,
            cycles_before_long_break: self.cycles_before_long_break,
            long_break_min: self.long_break_min,
            // Device-local preference, not a remote column (see the field's
            // doc in models.rs) — filled with the default here and then
            // overwritten with the *local* value at the pull call site
            // before `upsert_config_from_remote`, so a remote config change
            // never flips this device's choice.
            hourly_nudge: SessionConfig::default().hourly_nudge,
            updated_at: self.updated_at,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub(super) struct RemoteUserSettings {
    pub(super) user_id: String,
    #[serde(default = "default_remote_pause_for_other_audio")]
    pub(super) pause_for_other_audio: bool,
    #[serde(default)]
    pub(super) take_over_apple_music: bool,
    #[serde(default)]
    pub(super) take_over_music_players: bool,
    pub(super) updated_at: i64,
}

fn default_remote_pause_for_other_audio() -> bool {
    UserSettings::default().pause_for_other_audio
}

impl RemoteUserSettings {
    pub(super) fn from_local(settings: &UserSettings, user_id: &str) -> Self {
        Self {
            user_id: user_id.to_string(),
            pause_for_other_audio: settings.pause_for_other_audio,
            take_over_apple_music: settings.take_over_apple_music,
            take_over_music_players: settings.take_over_music_players,
            updated_at: settings.updated_at,
        }
    }

    pub(super) fn into_local(self) -> UserSettings {
        UserSettings {
            pause_for_other_audio: self.pause_for_other_audio,
            take_over_apple_music: self.take_over_apple_music,
            take_over_music_players: self.take_over_music_players,
            updated_at: self.updated_at,
        }
    }
}

// ---- HTTP ----
