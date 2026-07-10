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
use taskplayer_core::{now_ms, Db, RunState, Session, SessionConfig, Task, TaskList};

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
            // life_area/life_direction (see models.rs) are local-only for
            // now — the Supabase `lists` table has no matching columns yet,
            // so a pulled remote row never carries a life tag. Deliberately
            // scoped this way rather than guessing at a remote schema
            // change that can't be verified/applied from here.
            life_area: None,
            life_direction: None,
            deleted_at: self.deleted_at,
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
            // impact_tier/impact_sign (see models.rs) are local-only for now,
            // same reasoning as TaskList's life_area/life_direction — the
            // Supabase `tasks` table has no matching columns yet, so a pulled
            // remote row never carries them. db.rs's `upsert_from_remote`
            // also deliberately excludes these two from its UPDATE SET, so
            // this default doesn't clobber a value already set locally.
            impact_tier: None,
            impact_sign: 1,
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
    cycles_completed: i64,
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
    cycles_before_long_break: i64,
    long_break_min: i64,
    updated_at: i64,
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
        return Err(format!("push to {table} failed: HTTP {status} — {}", resp.text().unwrap_or_default()));
    }
    Ok(())
}

fn fetch_since<T: for<'de> Deserialize<'de>>(access_token: &str, table: &str, cursor: i64) -> Result<Vec<T>, String> {
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
        return Err(format!("pull from {table} failed: HTTP {status} — {}", resp.text().unwrap_or_default()));
    }
    resp.json::<Vec<T>>().map_err(|e| e.to_string())
}

fn push(db: &Db, access_token: &str, user_id: &str) -> Result<(), String> {
    let cursor = db.get_push_cursor();
    let (lists, tasks, sessions) = db.dirty_since(cursor).map_err(|e| e.to_string())?;
    let now = now_ms();

    upsert(access_token, "lists", &lists.iter().map(|l| RemoteList::from_local(l, user_id)).collect::<Vec<_>>())?;
    upsert(access_token, "tasks", &tasks.iter().map(|t| RemoteTask::from_local(t, user_id)).collect::<Vec<_>>())?;
    upsert(access_token, "sessions", &sessions.iter().map(|s| RemoteSession::from_local(s, user_id)).collect::<Vec<_>>())?;

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
        upsert(access_token, "config", &[RemoteConfig::from_local(&config, user_id)])?;
    }

    db.set_push_cursor(now).map_err(|e| e.to_string())
}

/// Returns `true` if anything pulled from the remote actually changed local data.
fn pull(db: &Db, access_token: &str) -> Result<bool, String> {
    let cursor = db.get_pull_cursor();
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
    // At most one row ever comes back — `run_state` is a singleton keyed by
    // `user_id` (see docs/session-sync-design.md) — but `fetch_since` still
    // returns a `Vec` since it's a generic PostgREST GET.
    let run_states: Vec<RunState> = fetch_since::<RemoteRunState>(access_token, "run_state", cursor)?
        .into_iter()
        .map(RemoteRunState::into_local)
        .collect();
    // Same singleton-row caveat as run_state.
    let configs: Vec<SessionConfig> = fetch_since::<RemoteConfig>(access_token, "config", cursor)?
        .into_iter()
        .map(RemoteConfig::into_local)
        .collect();

    let mut changed = !lists.is_empty() || !tasks.is_empty() || !sessions.is_empty();
    if changed {
        db.upsert_from_remote(&lists, &tasks, &sessions).map_err(|e| e.to_string())?;
    }
    // Applied separately from the three above: `upsert_run_from_remote`
    // guards on `RunState::updated_at` itself (there's no local SQL row for
    // `dirty_since`-style filtering to have already excluded a stale one),
    // and main.rs needs to react specifically to an *ownership* change here
    // (see `reconcile_run_after_sync`), not just "something changed."
    if let Some(remote_run) = run_states.into_iter().next() {
        if db.upsert_run_from_remote(&remote_run).map_err(|e| e.to_string())? {
            changed = true;
        }
    }
    // Config, same idea — LWW-guarded on its own `updated_at` rather than a
    // `dirty_since` scan, since it's also just a `meta` blob, not a table.
    if let Some(remote_config) = configs.into_iter().next() {
        if db.upsert_config_from_remote(&remote_config).map_err(|e| e.to_string())? {
            changed = true;
        }
    }
    // Rewind below "now" rather than advancing straight to it — see
    // `PULL_REWIND_MS` for why. `.max(cursor)` keeps this monotonic even if
    // the rewind window would otherwise put it behind where we already are
    // (e.g. right after a fresh sign-in, or an unusual backward clock jump).
    db.set_pull_cursor((now - PULL_REWIND_MS).max(cursor)).map_err(|e| e.to_string())?;
    Ok(changed)
}

/// Push local changes, then pull remote ones. Returns `true` if the pull
/// side changed any local data (so the caller knows whether a full
/// `Snapshot` re-render is warranted).
pub fn sync_once(db: &Db, access_token: &str, user_id: &str) -> Result<bool, String> {
    push(db, access_token, user_id)?;
    pull(db, access_token)
}
