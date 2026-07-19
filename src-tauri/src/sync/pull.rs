use super::*;

/// Pulls remote changes; `force` makes the server authoritative for login sync.
pub(super) fn pull(db: &Db, access_token: &str, force: bool) -> Result<bool, String> {
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
    let music_favorites: Vec<MusicFavorite> =
        fetch_since::<RemoteMusicFavorite>(access_token, "music_favorites", cursor)?
            .into_iter()
            .map(RemoteMusicFavorite::into_local)
            .collect();
    let planned_sessions: Vec<PlannedSession> =
        fetch_since::<RemotePlannedSession>(access_token, "planned_sessions", cursor)?
            .into_iter()
            .map(RemotePlannedSession::into_local)
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
    let user_settings: Vec<UserSettings> =
        fetch_since::<RemoteUserSettings>(access_token, "user_settings", cursor)?
            .into_iter()
            .map(RemoteUserSettings::into_local)
            .collect();

    let collection_rows_changed = !lists.is_empty() || !tasks.is_empty() || !sessions.is_empty();
    let mut changed = collection_rows_changed
        || !priorities.is_empty()
        || !music_favorites.is_empty()
        || !planned_sessions.is_empty();
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
    if !music_favorites.is_empty() {
        db.upsert_music_favorites_from_remote(&music_favorites, force)
            .map_err(|e| e.to_string())?;
    }
    if !planned_sessions.is_empty() {
        db.upsert_planned_sessions_from_remote(&planned_sessions, force)
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
    if let Some(remote_settings) = user_settings.into_iter().next() {
        if db
            .upsert_user_settings_from_remote(&remote_settings, force)
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
