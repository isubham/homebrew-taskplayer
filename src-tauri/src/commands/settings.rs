use super::super::*;

#[specta::specta]
#[tauri::command]
pub(crate) fn set_mode(app: AppHandle, state: State<AppState>, mode: String) -> Snapshot {
    {
        let mut c = state.config.lock().unwrap();
        c.mode = mode;
        c.updated_at = now_ms();
        let db = state.db.lock().unwrap();
        let _ = db.set_config(&c);
    }
    push(&app);
    build_snapshot(state.inner())
}

/// Device-local interface zoom. The frontend keeps the selected step in
/// localStorage; this clamp is the final boundary so no caller can push the
/// app below 80% or above 130%.
#[specta::specta]
#[tauri::command]
pub(crate) fn set_app_zoom(window: tauri::WebviewWindow, scale: f64) -> Result<(), String> {
    let requested = if scale.is_finite() { scale } else { 1.0 };
    let clamped = ((requested * 10.0).round() / 10.0).clamp(0.8, 1.3);
    window.set_zoom(clamped).map_err(|error| error.to_string())
}

#[specta::specta]
#[tauri::command]
pub(crate) fn set_config_field(
    app: AppHandle,
    state: State<AppState>,
    key: String,
    value: i32,
) -> Snapshot {
    {
        let value = value as i64;
        let mut c = state.config.lock().unwrap();
        match key.as_str() {
            "targetMin" => c.target_min = value.clamp(1, 240),
            "workMin" => c.work_min = value.clamp(1, 120),
            "breakMin" => c.break_min = value.clamp(1, 60),
            "cyclesBeforeLongBreak" => c.cycles_before_long_break = value.clamp(1, 12),
            "longBreakMin" => c.long_break_min = value.clamp(1, 60),
            // Checkbox-valued: the frontend sends 1/0. Device-local (never
            // pushed to the remote config row — see models.rs), but stored
            // in the same config blob; the updated_at bump below is harmless.
            "hourlyNudge" => c.hourly_nudge = value != 0,
            _ => {}
        }
        // Cross-device settings sync (see docs/session-sync-design.md's
        // singleton-row pattern, reused here for `config`) — bump this on
        // every actual change so the next push cycle picks it up. Harmless
        // to bump even on the `_ => {}` no-op-key case; not worth a second
        // branch just to skip a timestamp write for a key that was already
        // rejected before touching any real field.
        c.updated_at = now_ms();
        let db = state.db.lock().unwrap();
        let _ = db.set_config(&c);
    }
    push(&app);
    build_snapshot(state.inner())
}

/// Same shape as `set_config_field`, split out because the two sound pickers
/// are string-valued (a system sound name) rather than the clamped integers
/// every other pomodoro setting uses. Falls back silently to the existing
/// value for anything not in `SOUND_OPTIONS` — the picker only ever sends one
/// of those, so this only guards against a stale/tampered frontend value.
#[specta::specta]
#[tauri::command]
pub(crate) fn set_config_sound(
    app: AppHandle,
    state: State<AppState>,
    key: String,
    value: String,
) -> Snapshot {
    {
        let mut c = state.config.lock().unwrap();
        if SOUND_OPTIONS.contains(&value.as_str()) {
            match key.as_str() {
                "breakSound" => c.break_sound = value,
                "workSound" => c.work_sound = value,
                _ => {}
            }
            c.updated_at = now_ms();
        }
        let db = state.db.lock().unwrap();
        let _ = db.set_config(&c);
    }
    push(&app);
    build_snapshot(state.inner())
}

/// Opens the system browser to Google's consent screen and returns
/// immediately — the deep-link callback (registered in `setup()`) drives
/// the rest of the flow asynchronously and calls `push()` once signed in.
#[specta::specta]
#[tauri::command]
pub(crate) fn sign_in_google(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    let pkce = auth::generate_pkce();
    let url = auth::authorize_url(&pkce);
    *state.pending_pkce.lock().unwrap() = Some(pkce);
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

#[specta::specta]
#[tauri::command]
pub(crate) fn sign_out(app: AppHandle, state: State<AppState>) -> Snapshot {
    auth::clear_refresh_token(&state.data_dir);
    *state.access_token.lock().unwrap() = None;
    *state.sync_status.lock().unwrap() = SyncStatus::default();
    {
        let db = state.db.lock().unwrap();
        let _ = db.set_account(None::<&AccountInfo>);
    }
    push(&app);
    build_snapshot(state.inner())
}

/// Fire-and-forget, like `sign_in_google` — the eventual `push()`/`refresh()`
/// inside `run_sync` notifies the frontend once the sync finishes.
#[specta::specta]
#[tauri::command]
pub(crate) fn sync_now(app: AppHandle) {
    // Always enter run_sync: an absent in-memory access token may only mean
    // startup refresh happened while offline. `ensure_fresh_token` retries
    // the saved refresh token and distinguishes that from an expired login.
    std::thread::spawn(move || run_sync(&app));
}

/// Resets both cursors to the epoch so the next `run_sync` re-pulls (and
/// re-pushes) everything from scratch, instead of trusting the incremental
/// `updated_at > cursor` watermarks. Safe to run any time — every apply on
/// either side is an idempotent upsert (`ON CONFLICT ... WHERE
/// excluded.updated_at > x.updated_at`), so re-sending rows that are already
/// in sync is just wasted bandwidth, never a correctness problem. Shared by
/// the manual "Full sync" button and the hourly automatic safety net.
pub(crate) fn reset_sync_cursors(state: &AppState) {
    let db = state.db.lock().unwrap();
    let _ = db.set_push_cursor(0);
    let _ = db.set_pull_cursor(0);
}

/// Escape hatch for exactly the "other device's row never showed up" case —
/// see `reset_sync_cursors`.
#[specta::specta]
#[tauri::command]
pub(crate) fn full_sync(app: AppHandle) {
    let state = app.state::<AppState>();
    reset_sync_cursors(state.inner());
    std::thread::spawn(move || run_sync(&app));
}

#[specta::specta]
#[tauri::command]
pub(crate) fn open_main(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Curated set of classic macOS system sound names — these ship with every
/// Mac (`/System/Library/Sounds/*.aiff`) and are what `NotificationBuilder::sound`
/// resolves by name, so there's nothing to bundle. Shared with the frontend via
/// `sound_options()` so the Settings picker can never drift out of sync with
/// what the backend actually accepts.
#[specta::specta]
#[tauri::command]
pub(crate) fn sound_options() -> Vec<&'static str> {
    SOUND_OPTIONS.to_vec()
}
