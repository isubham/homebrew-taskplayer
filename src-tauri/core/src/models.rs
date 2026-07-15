use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

/// Monotonic-ish unique id generator (nanos + counter). No external deps.
static COUNTER: AtomicU64 = AtomicU64::new(0);
pub fn new_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    let c = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{:x}{:x}", nanos, c)
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// A recurring local-time window within a week. `weekday` follows ISO-8601
/// numbering (Monday = 1, Sunday = 7); start/end are minutes after local
/// midnight and describe a half-open interval `[start_minute, end_minute)`.
/// When `end_minute < start_minute`, the interval ends on the following day;
/// equal start/end values are rejected by the editor as ambiguous.
///
/// The planner will validate ranges before saving them. Keeping this as a
/// shared value object lets lists describe when their context is available
/// and daily tasks describe when each occurrence happens without inventing
/// separate time formats for the two features.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeeklyTimeWindow {
    pub weekday: i64,
    pub start_minute: i64,
    pub end_minute: i64,
}

/// User-controlled planning precedence for one fixed life area. Rank 1 is
/// highest. The area name/color remain defined by the app; only this order is
/// persisted and synced.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LifeAreaPriority {
    pub area_key: String,
    pub priority_rank: i64,
    pub updated_at: i64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskList {
    pub id: String,
    pub name: String,
    pub emoji: String,
    pub color: String,
    pub order: i64,
    /// ms epoch of last change — drives cross-device sync (last-write-wins).
    #[serde(default)]
    pub updated_at: i64,
    /// Life-balance area this list's tracked time counts toward (see the
    /// Home page's radar chart) — one of "career" | "health" |
    /// "relationships" | "growth" | "finance" | "recreation" (the retired
    /// "wellbeing" is folded into "health" as "Health & Wellbeing", see
    /// migration 010), or None for an untagged list that just doesn't factor
    /// into the chart. `#[serde(default)]` keeps lists saved before this field
    /// existed deserializable.
    #[serde(default)]
    pub life_area: Option<String>,
    /// "increase" | "decrease" — whether time spent in this list should
    /// count FOR or AGAINST its tagged `life_area` (e.g. a "Doomscrolling"
    /// list tagged decrease:health pulls that axis down instead of up).
    /// Meaningless when `life_area` is None. `#[serde(default)]` keeps
    /// lists saved before this field existed deserializable.
    #[serde(default)]
    pub life_direction: Option<String>,
    /// Weekly local-time windows in which tasks belonging to this list may
    /// be planned. Empty means the list has no scheduling constraint yet,
    /// preserving the behavior of every list created before the planner.
    #[serde(default)]
    pub availability_windows: Vec<WeeklyTimeWindow>,
    /// Soft-delete tombstone; never sent to the frontend (deleted rows are
    /// filtered out of every normal query before they'd reach a Snapshot).
    #[serde(skip)]
    pub deleted_at: Option<i64>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub list_id: String,
    pub name: String,
    /// "deep" | "shallow" | null
    pub depth: Option<String>,
    pub order: i64,
    /// Estimated effort in minutes (user enters hours). None = no estimate.
    #[serde(default)]
    pub estimate_min: Option<i64>,
    /// Freeform album/grouping name — related tasks within one list can share
    /// an album, the way songs by one artist group into albums. None = a
    /// "single" (shown in its own unlabeled section in the UI).
    #[serde(default)]
    pub album: Option<String>,
    /// When the task was marked complete (ms epoch). None = still to-do.
    #[serde(default)]
    pub completed_at: Option<i64>,
    /// Free-text description (shown as "lyrics" in the UI). None = none.
    #[serde(default)]
    pub description: Option<String>,
    /// ms epoch of last change — drives cross-device sync (last-write-wins).
    #[serde(default)]
    pub updated_at: i64,
    /// "low" | "medium" | "high" | None. Independent of
    /// `estimate_min` on purpose — a 5-minute task can be `high` and a
    /// 2-hour one `low`; this (not duration) is what the frontend weighs
    /// jewel payout and the life-balance radar contribution by. None = not
    /// yet set, treated as weightless (no jewels either way) rather than
    /// guessing a tier on the user's behalf. `#[serde(default)]` keeps tasks
    /// saved before this field existed deserializable.
    #[serde(default)]
    pub impact_tier: Option<String>,
    /// 1 = counts FOR its list's tagged life area, -1 = AGAINST it (the
    /// "smoked a cigarette" case — outsized, but negative). Local-only for now,
    /// same as `TaskList::life_area`/`life_direction` (see the comment on
    /// those) — not yet part of the Supabase remote schema.
    #[serde(default = "default_impact_sign")]
    pub impact_sign: i64,
    /// Optional deadline (ms epoch, date granularity — always midnight local
    /// time of the chosen day). None = no deadline. Independent of
    /// `estimate_min` (a deadline is *when*, an estimate is *how long*) and
    /// of `impact_tier` (a task can carry either without the other) — the
    /// Home page's "Now" section (see docs/homepage-now-spec.md) only
    /// surfaces a task once it has BOTH a deadline and `impact_tier` of at
    /// least medium. `#[serde(default)]` keeps tasks saved before this field
    /// existed deserializable.
    #[serde(default)]
    pub deadline_at: Option<i64>,
    /// None = one-time task (default; `completed_at` is the terminal
    /// "done" state, jewelPayout counts once on that date). `Some("daily")`
    /// = repeating — there is no terminal completion, "done" is derived
    /// per calendar day from whether a session exists that day (see
    /// render.js's `dailyPayoutOn`/`dailyPayoutDayCount`), and the jewel
    /// pays out at most once per qualifying day rather than once ever.
    /// Deliberately just an enum string, not a richer schedule (custom
    /// weekdays, intervals, etc.) — matches the "don't build more machinery
    /// than the one idea is worth" precedent set by `impact_tier`/`deadline_at`.
    /// `#[serde(default)]` keeps tasks saved before this field existed
    /// deserializable.
    #[serde(default)]
    pub cadence: Option<String>,
    /// Fixed local-time occurrences for a daily task. Ignored for one-time
    /// tasks. Empty keeps a daily unscheduled rather than guessing a time.
    #[serde(default)]
    pub daily_windows: Vec<WeeklyTimeWindow>,
    /// Smallest/largest useful planner block for a one-time task, in minutes.
    /// Both are optional so existing tasks remain valid and can continue to
    /// run without participating in automatic scheduling.
    #[serde(default)]
    pub min_session_min: Option<i64>,
    #[serde(default)]
    pub max_session_min: Option<i64>,
    /// Soft-delete tombstone; never sent to the frontend (deleted rows are
    /// filtered out of every normal query before they'd reach a Snapshot).
    #[serde(skip)]
    pub deleted_at: Option<i64>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub task_id: String,
    pub start: i64,
    /// None while running
    pub end: Option<i64>,
    /// ms epoch of last change — drives cross-device sync (last-write-wins).
    #[serde(default)]
    pub updated_at: i64,
    /// Soft-delete tombstone; never sent to the frontend (deleted rows are
    /// filtered out of every normal query before they'd reach a Snapshot).
    #[serde(skip)]
    pub deleted_at: Option<i64>,
}

/// Default sound for the "work done, break time" notification — a bright,
/// unmistakable ping distinct from the calmer work-resume default below.
fn default_break_sound() -> String {
    "Glass".to_string()
}

/// Default sound for the "break's over, back to work" notification.
fn default_work_sound() -> String {
    "Ping".to_string()
}

/// Cirillo's original "four work blocks, then a long break" cadence.
fn default_cycles_before_long_break() -> i64 {
    4
}

/// Default long-break length in minutes.
fn default_long_break_min() -> i64 {
    20
}

/// Open mode's hourly check-in defaults to on — it's a gentle, positive
/// nudge (stretch, water), and the Settings toggle sits right next to where
/// it's explained, so opting out is one click.
fn default_hourly_nudge() -> bool {
    true
}

/// Every task defaults to counting FOR (not against) whatever area(s) it's
/// tagged with — matches the polarity of a plain, untagged task pre-dating
/// the impact system, so `#[serde(default)]` never turns an old task
/// negative by accident.
fn default_impact_sign() -> i64 {
    1
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionConfig {
    /// "open" | "target" | "pomodoro"
    pub mode: String,
    pub target_min: i64,
    pub work_min: i64,
    pub break_min: i64,
    /// macOS system sound name (see `SOUND_OPTIONS` in main.rs) played when a
    /// work block ends and a break is ready to start. `#[serde(default)]`
    /// keeps configs saved before this field existed deserializable.
    #[serde(default = "default_break_sound")]
    pub break_sound: String,
    /// Same as `break_sound`, played when a break ends and work is ready to
    /// resume.
    #[serde(default = "default_work_sound")]
    pub work_sound: String,
    /// Number of completed work cycles that earns a long break (Cirillo's
    /// original technique: every 4th break is longer). `#[serde(default)]`
    /// keeps configs saved before this field existed deserializable.
    #[serde(default = "default_cycles_before_long_break")]
    pub cycles_before_long_break: i64,
    /// Length of that long break, in minutes (editable 1–60, same range as
    /// `break_min`).
    #[serde(default = "default_long_break_min")]
    pub long_break_min: i64,
    /// Open mode only: fire a gentle check-in notification at each full hour
    /// of continuous work. Device-local preference — deliberately NOT part of
    /// `RemoteConfig` in sync.rs (notifications only ever fire on the device
    /// running the session, and the remote `config` table has no such
    /// column); the pull side preserves the local value when applying a
    /// remote config. `#[serde(default)]` keeps configs saved before this
    /// field existed deserializable.
    #[serde(default = "default_hourly_nudge")]
    pub hourly_nudge: bool,
    /// ms epoch of last change — drives cross-device sync (last-write-wins),
    /// same convention as `RunState::updated_at` (see docs/session-sync-design.md
    /// for the pattern this reuses: a singleton `config` row per account,
    /// pushed only when dirty). `#[serde(default)]` keeps configs saved
    /// before this field existed deserializable, and defaulting to 0 means
    /// an old locally-saved config is never mistaken for "newer" than
    /// whatever's already on the server.
    #[serde(default)]
    pub updated_at: i64,
}

impl Default for SessionConfig {
    fn default() -> Self {
        SessionConfig {
            mode: "open".into(),
            target_min: 45,
            work_min: 25,
            break_min: 5,
            break_sound: default_break_sound(),
            work_sound: default_work_sound(),
            cycles_before_long_break: default_cycles_before_long_break(),
            long_break_min: default_long_break_min(),
            hourly_nudge: default_hourly_nudge(),
            updated_at: 0,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RunState {
    pub active_task_id: Option<String>,
    pub running_start: Option<i64>,
    /// "work" | "break" | null
    pub phase: Option<String>,
    pub break_start: Option<i64>,
    /// Last task that was playing — remembered after stop so the player can
    /// keep showing it and resume (Spotify-style). Mirrors active_task_id while
    /// running; retained when stopped. `#[serde(default)]` keeps old saved
    /// run-state JSON (without this field) deserializable.
    #[serde(default)]
    pub last_task_id: Option<String>,
    /// Completed work cycles (full pomodoro work blocks) since the last long
    /// break. Incremented by `timer::tick` each time a work block finishes;
    /// reset to 0 the moment that count reaches `cycles_before_long_break` —
    /// i.e. it resets as soon as the automatically-started long break is
    /// earned. Stopping/resuming the timer never touches this counter — only
    /// a work block that runs to completion does. `#[serde(default)]` keeps
    /// old saved run-state JSON deserializable.
    #[serde(default)]
    pub cycles_completed: i64,
    /// True while `phase` is "break" and that break is the long one. Set by
    /// `timer::tick` when the cycle threshold is hit and cleared once the
    /// break ends or the timer takes another transition. Older synced states
    /// may still contain `awaiting_break`; `start_break` preserves the flag
    /// while recovering them. `#[serde(default)]` keeps old JSON readable.
    #[serde(default)]
    pub long_break: bool,
    /// Which device currently owns this session, for cross-device sync (see
    /// docs/session-sync-design.md) — `Db::get_device_id()`'s stable
    /// per-install id, stamped by `main.rs` (never by `timer.rs`, which stays
    /// pure I/O-free) on every local play/stop/phase-transition. `None` means
    /// either a pre-migration local-only RunState or a fresh reset (e.g.
    /// `import_data`) — treated as "this device's own" by the reconciliation
    /// logic in `main.rs`, never as a foreign session. `#[serde(default)]`
    /// keeps old saved run-state JSON deserializable.
    #[serde(default)]
    pub device_id: Option<String>,
    /// Best-effort display name for `device_id` ("MacBook Pro") — purely for
    /// the "Playing on ..." UI treatment, never compared/used for any sync
    /// logic. `#[serde(default)]` keeps old saved run-state JSON
    /// deserializable.
    #[serde(default)]
    pub device_name: Option<String>,
    /// ms epoch this RunState was last changed BY ITS OWNING DEVICE — drives
    /// cross-device sync (last-write-wins), same convention as
    /// `TaskList`/`Task`/`Session`'s `updated_at`. NOT touched by pure
    /// wall-clock advancement (`timer::work_elapsed`/`break_remaining`) —
    /// only by an actual state transition, so idle ticking never looks dirty
    /// to the sync loop. `#[serde(default)]` keeps old saved run-state JSON
    /// deserializable.
    #[serde(default)]
    pub updated_at: i64,
}

/// Signed-in Google/Supabase profile. Durable, rarely-changing state — lives
/// in `Snapshot` alongside `config`/`run`, not in the ephemeral `Status` tick.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountInfo {
    pub id: String,
    pub email: String,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub lists: Vec<TaskList>,
    #[serde(default)]
    pub life_area_priorities: Vec<LifeAreaPriority>,
    pub tasks: Vec<Task>,
    pub sessions: Vec<Session>,
    pub config: SessionConfig,
    pub run: RunState,
    /// This device's own stable id (`Db::get_device_id()`) — the frontend
    /// compares this against `run.deviceId` to tell "my session" (full
    /// player) from "mirroring another device's session" (read-only, see
    /// docs/session-sync-design.md). Not secret — same trust level as a
    /// hostname.
    pub device_id: String,
    pub account: Option<AccountInfo>,
    /// true while a background sync push/pull is in flight. Lives here
    /// (not in the lightweight `Status`/`tick` event) because the frontend
    /// only ever listens to `state-changed` today, and sync is infrequent
    /// enough (60s) that a full Snapshot rebuild per transition is cheap.
    pub syncing: bool,
    /// ms epoch of the last successful sync, if any
    pub last_synced_at: Option<i64>,
    /// Error message from the most recent sync attempt, if it failed. Cleared
    /// as soon as a later attempt succeeds. Lets the Settings UI distinguish
    /// "actually synced" from "silently failing every cycle" instead of both
    /// looking identical.
    pub last_sync_error: Option<String>,
    /// App version (from Cargo.toml at compile time via env!("CARGO_PKG_VERSION")
    /// in main.rs) — the Settings "About" section reads this instead of a
    /// hardcoded string, so it can never drift out of sync with a real release
    /// the way a hand-typed version number in the UI can.
    pub app_version: String,
}

/// A completed work segment ready to persist.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionLog {
    pub task_id: String,
    pub start: i64,
    pub end: i64,
}

/// Live status used by the menu-bar status item.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub active: bool,
    pub phase: Option<String>,
    pub task_id: Option<String>,
    pub task_name: Option<String>,
    pub list_name: Option<String>,
    pub list_color: Option<String>,
    /// elapsed ms of the current work segment (or break remaining for break)
    pub elapsed_ms: i64,
    pub minutes: i64,
    /// total ms logged on the active task (incl. live segment)
    pub task_total_ms: i64,
}
