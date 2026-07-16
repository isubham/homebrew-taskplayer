use super::super::*;

/// Mirrors the focus-music widget's play/pause state into Rust purely so the
/// tray's music toggle can show the right label — the actual `<audio>`
/// element lives in the webview (music.js), Rust never touches it directly.
/// The frontend calls this every time window.Music's own state changes.
#[specta::specta]
#[tauri::command]
pub(crate) fn set_music_playing(app: AppHandle, state: State<AppState>, playing: bool) -> Snapshot {
    *state.music_playing.lock().unwrap() = playing;
    push(&app);
    build_snapshot(state.inner())
}

/// Opens a URL in the system's default browser — used by the in-app "View on
/// Audius" button (a plain `<a href>` would just navigate the app's own
/// webview away instead).
#[specta::specta]
#[tauri::command]
pub(crate) fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

#[derive(serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateInfo {
    pub(crate) version: String,
    pub(crate) notes: Option<String>,
}

/// Asks the configured endpoint (Casks/taskplayer.rb's own GitHub Releases —
/// see `scripts/release.sh`) whether a newer signed build exists. Stashes the
/// `Update` handle (it carries the download URL + signature) in `AppState`
/// so `install_update` doesn't have to re-check; the frontend only ever
/// sees the plain version/notes, never the handle itself.
#[specta::specta]
#[tauri::command]
pub(crate) async fn check_for_update(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<UpdateInfo>, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    match updater.check().await.map_err(|e| e.to_string())? {
        Some(update) => {
            let info = UpdateInfo {
                version: update.version.clone(),
                notes: update.body.clone(),
            };
            *state.pending_update.lock().unwrap() = Some(update);
            Ok(Some(info))
        }
        None => {
            *state.pending_update.lock().unwrap() = None;
            Ok(None)
        }
    }
}

/// Same check as `check_for_update`, but run unattended from the 4-hourly
/// background loop (see the timer setup below) instead of the Settings page.
/// Stashes the handle exactly like the manual path (so "Install" from a
/// notification's follow-up Settings visit works without re-checking), but
/// additionally fires a system notification — gated on
/// `last_notified_update_version` so the same release doesn't re-notify
/// every cycle until the user updates or a newer version ships.
pub(crate) async fn check_for_update_background(app: &AppHandle) {
    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => {
            log_line(format!("background update check: updater() failed: {e}"));
            return;
        }
    };
    let update = match updater.check().await {
        Ok(u) => u,
        Err(e) => {
            log_line(format!("background update check failed: {e}"));
            return;
        }
    };
    let state = app.state::<AppState>();
    let Some(update) = update else {
        *state.pending_update.lock().unwrap() = None;
        return;
    };
    let version = update.version.clone();
    let already_notified = state
        .last_notified_update_version
        .lock()
        .unwrap()
        .as_deref()
        == Some(version.as_str());
    *state.pending_update.lock().unwrap() = Some(update.clone());
    if already_notified {
        return;
    }
    *state.last_notified_update_version.lock().unwrap() = Some(version.clone());
    let notif_app = app.clone();
    let _ = app.run_on_main_thread(move || {
        match notif_app
            .notification()
            .builder()
            .title("TaskPlayer update available")
            .body(format!(
                "Version {version} is ready — open Settings to install."
            ))
            .show()
        {
            Ok(()) => {}
            Err(e) => log_line(format!(
                "notification show() failed (update available): {e}"
            )),
        }
    });
}

/// Downloads + installs whatever `check_for_update` last found, then
/// restarts. Errors (network drop mid-download, signature mismatch, disk
/// full) surface to the Settings page instead of leaving the app in a half
/// -updated state; nothing here touches the user's data — `AppState`'s SQLite
/// handle is untouched by the app-bundle swap, which is the whole point of
/// updating the .app rather than reinstalling.
#[specta::specta]
#[tauri::command]
pub(crate) async fn install_update(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let update = state
        .pending_update
        .lock()
        .unwrap()
        .take()
        .ok_or_else(|| "No update ready to install — check for updates again.".to_string())?;
    update
        .download_and_install(|_chunk_len, _total_len| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    app.restart();
}
