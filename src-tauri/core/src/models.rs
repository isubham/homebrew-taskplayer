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

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionConfig {
    /// "open" | "target" | "pomodoro"
    pub mode: String,
    pub target_min: i64,
    pub work_min: i64,
    pub break_min: i64,
}

impl Default for SessionConfig {
    fn default() -> Self {
        SessionConfig {
            mode: "open".into(),
            target_min: 45,
            work_min: 25,
            break_min: 5,
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
    pub tasks: Vec<Task>,
    pub sessions: Vec<Session>,
    pub config: SessionConfig,
    pub run: RunState,
    pub account: Option<AccountInfo>,
    /// true while a background sync push/pull is in flight. Lives here
    /// (not in the lightweight `Status`/`tick` event) because the frontend
    /// only ever listens to `state-changed` today, and sync is infrequent
    /// enough (60s) that a full Snapshot rebuild per transition is cheap.
    pub syncing: bool,
    /// ms epoch of the last successful sync, if any
    pub last_synced_at: Option<i64>,
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
