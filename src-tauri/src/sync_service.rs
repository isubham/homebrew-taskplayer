use super::*;

/// Runs one push+pull cycle if signed in; no-ops silently otherwise. Safe to
/// call from a background thread because every caller already runs on one.
pub(crate) fn run_sync(app: &AppHandle) {
    let state = app.state::<AppState>();
    let Some(mut access_token) = ensure_fresh_token(app) else {
        return;
    };
    let Some(user_id) = state.db.lock().unwrap().get_account().map(|a| a.id) else {
        return;
    };

    {
        let mut status = state.sync_status.lock().unwrap();
        if status.syncing {
            return;
        }
        if let Some(last_sync) = status.last_synced_at {
            if now_ms() - last_sync < 5000 {
                return;
            }
        }
        status.syncing = true;
    }
    push(app);

    let mut result = {
        let db = state.db.lock().unwrap();
        sync::sync_once(&db, &access_token, &user_id)
    };

    // The proactive refresh above covers the common case, but if the token
    // was revoked, clock-skewed, or expired mid-request anyway, treat a 401
    // as one last chance: refresh and retry once before giving up.
    if matches!(&result, Err(e) if e.contains("HTTP 401")) {
        match do_refresh(app) {
            Ok(new_token) => {
                access_token = new_token;
                let db = state.db.lock().unwrap();
                result = sync::sync_once(&db, &access_token, &user_id);
            }
            Err(e) => {
                // The server already rejected this access token. On a
                // transient refresh failure, drop only the access token;
                // the saved refresh token remains and the next sync retries.
                let invalid_session = e.invalid_session();
                if !invalid_session {
                    *state.access_token.lock().unwrap() = None;
                }
                record_refresh_failure(app, "token refresh after 401", &e);
                result = Err(if invalid_session {
                    SESSION_EXPIRED_MSG
                } else {
                    SYNC_RETRY_MSG
                }
                .to_string());
            }
        }
    }

    {
        let mut status = state.sync_status.lock().unwrap();
        status.syncing = false;
        match &result {
            // Only a real success moves "last synced" forward and clears any
            // prior error — this used to run unconditionally, so the UI's
            // "Synced just now" looked identical whether sync was working or
            // silently failing every single cycle.
            Ok(_) => {
                status.last_synced_at = Some(now_ms());
                status.last_sync_error = None;
            }
            Err(e) => {
                status.last_sync_error = Some(e.clone());
            }
        }
    }

    if let Err(e) = &result {
        log_line(format!("sync failed: {e}"));
    }
    // Regardless of push/pull outcome above: `sync::pull` (inside
    // `sync_once`) writes a newer remote `run_state` row straight to `Db`,
    // bypassing the in-memory `state.run` every command handler and the tick
    // loop actually use — reconcile the two now so a session taken over on
    // another device shows up here without needing an app restart. See
    // `reconcile_run_after_sync`'s doc comment.
    reconcile_run_after_sync(state.inner());
    reconcile_config_after_sync(state.inner());
    push(app);
}

/// Companion to `run_sync`, used exactly once — right after a fresh explicit
/// sign-in (see `apply_session_login`). Same shape (token refresh, 401 retry,
/// sync_status bookkeeping, reconcile calls), but calls `sync::sync_login`
/// instead of `sync::sync_once`: no push, and the pull applies remote
/// unconditionally rather than only-if-newer. See `sync::sync_login`'s doc
/// comment for the full rationale.
pub(crate) fn run_login_sync(app: &AppHandle) {
    let state = app.state::<AppState>();
    let Some(mut access_token) = ensure_fresh_token(app) else {
        return;
    };
    // `sync_login` doesn't push, so it has no need for `user_id` — but a
    // missing local account here would still mean "not really signed in
    // yet," so keep the same guard `run_sync` uses before doing any network
    // work.
    if state.db.lock().unwrap().get_account().is_none() {
        return;
    }

    {
        let mut status = state.sync_status.lock().unwrap();
        if status.syncing {
            return;
        }
        status.syncing = true;
    }
    push(app);

    let mut result = {
        let db = state.db.lock().unwrap();
        sync::sync_login(&db, &access_token)
    };

    // Same 401-retry-once safety net as `run_sync`.
    if matches!(&result, Err(e) if e.contains("HTTP 401")) {
        match do_refresh(app) {
            Ok(new_token) => {
                access_token = new_token;
                let db = state.db.lock().unwrap();
                result = sync::sync_login(&db, &access_token);
            }
            Err(e) => {
                let invalid_session = e.invalid_session();
                if !invalid_session {
                    *state.access_token.lock().unwrap() = None;
                }
                record_refresh_failure(app, "token refresh after 401", &e);
                result = Err(if invalid_session {
                    SESSION_EXPIRED_MSG
                } else {
                    SYNC_RETRY_MSG
                }
                .to_string());
            }
        }
    }

    {
        let mut status = state.sync_status.lock().unwrap();
        status.syncing = false;
        match &result {
            Ok(_) => {
                status.last_synced_at = Some(now_ms());
                status.last_sync_error = None;
            }
            Err(e) => {
                status.last_sync_error = Some(e.clone());
            }
        }
    }

    if let Err(e) = &result {
        log_line(format!("login sync failed: {e}"));
    }
    reconcile_run_after_sync(state.inner());
    reconcile_config_after_sync(state.inner());
    push(app);
}
