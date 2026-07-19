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
    canonical_life_area, now_ms, Db, LifeAreaPriority, MusicFavorite, PlannedSession, RunState,
    Session, SessionConfig, Task, TaskList, UserSettings, WeeklyTimeWindow,
};

mod backfill;
mod compatibility;
mod content_models;
mod music_models;
mod planner_models;
mod pull;
mod push;
mod runtime_models;
mod transport;

use backfill::*;
use compatibility::*;
use content_models::*;
use music_models::*;
use planner_models::*;
use pull::*;
use push::*;
use runtime_models::*;
use transport::*;

/// Pushes local changes, then pulls remote changes using last-write-wins.
pub fn sync_once(db: &Db, access_token: &str, user_id: &str) -> Result<bool, String> {
    ensure_backend_compatible(access_token)?;
    if let Some(backfill) = db.sync_schema_backfill() {
        return backfill_schema(db, access_token, &backfill);
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
include!("sync/compatibility_tests.rs");
