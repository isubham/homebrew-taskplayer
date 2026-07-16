use super::*;

/// Persists the refresh token, remembers the access token (+ its expiry) in
/// memory, and caches the profile. Shared by the sign-in callback, the
/// startup silent refresh, and every later proactive/reactive re-refresh.
pub(crate) fn store_session(app: &AppHandle, session: auth::Session) {
    let state = app.state::<AppState>();
    if let Err(e) = auth::save_refresh_token(&state.data_dir, &session.refresh_token) {
        // Not fatal — this run stays signed in via the in-memory access
        // token; the user will just be prompted to sign in again next
        // launch if the write never succeeds (e.g. a full disk).
        log_line(format!("failed to save the refresh token: {e}"));
    }
    let expires_at_ms = now_ms() + session.expires_in.max(0) * 1000;
    *state.access_token.lock().unwrap() = Some(AccessToken {
        token: session.access_token,
        expires_at_ms,
    });
    let db = state.db.lock().unwrap();
    let _ = db.set_account(Some(&session.account));
}

/// Tail of the startup silent refresh (and any later proactive/reactive
/// re-refresh that also wants an immediate sync): store the new session,
/// then run the normal push+pull cycle. Deliberately plain last-write-wins
/// here — a silent refresh means the app was never actually signed out in
/// the interim, so there's no "local edits made while disconnected from the
/// account" scenario to guard against; it's just resuming the same session,
/// same as any other periodic sync tick. See `apply_session_login` for the
/// one case that needs different treatment.
pub(crate) fn apply_session(app: &AppHandle, session: auth::Session) {
    store_session(app, session);
    push(app);
    run_sync(app);
}

/// Tail of the explicit sign-in callback specifically (Google OAuth deep
/// link) — store the new session, then run the one-time authoritative,
/// pull-only login sync instead of the normal push+pull cycle.
///
/// Why this needs to differ from `apply_session`: signing out only clears
/// the auth session, never local SQLite, so any edits made while signed out
/// — including deletes — are real, newer-than-remote local writes sitting
/// there waiting. A plain `run_sync` (push-then-pull, LWW) would treat those
/// as "the latest truth" and push them straight to the server the moment you
/// sign back in, silently overwriting/tombstoning whatever's actually there.
/// `run_login_sync` skips the push and forces remote to win for this one
/// cycle, so signing in always shows you what's actually in your account.
pub(crate) fn apply_session_login(app: &AppHandle, session: auth::Session) {
    store_session(app, session);
    push(app);
    run_login_sync(app);
}

/// Loads the stored refresh token and exchanges it for a new session,
/// storing the result. Used both proactively (token nearing expiry) and
/// reactively (a request already came back 401). Returns the fresh access
/// token so the caller doesn't have to re-lock state to read it back.
pub(crate) fn do_refresh(app: &AppHandle) -> Result<String, auth::TokenRequestError> {
    let state = app.state::<AppState>();
    let refresh_token = auth::load_refresh_token(&state.data_dir)
        .ok_or_else(auth::TokenRequestError::missing_refresh_token)?;
    let session = auth::refresh_session(&refresh_token)?;
    let token = session.access_token.clone();
    store_session(app, session);
    Ok(token)
}

pub(crate) fn record_refresh_failure(
    app: &AppHandle,
    context: &str,
    error: &auth::TokenRequestError,
) {
    let state = app.state::<AppState>();
    if error.invalid_session() {
        log_line(format!("{context} failed; session is invalid: {error}"));
        auth::clear_refresh_token(&state.data_dir);
        *state.access_token.lock().unwrap() = None;
        state.sync_status.lock().unwrap().last_sync_error = Some(SESSION_EXPIRED_MSG.to_string());
    } else {
        log_line(format!(
            "{context} failed; will retry automatically: {error}"
        ));
        state.sync_status.lock().unwrap().last_sync_error = Some(SYNC_RETRY_MSG.to_string());
    }
    push(app);
}

/// Returns a usable access token, refreshing first if the current one is
/// missing or nearing expiry. A missing in-memory token is recoverable when
/// session.json still contains a refresh token (startup/network failures),
/// so every later sync tick retries instead of becoming a permanent no-op.
pub(crate) fn ensure_fresh_token(app: &AppHandle) -> Option<String> {
    let state = app.state::<AppState>();
    let current = state.access_token.lock().unwrap().clone();
    let now = now_ms();
    if let Some(current) = &current {
        if now < current.expires_at_ms - REFRESH_SKEW_MS {
            return Some(current.token.clone());
        }
    } else if auth::load_refresh_token(&state.data_dir).is_none() {
        if state.db.lock().unwrap().get_account().is_some() {
            state.sync_status.lock().unwrap().last_sync_error =
                Some(SESSION_EXPIRED_MSG.to_string());
            push(app);
        }
        return None;
    }
    match do_refresh(app) {
        Ok(token) => Some(token),
        Err(e) => {
            let can_use_current = !e.invalid_session()
                && current
                    .as_ref()
                    .is_some_and(|token| now < token.expires_at_ms);
            record_refresh_failure(app, "proactive token refresh", &e);
            can_use_current.then(|| current.unwrap().token)
        }
    }
}
