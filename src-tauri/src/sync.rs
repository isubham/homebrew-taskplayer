// Pushes local changes to, and pulls remote changes from, the Supabase
// Postgres tables set up in Phase 0 (see the plan's schema + the
// `lww_guard` trigger, which makes plain upserts here safe against
// clobbering a newer row — the server silently keeps whichever `updated_at`
// is greater).
//
// Hand-rolled against PostgREST directly with `reqwest::blocking`, not the
// `postgrest` crate: that crate is async-only (built on `.await`), and this
// codebase is deliberately synchronous everywhere else (see the 1s tick
// loop in main.rs, which is a plain `std::thread::spawn` + `sleep` loop).
// Matches the same hand-rolled-over-generic-client style already used in
// auth.rs for the same reason.

use crate::config::{SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL};
use serde::{Deserialize, Serialize};
use std::sync::{Mutex, OnceLock};
use taskplayer_core::{
    now_ms, Db, LifeAreaPriority, RunState, Session, SessionConfig, Task, TaskList,
    WeeklyTimeWindow,
};

fn client() -> reqwest::blocking::Client {
    reqwest::blocking::Client::new()
}

fn rest_url(table: &str) -> String {
    format!("{SUPABASE_URL}/rest/v1/{table}")
}

/// How far to rewind the pull cursor below "now" on every pull, instead of
/// advancing it all the way to the puller's own clock reading.
///
/// `updated_at` is stamped by whichever device made the edit, using that
/// device's own clock at *creation* time — there's no server-side trigger
/// setting it on arrival. So a row can be created on device B, sit unpushed
/// for a few seconds/minutes (offline, or just waiting for its periodic sync
/// tick), and only reach Supabase *after* device A already advanced its
/// pull_cursor past that row's timestamp. From then on `updated_at > cursor`
/// excludes that row forever — not even a manual re-sync recovers it, since
/// the row's timestamp never changes.
///
/// Keeping the cursor a few minutes behind "now" instead re-scans that
/// window on every pull, catching the race. Re-applying an already-seen row
/// is a no-op: `upsert_from_remote`'s `ON CONFLICT ... WHERE excluded.updated_at
/// > x.updated_at` only writes if it's actually newer.
const PULL_REWIND_MS: i64 = 5 * 60 * 1000;

const MIN_BACKEND_SCHEMA_VERSION: i64 = 3;
const REQUIRED_BACKEND_CAPABILITIES: &[&str] = &[
    "planner_windows_v1",
    "life_area_priorities_v1",
    "run_state_v1",
];

#[derive(Clone, Debug, Deserialize)]
struct BackendSchema {
    schema_version: i64,
    min_supported_client: String,
    #[serde(default)]
    capabilities: Vec<String>,
}

static BACKEND_SCHEMA: OnceLock<Mutex<Option<BackendSchema>>> = OnceLock::new();

fn version_triplet(version: &str) -> Option<(u64, u64, u64)> {
    let core = version.split(['-', '+']).next()?;
    let mut parts = core.split('.');
    Some((
        parts.next()?.parse().ok()?,
        parts.next().unwrap_or("0").parse().ok()?,
        parts.next().unwrap_or("0").parse().ok()?,
    ))
}

fn validate_backend_schema(schema: &BackendSchema) -> Result<(), String> {
    let current_client = env!("CARGO_PKG_VERSION");
    let current_version = version_triplet(current_client)
        .ok_or_else(|| format!("invalid client version: {current_client}"))?;
    let minimum_version = version_triplet(&schema.min_supported_client).ok_or_else(|| {
        format!(
            "invalid minimum client version in backend contract: {}",
            schema.min_supported_client
        )
    })?;
    if current_version < minimum_version {
        return Err(format!(
            "Sync paused: TaskPlayer {current_client} is older than the backend's supported minimum {}. Update TaskPlayer to resume sync.",
            schema.min_supported_client
        ));
    }

    if schema.schema_version < MIN_BACKEND_SCHEMA_VERSION {
        return Err(format!(
            "Sync paused: backend schema {} is older than required schema {}. Apply the Supabase migrations first.",
            schema.schema_version, MIN_BACKEND_SCHEMA_VERSION
        ));
    }

    let missing = REQUIRED_BACKEND_CAPABILITIES
        .iter()
        .filter(|required| {
            !schema
                .capabilities
                .iter()
                .any(|available| available.as_str() == **required)
        })
        .copied()
        .collect::<Vec<_>>();

    if !missing.is_empty() {
        return Err(format!(
            "Sync paused: backend is missing required capabilities: {}. Apply the Supabase migrations first.",
            missing.join(", ")
        ));
    }

    Ok(())
}

/// Verify the global Supabase contract once per app process. If the contract
/// is absent or too old, only sync is paused; local SQLite and task playback
/// continue to work normally.
fn ensure_backend_compatible(access_token: &str) -> Result<(), String> {
    let cache = BACKEND_SCHEMA.get_or_init(|| Mutex::new(None));
    if let Some(schema) = cache
        .lock()
        .map_err(|_| "backend schema cache is unavailable".to_string())?
        .clone()
    {
        return validate_backend_schema(&schema);
    }

    let url = format!(
        "{}?id=eq.1&select=schema_version,min_supported_client,capabilities",
        rest_url("app_schema")
    );
    let resp = client()
        .get(url)
        .header("apikey", SUPABASE_PUBLISHABLE_KEY)
        .header("Authorization", format!("Bearer {access_token}"))
        .send()
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        return Err(format!(
            "Sync paused: the backend compatibility contract is unavailable (HTTP {status}). Apply the Supabase migrations first."
        ));
    }

    let schema = resp
        .json::<Vec<BackendSchema>>()
        .map_err(|e| format!("invalid backend compatibility contract: {e}"))?
        .into_iter()
        .next()
        .ok_or_else(|| "Sync paused: the backend compatibility contract is empty.".to_string())?;

    validate_backend_schema(&schema)?;
    *cache
        .lock()
        .map_err(|_| "backend schema cache is unavailable".to_string())? = Some(schema);
    Ok(())
}

// ---- wire shapes ----
//
// Deliberately separate from the `core` models: these mirror the Postgres
// column names (snake_case, e.g. `ord`/`est`/`done`/`descr` — the same
// vocabulary already used for the local SQLite columns in `db.rs`), while
// the `core` structs are `#[serde(rename_all = "camelCase")]` for the
// frontend Snapshot. Trying to reuse one shape for both would mean fighting
// serde's single rename direction, so two small conversions are simpler
// than one clever one.

#[derive(Debug, Serialize, Deserialize)]
struct RemoteList {
    id: String,
    user_id: String,
    name: String,
    emoji: String,
    color: String,
    ord: i64,
    updated_at: i64,
    deleted_at: Option<i64>,
    // Life-balance tag (see models.rs's TaskList doc comments). Requires the
    // `lists` table to actually have these columns — see the `alter table`
    // statements in db.sql. Added after `lists` first shipped, so an older
    // Supabase project needs that one-time migration before this round-trips
    // correctly; until then these just come back `null` on pull, same as any
    // other never-set column.
    life_area: Option<String>,
    life_direction: Option<String>,
    #[serde(default)]
    availability_windows: Vec<WeeklyTimeWindow>,
}

impl RemoteList {
    fn from_local(l: &TaskList, user_id: &str) -> Self {
        RemoteList {
            id: l.id.clone(),
            user_id: user_id.to_string(),
            name: l.name.clone(),
            emoji: l.emoji.clone(),
            color: l.color.clone(),
            ord: l.order,
            updated_at: l.updated_at,
            deleted_at: l.deleted_at,
            life_area: l.life_area.clone(),
            life_direction: l.life_direction.clone(),
            availability_windows: l.availability_windows.clone(),
        }
    }
    fn into_local(self) -> TaskList {
        TaskList {
            id: self.id,
            name: self.name,
            emoji: self.emoji,
            color: self.color,
            order: self.ord,
            updated_at: self.updated_at,
            life_area: self.life_area,
            life_direction: self.life_direction,
            availability_windows: self.availability_windows,
            deleted_at: self.deleted_at,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct RemoteLifeAreaPriority {
    user_id: String,
    area_key: String,
    priority_rank: i64,
    updated_at: i64,
}

impl RemoteLifeAreaPriority {
    fn from_local(priority: &LifeAreaPriority, user_id: &str) -> Self {
        Self {
            user_id: user_id.to_string(),
            area_key: priority.area_key.clone(),
            priority_rank: priority.priority_rank,
            updated_at: priority.updated_at,
        }
    }

    fn into_local(self) -> LifeAreaPriority {
        LifeAreaPriority {
            area_key: self.area_key,
            priority_rank: self.priority_rank,
            updated_at: self.updated_at,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct RemoteTask {
    id: String,
    user_id: String,
    list_id: String,
    name: String,
    depth: Option<String>,
    ord: i64,
    est: Option<i64>,
    done: Option<i64>,
    descr: Option<String>,
    updated_at: i64,
    deleted_at: Option<i64>,
    album: Option<String>,
    // Impact tier/sign (see models.rs's Task doc comments) — same "requires
    // an `alter table` on an older Supabase project" caveat as TaskList's
    // life_area/life_direction above.
    impact_tier: Option<String>,
    #[serde(default = "default_impact_sign_remote")]
    impact_sign: i64,
    // Deadline (see models.rs's Task doc comments and
    // docs/homepage-now-spec.md) — same "requires an `alter table` on an
    // older Supabase project" caveat as impact_tier above.
    deadline_at: Option<i64>,
    // Cadence ("daily" | None, see models.rs's Task doc comments) — same
    // "requires an `alter table` on an older Supabase project" caveat as
    // impact_tier/deadline_at above.
    cadence: Option<String>,
    #[serde(default)]
    daily_windows: Vec<WeeklyTimeWindow>,
    min_session_min: Option<i64>,
    max_session_min: Option<i64>,
}

fn default_impact_sign_remote() -> i64 {
    1
}

impl RemoteTask {
    fn from_local(t: &Task, user_id: &str) -> Self {
        RemoteTask {
            id: t.id.clone(),
            user_id: user_id.to_string(),
            list_id: t.list_id.clone(),
            name: t.name.clone(),
            depth: t.depth.clone(),
            ord: t.order,
            est: t.estimate_min,
            done: t.completed_at,
            descr: t.description.clone(),
            updated_at: t.updated_at,
            deleted_at: t.deleted_at,
            album: t.album.clone(),
            impact_tier: t.impact_tier.clone(),
            impact_sign: t.impact_sign,
            deadline_at: t.deadline_at,
            cadence: t.cadence.clone(),
            daily_windows: t.daily_windows.clone(),
            min_session_min: t.min_session_min,
            max_session_min: t.max_session_min,
        }
    }
    fn into_local(self) -> Task {
        Task {
            id: self.id,
            list_id: self.list_id,
            name: self.name,
            depth: self.depth,
            order: self.ord,
            estimate_min: self.est,
            completed_at: self.done,
            description: self.descr,
            updated_at: self.updated_at,
            deleted_at: self.deleted_at,
            album: self.album,
            impact_tier: self.impact_tier,
            impact_sign: self.impact_sign,
            deadline_at: self.deadline_at,
            cadence: self.cadence,
            daily_windows: self.daily_windows,
            min_session_min: self.min_session_min,
            max_session_min: self.max_session_min,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct RemoteSession {
    id: String,
    user_id: String,
    task_id: String,
    start: i64,
    end: Option<i64>,
    updated_at: i64,
    deleted_at: Option<i64>,
}

impl RemoteSession {
    fn from_local(s: &Session, user_id: &str) -> Self {
        RemoteSession {
            id: s.id.clone(),
            user_id: user_id.to_string(),
            task_id: s.task_id.clone(),
            start: s.start,
            end: s.end,
            updated_at: s.updated_at,
            deleted_at: s.deleted_at,
        }
    }
    fn into_local(self) -> Session {
        Session {
            id: self.id,
            task_id: self.task_id,
            start: self.start,
            end: self.end,
            updated_at: self.updated_at,
            deleted_at: self.deleted_at,
        }
    }
}

/// Wire shape for the `run_state` singleton table (see
/// docs/session-sync-design.md). One row per account (`user_id` is the
/// primary key, not a generated `id`) — that's what makes "only one active
/// session at a time" a schema-level guarantee rather than app-level
/// conflict logic: the same last-write-wins `lww_guard` trigger that
/// protects `lists`/`tasks`/`sessions` just does double duty as "the last
/// device to press play owns the session."
#[derive(Debug, Serialize, Deserialize)]
struct RemoteRunState {
    user_id: String,
    device_id: String,
    device_name: Option<String>,
    active_task_id: Option<String>,
    running_start: Option<i64>,
    phase: Option<String>,
    break_start: Option<i64>,
    last_task_id: Option<String>,
    #[serde(default)]
    cycles_completed: i64,
    #[serde(default)]
    long_break: bool,
    updated_at: i64,
}

impl RemoteRunState {
    /// `None` if there's no `device_id` to publish yet (shouldn't happen in
    /// practice — `main.rs` always stamps `device_id` before a `RunState`
    /// becomes push-dirty — but this keeps that invariant enforced here
    /// instead of unwrapping and risking a push-loop panic if it's ever
    /// violated).
    fn from_local(r: &RunState, user_id: &str) -> Option<Self> {
        Some(RemoteRunState {
            user_id: user_id.to_string(),
            device_id: r.device_id.clone()?,
            device_name: r.device_name.clone(),
            active_task_id: r.active_task_id.clone(),
            running_start: r.running_start,
            phase: r.phase.clone(),
            break_start: r.break_start,
            last_task_id: r.last_task_id.clone(),
            cycles_completed: r.cycles_completed,
            long_break: r.long_break,
            updated_at: r.updated_at,
        })
    }
    fn into_local(self) -> RunState {
        RunState {
            active_task_id: self.active_task_id,
            running_start: self.running_start,
            phase: self.phase,
            break_start: self.break_start,
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
struct RemoteConfig {
    user_id: String,
    mode: String,
    target_min: i64,
    work_min: i64,
    break_min: i64,
    break_sound: String,
    work_sound: String,
    #[serde(default = "default_remote_cycles_before_long_break")]
    cycles_before_long_break: i64,
    #[serde(default = "default_remote_long_break_min")]
    long_break_min: i64,
    updated_at: i64,
}

fn default_remote_cycles_before_long_break() -> i64 {
    SessionConfig::default().cycles_before_long_break
}

fn default_remote_long_break_min() -> i64 {
    SessionConfig::default().long_break_min
}

impl RemoteConfig {
    fn from_local(c: &SessionConfig, user_id: &str) -> Self {
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
    fn into_local(self) -> SessionConfig {
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

// ---- HTTP ----

fn upsert<T: Serialize>(access_token: &str, table: &str, rows: &[T]) -> Result<(), String> {
    if rows.is_empty() {
        return Ok(());
    }
    let resp = client()
        .post(rest_url(table))
        .header("apikey", SUPABASE_PUBLISHABLE_KEY)
        .header("Authorization", format!("Bearer {access_token}"))
        .header("Prefer", "resolution=merge-duplicates,return=minimal")
        .json(rows)
        .send()
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let status = resp.status();
        return Err(format!(
            "push to {table} failed: HTTP {status} — {}",
            resp.text().unwrap_or_default()
        ));
    }
    Ok(())
}

fn fetch_since<T: for<'de> Deserialize<'de>>(
    access_token: &str,
    table: &str,
    cursor: i64,
) -> Result<Vec<T>, String> {
    // `cursor` is a plain integer, so no percent-encoding is needed here —
    // hand-building this one simple query string avoids pulling in
    // reqwest's `query` feature for a single call site.
    let url = format!("{}?updated_at=gt.{cursor}", rest_url(table));
    let resp = client()
        .get(url)
        .header("apikey", SUPABASE_PUBLISHABLE_KEY)
        .header("Authorization", format!("Bearer {access_token}"))
        .send()
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let status = resp.status();
        return Err(format!(
            "pull from {table} failed: HTTP {status} — {}",
            resp.text().unwrap_or_default()
        ));
    }
    resp.json::<Vec<T>>().map_err(|e| e.to_string())
}

fn push(db: &Db, access_token: &str, user_id: &str) -> Result<(), String> {
    let cursor = db.get_push_cursor();
    let (lists, tasks, sessions) = db.dirty_since(cursor).map_err(|e| e.to_string())?;
    let priorities = db
        .life_area_priorities_dirty_since(cursor)
        .map_err(|e| e.to_string())?;
    let now = now_ms();

    upsert(
        access_token,
        "lists",
        &lists
            .iter()
            .map(|l| RemoteList::from_local(l, user_id))
            .collect::<Vec<_>>(),
    )?;
    upsert(
        access_token,
        "tasks",
        &tasks
            .iter()
            .map(|t| RemoteTask::from_local(t, user_id))
            .collect::<Vec<_>>(),
    )?;
    upsert(
        access_token,
        "sessions",
        &sessions
            .iter()
            .map(|s| RemoteSession::from_local(s, user_id))
            .collect::<Vec<_>>(),
    )?;
    upsert(
        access_token,
        "life_area_priorities",
        &priorities
            .iter()
            .map(|p| RemoteLifeAreaPriority::from_local(p, user_id))
            .collect::<Vec<_>>(),
    )?;

    // `run_state` is a single JSON blob under `meta` (see `Db::get_run`/
    // `set_run`), not a real SQL table — it isn't covered by `dirty_since`,
    // so check its own `updated_at` against the same push cursor directly.
    // This is also exactly what keeps an idle device from re-pushing (and
    // thereby re-claiming ownership of) a session it isn't actually running:
    // `updated_at` only advances on an actual local play/stop/phase
    // transition (see `RunState::updated_at`'s doc comment in models.rs), so
    // a device that hasn't touched its timer never has anything dirty here.
    let run = db.get_run();
    if run.updated_at > cursor {
        if let Some(remote_run) = RemoteRunState::from_local(&run, user_id) {
            upsert(access_token, "run_state", &[remote_run])?;
        }
    }

    // Same story as run_state, one paragraph up — `config` is also a `meta`
    // JSON blob, not a real table, and only push it if a local settings
    // change actually bumped its own `updated_at` past the cursor.
    let config = db.get_config();
    if config.updated_at > cursor {
        upsert(
            access_token,
            "config",
            &[RemoteConfig::from_local(&config, user_id)],
        )?;
    }

    db.set_push_cursor(now).map_err(|e| e.to_string())
}

/// Returns `true` if anything pulled from the remote actually changed local data.
///
/// `force`: when true, applies every pulled row unconditionally (remote wins
/// even over a locally-newer row) via `upsert_from_remote_force`, and pulls
/// from the epoch (`cursor=0`) regardless of the stored pull cursor, instead
/// of the normal incremental `updated_at > cursor` watermark. Used only for
/// the one-time authoritative pull right after sign-in — see `sync_login`'s
/// doc comment for why plain LWW isn't good enough there.
fn pull(db: &Db, access_token: &str, force: bool) -> Result<bool, String> {
    let cursor = if force { 0 } else { db.get_pull_cursor() };
    let now = now_ms();

    // Parent-before-child, same as `Db::upsert_from_remote` applies them —
    // matters for a moment mid-sync even though SQLite has no FK constraints.
    let lists: Vec<TaskList> = fetch_since::<RemoteList>(access_token, "lists", cursor)?
        .into_iter()
        .map(RemoteList::into_local)
        .collect();
    let tasks: Vec<Task> = fetch_since::<RemoteTask>(access_token, "tasks", cursor)?
        .into_iter()
        .map(RemoteTask::into_local)
        .collect();
    let sessions: Vec<Session> = fetch_since::<RemoteSession>(access_token, "sessions", cursor)?
        .into_iter()
        .map(RemoteSession::into_local)
        .collect();
    let priorities: Vec<LifeAreaPriority> =
        fetch_since::<RemoteLifeAreaPriority>(access_token, "life_area_priorities", cursor)?
            .into_iter()
            .map(RemoteLifeAreaPriority::into_local)
            .collect();
    // At most one row ever comes back — `run_state` is a singleton keyed by
    // `user_id` (see docs/session-sync-design.md) — but `fetch_since` still
    // returns a `Vec` since it's a generic PostgREST GET.
    let run_states: Vec<RunState> =
        fetch_since::<RemoteRunState>(access_token, "run_state", cursor)?
            .into_iter()
            .map(RemoteRunState::into_local)
            .collect();
    // Same singleton-row caveat as run_state.
    let configs: Vec<SessionConfig> = fetch_since::<RemoteConfig>(access_token, "config", cursor)?
        .into_iter()
        .map(RemoteConfig::into_local)
        .collect();

    let collection_rows_changed = !lists.is_empty() || !tasks.is_empty() || !sessions.is_empty();
    let mut changed = collection_rows_changed || !priorities.is_empty();
    if collection_rows_changed {
        if force {
            db.upsert_from_remote_force(&lists, &tasks, &sessions)
                .map_err(|e| e.to_string())?;
        } else {
            db.upsert_from_remote(&lists, &tasks, &sessions)
                .map_err(|e| e.to_string())?;
        }
    }
    if !priorities.is_empty() {
        db.upsert_life_area_priorities_from_remote(&priorities, force)
            .map_err(|e| e.to_string())?;
    }
    // Applied separately from the three above: `upsert_run_from_remote`
    // guards on `RunState::updated_at` itself (there's no local SQL row for
    // `dirty_since`-style filtering to have already excluded a stale one),
    // and main.rs needs to react specifically to an *ownership* change here
    // (see `reconcile_run_after_sync`), not just "something changed."
    if let Some(remote_run) = run_states.into_iter().next() {
        if db
            .upsert_run_from_remote(&remote_run)
            .map_err(|e| e.to_string())?
        {
            changed = true;
        }
    }
    // Config, same idea — LWW-guarded on its own `updated_at` rather than a
    // `dirty_since` scan, since it's also just a `meta` blob, not a table.
    if let Some(mut remote_config) = configs.into_iter().next() {
        // `hourly_nudge` is device-local (no remote column; `into_local`
        // filled a default) — carry the current local value through so a
        // remote win on the rest of the config can't flip it here.
        remote_config.hourly_nudge = db.get_config().hourly_nudge;
        if db
            .upsert_config_from_remote(&remote_config)
            .map_err(|e| e.to_string())?
        {
            changed = true;
        }
    }
    // Rewind below "now" rather than advancing straight to it — see
    // `PULL_REWIND_MS` for why. `.max(cursor)` keeps this monotonic even if
    // the rewind window would otherwise put it behind where we already are
    // (e.g. right after a fresh sign-in, or an unusual backward clock jump).
    db.set_pull_cursor((now - PULL_REWIND_MS).max(cursor))
        .map_err(|e| e.to_string())?;
    Ok(changed)
}

/// Recover fields introduced after an older client may already have advanced
/// its incremental pull cursor. This deliberately runs before any push and
/// merges only the new planner fields, rather than force-replacing complete
/// local rows. The durable marker is cleared only after every fetch and local
/// write succeeds, so a transient failure retries on the next sync.
fn backfill_planner_schema(db: &Db, access_token: &str) -> Result<bool, String> {
    let lists = fetch_since::<RemoteList>(access_token, "lists", 0)?
        .into_iter()
        .map(RemoteList::into_local)
        .collect::<Vec<_>>();
    let tasks = fetch_since::<RemoteTask>(access_token, "tasks", 0)?
        .into_iter()
        .map(RemoteTask::into_local)
        .collect::<Vec<_>>();
    let priorities =
        fetch_since::<RemoteLifeAreaPriority>(access_token, "life_area_priorities", 0)?
            .into_iter()
            .map(RemoteLifeAreaPriority::into_local)
            .collect::<Vec<_>>();

    let changed = db
        .backfill_planner_fields_from_remote(&lists, &tasks, &priorities)
        .map_err(|error| error.to_string())?;
    db.clear_sync_schema_backfill()
        .map_err(|error| error.to_string())?;
    Ok(changed)
}

/// Push local changes, then pull remote ones (plain last-write-wins on both
/// sides). Returns `true` if the pull side changed any local data (so the
/// caller knows whether a full `Snapshot` re-render is warranted). This is
/// the normal cadence — the 60s background tick, "Sync now", "Full sync" —
/// for every sync *except* the one right after signing in.
pub fn sync_once(db: &Db, access_token: &str, user_id: &str) -> Result<bool, String> {
    ensure_backend_compatible(access_token)?;
    if let Some(backfill) = db.sync_schema_backfill() {
        return match backfill.as_str() {
            "planner_v1" => backfill_planner_schema(db, access_token),
            unknown => Err(format!(
                "Sync paused: this client does not understand schema backfill {unknown}."
            )),
        };
    }
    push(db, access_token, user_id)?;
    pull(db, access_token, false)
}

/// The one-time sync run immediately after a fresh sign-in (see
/// `main.rs`'s `run_login_sync`). Deliberately pull-only, and forced: no
/// `push()` at all in this cycle, and the pull applies remote rows
/// unconditionally rather than only-if-newer.
///
/// Why not just `sync_once`: plain LWW means whichever `updated_at` is newer
/// wins, and push/pull order doesn't change that outcome. Signing out only
/// clears the auth session — it never touches local SQLite — so edits made
/// while signed out (deletes included) are ordinary, real, newer-than-remote
/// writes. The very next `sync_once` after signing back in would then
/// faithfully push those as "the latest truth," silently tombstoning
/// whatever's on the server. Skipping push and forcing remote to win for
/// this one cycle treats the account's server-side state as authoritative at
/// the moment of sign-in, instead of whatever happened to accumulate locally
/// while disconnected. A row that only exists locally (never reached the
/// server at all) is untouched by the forced pull and still syncs up
/// normally on the next regular cycle.
pub fn sync_login(db: &Db, access_token: &str) -> Result<bool, String> {
    ensure_backend_compatible(access_token)?;
    let changed = pull(db, access_token, true)?;
    db.clear_sync_schema_backfill()
        .map_err(|error| error.to_string())?;
    Ok(changed)
}

#[cfg(test)]
mod compatibility_tests {
    use super::*;

    #[test]
    fn accepts_old_run_state_without_new_pomodoro_fields() {
        let state: RemoteRunState = serde_json::from_value(serde_json::json!({
            "user_id": "user-1",
            "device_id": "device-1",
            "device_name": null,
            "active_task_id": "task-1",
            "running_start": 1000,
            "phase": "work",
            "break_start": null,
            "last_task_id": "task-1",
            "updated_at": 2000
        }))
        .unwrap();

        assert_eq!(state.cycles_completed, 0);
        assert!(!state.long_break);
    }

    #[test]
    fn accepts_old_config_without_long_break_fields() {
        let config: RemoteConfig = serde_json::from_value(serde_json::json!({
            "user_id": "user-1",
            "mode": "pomodoro",
            "target_min": 45,
            "work_min": 25,
            "break_min": 5,
            "break_sound": "Glass",
            "work_sound": "Ping",
            "updated_at": 2000
        }))
        .unwrap();

        assert_eq!(config.cycles_before_long_break, 4);
        assert_eq!(config.long_break_min, 20);
    }

    #[test]
    fn accepts_old_task_without_planner_fields_and_ignores_future_fields() {
        let task: RemoteTask = serde_json::from_value(serde_json::json!({
            "id": "task-1",
            "user_id": "user-1",
            "list_id": "list-1",
            "name": "Old task",
            "depth": null,
            "ord": 1,
            "est": 30,
            "done": null,
            "descr": null,
            "updated_at": 2000,
            "deleted_at": null,
            "album": null,
            "impact_tier": null,
            "impact_sign": 1,
            "deadline_at": null,
            "cadence": null,
            "future_server_field": "ignored"
        }))
        .unwrap();

        assert!(task.daily_windows.is_empty());
        assert_eq!(task.min_session_min, None);
        assert_eq!(task.max_session_min, None);
    }

    #[test]
    fn rejects_backend_missing_a_required_capability() {
        let schema = BackendSchema {
            schema_version: MIN_BACKEND_SCHEMA_VERSION,
            min_supported_client: "0.5.0".to_string(),
            capabilities: vec!["planner_windows_v1".to_string()],
        };

        let error = validate_backend_schema(&schema).unwrap_err();
        assert!(error.contains("life_area_priorities_v1"));
        assert_eq!(schema.min_supported_client, "0.5.0");
    }

    #[test]
    fn rejects_a_client_older_than_the_backend_support_window() {
        let schema = BackendSchema {
            schema_version: MIN_BACKEND_SCHEMA_VERSION,
            min_supported_client: "99.0.0".to_string(),
            capabilities: REQUIRED_BACKEND_CAPABILITIES
                .iter()
                .map(|capability| capability.to_string())
                .collect(),
        };

        let error = validate_backend_schema(&schema).unwrap_err();
        assert!(error.contains("Update TaskPlayer"));
    }
}
