use super::*;

pub(crate) fn spawn(app: &mut tauri::App) {
    // --- 60s background loop: push/pull sync when signed in ---
    // Separate from the 1s loop above on purpose — that one is
    // tuned for a snappy pomodoro/tray refresh; this one does
    // blocking network I/O and would be wasteful (and rate-limit-y)
    // to run every second.
    let sync_handle = app.handle().clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(60));
        guard("60s sync loop", || run_sync(&sync_handle));
    });

    // --- hourly background loop: full resync safety net ---
    // The 60s loop above is incremental (`updated_at > cursor`) —
    // fast, but with one known edge case: a row created on another
    // device can be pushed *after* this device already advanced its
    // pull_cursor past that row's timestamp (see `PULL_REWIND_MS` in
    // sync.rs). The 5-minute rewind window there closes the common
    // case; this is the broader safety net for anything that still
    // slips through, without requiring the user to remember the
    // manual "Full sync" button exists. Silent no-op while signed
    // out, same as the regular 60s sync — this runs unattended, so
    // it shouldn't surface anything the user didn't ask for.
    let full_sync_handle = app.handle().clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(60 * 60));
        guard("hourly full-resync loop", || {
            let state = full_sync_handle.state::<AppState>();
            if state.access_token.lock().unwrap().is_some()
                || auth::load_refresh_token(&state.data_dir).is_some()
            {
                reset_sync_cursors(state.inner());
            }
            run_sync(&full_sync_handle);
        });
    });

    // --- 4-hourly background loop: check for app updates ---
    // The launch-time check (main.js, 4s after boot) covers "did I
    // relaunch after you shipped a release" but nothing else — most
    // users leave the app running for days at a stretch (it's a
    // menu-bar timer). This is the same cadence Chrome/VS Code use
    // for background update polling: frequent enough that a release
    // reaches everyone within a few hours, far below GitHub's
    // unauthenticated rate limit (60 req/hr/IP) even accounting for
    // the launch check and any manual Settings clicks.
    let update_handle = app.handle().clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(60 * 60 * 4));
        guard("4h update-check loop", || {
            tauri::async_runtime::block_on(check_for_update_background(&update_handle));
        });
    });
}
