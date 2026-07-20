use super::*;

pub(crate) fn spawn(app: &mut tauri::App) {
    // --- background loop: pomodoro transitions + tray refresh ---
    let handle = app.handle().clone();
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(Duration::from_millis(TIMER_TICK_INTERVAL_MS));
            // The whole per-tick body is panic-guarded: this thread runs
            // for the entire lifetime of the app, so an unhandled panic
            // here (a bug we didn't anticipate) would otherwise silently
            // kill the loop forever — the pomodoro timer and tray would
            // just stop advancing, with nothing visible to say why. This
            // way the worst case is "one tick got skipped and logged",
            // not "the timer is now permanently broken until restart".
            guard("pomodoro tick", || {
                let state = handle.state::<AppState>();
                let now = now_ms();

                let owned = is_own(&state.run.lock().unwrap(), &state.device_id);

                // Mirroring another device's session: never drive its FSM
                // from here — that machinery (phase transitions, session
                // logging, break/work notifications) belongs solely to the
                // device actually running it. Driving it locally too would
                // double-log completed sessions and double-fire
                // notifications. Just keep the tray/window elapsed-time
                // display live (`refresh` recomputes it straight off
                // `run.running_start`/`break_start`, which is harmless to
                // read from any device) and skip the rest of this tick.
                if !owned {
                    refresh(&handle);
                    return;
                }

                let (run, config) = {
                    (
                        state.run.lock().unwrap().clone(),
                        state.config.lock().unwrap().clone(),
                    )
                };
                let (nr, t) = timer::tick(&run, &config, now);
                let mut transitioned = false;
                match t {
                    timer::Tick::None => {}
                    timer::Tick::ToBreak(log) => {
                        // lock order run -> db (matches command handlers) to avoid deadlock
                        let run_clone = {
                            let mut r = state.run.lock().unwrap();
                            let mut nr = nr;
                            stamp_own(&mut nr, &state.device_id, &state.device_name);
                            *r = nr;
                            r.clone()
                        };
                        let (name, session_status, run_status) = {
                            let db = state.db.lock().unwrap();
                            let session_result = db.add_session_interval(
                                &log,
                                run.active_session_id.as_deref(),
                                None,
                            );
                            let run_result = db.set_run(&run_clone);
                            (
                                task_name_for_notification(&db, &log.task_id),
                                timer_write_status(&session_result),
                                timer_write_status(&run_result),
                            )
                        };
                        log_timer_pause(
                            state.inner(),
                            TIMER_PAUSE_REASON_POMODORO_BREAK,
                            TIMER_PAUSE_TRIGGER_POMODORO_TICK,
                            &run,
                            now,
                            &session_status,
                            &run_status,
                        );
                        // The break is already running in `run_clone`; the
                        // notification is information, not a prompt requiring
                        // another action. Never surface the main window here —
                        // the user may still be finishing a thought in
                        // hyperfocus even though break time has begun.
                        // Dispatch on the main thread because macOS notification
                        // center is not safe to call from this background loop.
                        let notif_handle = handle.clone();
                        // `run_clone.long_break` was set by `timer::tick` the moment
                        // the cycle threshold was hit — substitute the long-break
                        // length/title here so the notification matches the
                        // break that just started.
                        let is_long = run_clone.long_break;
                        let break_min = if is_long {
                            config.long_break_min
                        } else {
                            config.break_min
                        };
                        let break_title = if is_long {
                            "Long break ☕☕"
                        } else {
                            "Break time ☕"
                        };
                        let break_sound = config.break_sound.clone();
                        let _ = handle.run_on_main_thread(move || {
                        match notif_handle
                            .notification()
                            .builder()
                            .title(break_title)
                            .body(format!(
                                "Nice work on \"{name}\" — your {break_min}-minute break has started."
                            ))
                            .sound(break_sound)
                            .show()
                        {
                            Ok(()) => {}
                            Err(e) => log_line(format!("notification show() failed (ToBreak): {e}")),
                        }
                    });
                        transitioned = true;
                    }
                    timer::Tick::ToWork => {
                        let run_clone = {
                            let mut r = state.run.lock().unwrap();
                            let mut nr = nr;
                            stamp_own(&mut nr, &state.device_id, &state.device_name);
                            *r = nr;
                            r.clone()
                        };
                        let name = {
                            let db = state.db.lock().unwrap();
                            let _ = db.set_run(&run_clone);
                            run_clone
                                .active_task_id
                                .as_deref()
                                .map(|id| task_name_for_notification(&db, id))
                                .unwrap_or_else(|| "your task".to_string())
                        };
                        // Work is already running again in `run_clone`; notify
                        // without forcing the app window forward or asking for
                        // a second confirmation.
                        let notif_handle = handle.clone();
                        let work_sound = config.work_sound.clone();
                        let _ = handle.run_on_main_thread(move || {
                            match notif_handle
                                .notification()
                                .builder()
                                .title("Back to work ▶")
                                .body(format!("Break's over — \"{name}\" is running again."))
                                .sound(work_sound)
                                .show()
                            {
                                Ok(()) => {}
                                Err(e) => {
                                    log_line(format!("notification show() failed (ToWork): {e}"))
                                }
                            }
                        });
                        transitioned = true;
                    }
                }
                tick_notifications::send_tick_notifications(
                    &handle,
                    state.inner(),
                    &run,
                    &config,
                    now,
                );
                if transitioned {
                    push(&handle);
                } else {
                    refresh(&handle);
                }
            });
        }
    });
}
