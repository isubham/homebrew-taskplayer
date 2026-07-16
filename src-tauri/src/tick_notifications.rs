use super::*;

pub(crate) fn send_tick_notifications(
    handle: &AppHandle,
    state: &AppState,
    run: &RunState,
    config: &SessionConfig,
    now: i64,
) {
    // --- Non-pomodoro notifications: target reached + hourly check-in ---
    // Unlike the pomodoro transitions above, neither of these
    // changes the run state — target mode deliberately keeps
    // counting past the target, and open mode has no boundary at
    // all. They're pure notifications, deduped per work segment
    // via `session_notify` (keyed on `running_start`, so a new
    // session re-arms them). Both fire only while actually in
    // the "work" phase, and both go through run_on_main_thread
    // for the same macOS notification-center thread-safety
    // reason as ToBreak/ToWork above.
    if run.phase.as_deref() == Some("work") {
        if let (Some(start), Some(task_id)) = (run.running_start, run.active_task_id.clone()) {
            let elapsed = now - start;
            if config.mode == "target" {
                let already = state.session_notify.lock().unwrap().target_fired_for == Some(start);
                if !already && elapsed >= config.target_min * 60_000 {
                    state.session_notify.lock().unwrap().target_fired_for = Some(start);
                    let name = {
                        let db = state.db.lock().unwrap();
                        task_name_for_notification(&db, &task_id)
                    };
                    // The bar in the UI pulses at this same moment,
                    // but only if you're looking at it — this is
                    // the away-from-screen counterpart, same
                    // rationale as the pomodoro ToBreak above.
                    // Reuses `break_sound`: it's the same "a work
                    // block just completed" moment.
                    let notif_handle = handle.clone();
                    let target_min = config.target_min;
                    let sound = config.break_sound.clone();
                    let _ = handle.run_on_main_thread(move || {
                                    match notif_handle
                                        .notification()
                                        .builder()
                                        .title("Target reached 🎯")
                                        .body(format!(
                                            "Session complete — {target_min} minutes on \"{name}\". Wrap up, or keep going: the clock's still counting."
                                        ))
                                        .sound(sound)
                                        .show()
                                    {
                                        Ok(()) => {}
                                        Err(e) => log_line(format!("notification show() failed (target reached): {e}")),
                                    }
                                });
                }
            } else if config.mode == "open" && config.hourly_nudge {
                let hours = elapsed / 3_600_000;
                let due = {
                    let sn = state.session_notify.lock().unwrap();
                    hours >= 1 && (sn.nudge_fired_for != Some(start) || sn.nudge_hours < hours)
                };
                if due {
                    {
                        let mut sn = state.session_notify.lock().unwrap();
                        sn.nudge_fired_for = Some(start);
                        sn.nudge_hours = hours;
                    }
                    let name = {
                        let db = state.db.lock().unwrap();
                        task_name_for_notification(&db, &task_id)
                    };
                    // Encouragement, not an alarm: no sound, and
                    // deliberately no "you should stop" framing —
                    // just makes the elapsed time visible (open
                    // mode otherwise never says how long it's
                    // been) with a low-key care nudge.
                    let notif_handle = handle.clone();
                    let hrs = if hours == 1 {
                        "1 hour".to_string()
                    } else {
                        format!("{hours} hours")
                    };
                    let _ = handle.run_on_main_thread(move || {
                                    match notif_handle
                                        .notification()
                                        .builder()
                                        .title("Still going 💪")
                                        .body(format!(
                                            "{hrs} on \"{name}\" — you're doing great. Good moment to stand up, stretch, or grab some water."
                                        ))
                                        .show()
                                    {
                                        Ok(()) => {}
                                        Err(e) => log_line(format!("notification show() failed (hourly check-in): {e}")),
                                    }
                                });
                }
            }
        }
    }
    // --- Fixed daily/list window reminders ---
    // The pure schedule engine handles local weekday boundaries
    // (including overnight windows); this shell adds mutable
    // completion/session filters and displays the resulting cues.
    for notice in collect_schedule_notices(state, now) {
        let notif_handle = handle.clone();
        let _ = handle.run_on_main_thread(move || {
            match notif_handle
                .notification()
                .builder()
                .title(notice.title)
                .body(notice.body)
                .show()
            {
                Ok(()) => {}
                Err(e) => log_line(format!(
                    "notification show() failed (schedule reminder): {e}"
                )),
            }
        });
    }
}
