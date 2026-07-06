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
use taskplayer_core::{now_ms, Db, Session, Task, TaskList};

fn client() -> reqwest::blocking::Client {
    reqwest::blocking::Client::new()
}

fn rest_url(table: &str) -> String {
    format!("{SUPABASE_URL}/rest/v1/{table}")
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

    let changed = !lists.is_empty() || !tasks.is_empty() || !sessions.is_empty();
    if changed {
        db.upsert_from_remote(&lists, &tasks, &sessions).map_err(|e| e.to_string())?;
    }
    db.set_pull_cursor(now).map_err(|e| e.to_string())?;
    Ok(changed)
}

/// Push local changes, then pull remote ones. Returns `true` if the pull
/// side changed any local data (so the caller knows whether a full
/// `Snapshot` re-render is warranted).
pub fn sync_once(db: &Db, access_token: &str, user_id: &str) -> Result<bool, String> {
    push(db, access_token, user_id)?;
    pull(db, access_token)
}
