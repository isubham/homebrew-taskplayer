use super::*;

pub(crate) fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // Ask for notification permission once, up front, rather than
    // waiting for the first pomodoro transition to trigger the OS
    // prompt — that would eat the very first "break time" ping
    // while the user is mid-dialog. Logged (not discarded) because
    // a denied/unsupported result is the single most likely reason
    // a user sees no banner at all, and this is otherwise invisible
    // outside a debugger.
    match app.notification().request_permission() {
        Ok(state) => log_line(format!("notification permission state: {state:?}")),
        Err(e) => log_line(format!("notification permission request failed: {e}")),
    }

    // --- open the SQLite database in the OS app-data dir ---
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir());
    std::fs::create_dir_all(&dir).ok();
    let db_path = dir.join("taskplayer.sqlite3");
    let db = Db::open(db_path.to_str().unwrap()).expect("failed to open database");
    let run = db.get_run();
    let config = db.get_config();
    let device_id = db.get_device_id();
    app.manage(AppState {
        db: Mutex::new(db),
        run: Mutex::new(run),
        config: Mutex::new(config),
        device_id,
        device_name: device_name(),
        pending_pkce: Mutex::new(None),
        access_token: Mutex::new(None),
        sync_status: Mutex::new(SyncStatus::default()),
        tray_state: Mutex::new(TrayState::default()),
        music_playing: Mutex::new(false),
        pending_update: Mutex::new(None),
        last_notified_update_version: Mutex::new(None),
        data_dir: dir.clone(),
        session_notify: Mutex::new(SessionNotify::default()),
    });
    system_sleep::register(app.handle());

    // --- Google Sign-In: deep-link callback + silent refresh on startup ---
    {
        let handle = app.handle().clone();
        app.deep_link().on_open_url(move |event| {
            let Some(url) = event.urls().first().cloned() else {
                return;
            };
            let Some(code) = auth::extract_code(url.as_str()) else {
                return;
            };
            let pkce = {
                let state = handle.state::<AppState>();
                let taken = state.pending_pkce.lock().unwrap().take();
                taken
            };
            let Some(pkce) = pkce else {
                log_line("received an OAuth callback with no sign-in in progress — ignoring");
                return;
            };
            let handle2 = handle.clone();
            std::thread::spawn(move || match auth::exchange_code(&code, &pkce.verifier) {
                Ok(session) => apply_session_login(&handle2, session),
                Err(e) => log_line(format!("Google sign-in failed: {e}")),
            });
        });
    }
    {
        let handle = app.handle().clone();
        let dir = dir.clone();
        std::thread::spawn(move || {
            let Some(refresh_token) = auth::load_refresh_token(&dir) else {
                return;
            };
            match auth::refresh_session(&refresh_token) {
                Ok(session) => apply_session(&handle, session),
                Err(e) => {
                    // Invalid sessions need a new sign-in; transport
                    // failures keep the refresh token and recover on
                    // the next 60s/focus/manual sync attempt.
                    record_refresh_failure(&handle, "silent session refresh", &e);
                }
            }
        });
    }

    // --- menu-bar tray ---
    let menu = build_tray_menu(app.handle())?;

    // The icon is colored by run state (green = focus session running,
    // yellow = on break/awaiting, white = stopped — see refresh() below),
    // so it cannot be a macOS template image: template mode forces every
    // non-transparent pixel to the system monochrome foreground color.
    // The "(Dev)" tooltip remains the dev/release distinction.
    let tray = TrayIconBuilder::with_id("tray")
        .icon(tauri::include_image!("icons/menubar-idle.png"))
        .icon_as_template(false)
        .tooltip(if cfg!(debug_assertions) {
            "TaskPlayer (Dev)"
        } else {
            "TaskPlayer"
        })
        .menu(&menu)
        // .show_menu_on_left_click(true)
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            if let Some(task_id) = id.strip_prefix("recent:") {
                let state = app.state::<AppState>();
                let _ = do_play(state.inner(), task_id, TIMER_PAUSE_TRIGGER_TRAY_RECENT);
                push(app);
                return;
            }
            match id {
                "open" => open_main(app.clone()),
                "toggle" => {
                    let state = app.state::<AppState>();
                    let active = state.run.lock().unwrap().active_task_id.is_some();
                    if active {
                        do_stop(
                            state.inner(),
                            TIMER_PAUSE_REASON_EXPLICIT_STOP,
                            TIMER_PAUSE_TRIGGER_TRAY_TOGGLE,
                        );
                    } else {
                        // resume the remembered task if it still exists, else the first task
                        let last = state.run.lock().unwrap().last_task_id.clone();
                        let target = {
                            let db = state.db.lock().unwrap();
                            let tasks = db.tasks().unwrap_or_default();
                            last.filter(|id| {
                                tasks
                                    .iter()
                                    .any(|t| &t.id == id && t.completed_at.is_none())
                            })
                            .or_else(|| {
                                tasks
                                    .iter()
                                    .find(|t| t.completed_at.is_none())
                                    .map(|t| t.id.clone())
                            })
                        };
                        if let Some(id) = target {
                            let _ = do_play(state.inner(), &id, TIMER_PAUSE_TRIGGER_TRAY_TOGGLE);
                        }
                    }
                    push(app);
                }
                TRAY_FINISH_SESSION_ID => {
                    let state = app.state::<AppState>();
                    do_finish_session(state.inner(), now_ms());
                    push(app);
                }
                // The actual <audio> element lives in the webview (music.js), so
                // Rust can't play/pause/skip it directly — just forward the
                // intent as an event and let the frontend act on it.
                "music_toggle" => {
                    let _ = app.emit("music-toggle", ());
                }
                "music_next" => {
                    let _ = app.emit("music-next", ());
                }
                _ => {}
            }
        });
    tray.build(app)?;

    tick_loop::spawn(app);
    background_jobs::spawn(app);
    Ok(())
}
