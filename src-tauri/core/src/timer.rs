//! Pure timing engine — no I/O. Given the current RunState it computes the next
//! state and any session that needs to be logged. Fully unit-testable.

use crate::models::{RunState, SessionConfig, SessionLog};

fn log_segment(run: &RunState, now: i64) -> Option<SessionLog> {
    if run.phase.as_deref() == Some("work") {
        if let (Some(tid), Some(start)) = (run.active_task_id.clone(), run.running_start) {
            return Some(SessionLog {
                task_id: tid,
                start,
                end: now,
            });
        }
    }
    None
}

/// Begin a new logical session. The caller owns id generation so this timing
/// engine remains deterministic and free of I/O.
pub fn begin(run: &RunState, task_id: &str, session_id: &str, now: i64) -> RunState {
    let mut next = run.clone();
    next.active_task_id = Some(task_id.to_string());
    next.running_start = Some(now);
    next.phase = Some("work".into());
    next.break_start = None;
    next.active_session_id = Some(session_id.to_string());
    next.session_work_ms = 0;
    next.pomodoro_work_ms = 0;
    next.last_task_id = Some(task_id.to_string());
    next.long_break = false;
    next
}

/// Resume focus inside an existing logical session after either a manual
/// pause or an early-ended break.
pub fn resume(run: &RunState, task_id: &str, now: i64) -> RunState {
    let mut next = run.clone();
    next.active_task_id = Some(task_id.to_string());
    next.running_start = Some(now);
    next.phase = Some("work".into());
    next.break_start = None;
    next.last_task_id = Some(task_id.to_string());
    next.long_break = false;
    next
}

/// Pause without finishing the logical session. A running focus interval is
/// returned for persistence; scheduled/manual break time remains a gap.
pub fn pause(run: &RunState, now: i64) -> (RunState, Option<SessionLog>) {
    let log = log_segment(run, now);
    let mut next = run.clone();
    if let Some(segment) = &log {
        let duration = (segment.end - segment.start).max(0);
        next.session_work_ms = next.session_work_ms.saturating_add(duration);
        next.pomodoro_work_ms = next.pomodoro_work_ms.saturating_add(duration);
    }
    next.active_task_id = None;
    next.running_start = None;
    next.phase = None;
    next.break_start = None;
    next.last_task_id = run
        .active_task_id
        .clone()
        .or_else(|| run.last_task_id.clone());
    next.long_break = false;
    (next, log)
}

/// Finish the current logical session. This closes any live focus interval
/// and clears only per-session timing; the global long-break cycle survives.
pub fn finish(run: &RunState, now: i64) -> (RunState, Option<SessionLog>) {
    let (mut next, log) = pause(run, now);
    next.active_session_id = None;
    next.session_work_ms = 0;
    next.pomodoro_work_ms = 0;
    (next, log)
}

/// End a break early and resume work on the same task. Also recovers an old
/// synced `awaiting_work` state created by app versions that paused at phase
/// boundaries; new Pomodoro cycles advance automatically in `tick`.
pub fn skip_break(run: &RunState, now: i64) -> RunState {
    let task_id = run
        .active_task_id
        .as_deref()
        .or(run.last_task_id.as_deref());
    task_id
        .map(|task_id| resume(run, task_id, now))
        .unwrap_or_else(|| run.clone())
}

/// Recovers an old synced `awaiting_break` state created by app versions that
/// required a manual "Start break" click. New Pomodoro cycles start their
/// break automatically in `tick`.
pub fn start_break(run: &RunState, now: i64) -> RunState {
    let mut next = run.clone();
    next.running_start = None;
    next.phase = Some("break".into());
    next.break_start = Some(now);
    next.last_task_id = run
        .active_task_id
        .clone()
        .or_else(|| run.last_task_id.clone());
    next
}

#[derive(Debug, PartialEq)]
pub enum Tick {
    None,
    /// Work block finished and logged; the break has started automatically.
    ToBreak(SessionLog),
    /// Break finished and work has resumed automatically.
    ToWork,
}

/// Advance pomodoro phases based on elapsed time. No-op for other modes.
/// Work and break boundaries start the next phase immediately. Notifications
/// are handled by the app shell from the returned `Tick` event.
pub fn tick(run: &RunState, config: &SessionConfig, now: i64) -> (RunState, Tick) {
    if config.mode != "pomodoro" || run.active_task_id.is_none() {
        return (run.clone(), Tick::None);
    }
    match run.phase.as_deref() {
        Some("work") => {
            if let Some(start) = run.running_start {
                if pomodoro_work_elapsed(run, now) >= config.work_min * 60_000 {
                    let log = SessionLog {
                        task_id: run.active_task_id.clone().unwrap(),
                        start,
                        end: now,
                    };
                    // A completed work block earns one cycle toward the next
                    // long break. Once that count reaches the configured
                    // threshold, this automatically-started break is the long
                    // one and the counter resets.
                    let cycles = run.cycles_completed + 1;
                    let is_long = cycles >= config.cycles_before_long_break.max(1);
                    let next_cycles = if is_long { 0 } else { cycles };
                    let mut next = run.clone();
                    next.running_start = None;
                    next.phase = Some("break".into());
                    next.break_start = Some(now);
                    next.last_task_id = run
                        .active_task_id
                        .clone()
                        .or_else(|| run.last_task_id.clone());
                    next.session_work_ms =
                        next.session_work_ms.saturating_add((now - start).max(0));
                    next.pomodoro_work_ms = 0;
                    next.cycles_completed = next_cycles;
                    next.long_break = is_long;
                    return (next, Tick::ToBreak(log));
                }
            }
        }
        Some("break") => {
            if let Some(bs) = run.break_start {
                let break_len = if run.long_break {
                    config.long_break_min
                } else {
                    config.break_min
                };
                if now - bs >= break_len * 60_000 {
                    let task_id = run
                        .active_task_id
                        .as_deref()
                        .or(run.last_task_id.as_deref());
                    if let Some(task_id) = task_id {
                        return (resume(run, task_id, now), Tick::ToWork);
                    }
                }
            }
        }
        _ => {}
    }
    (run.clone(), Tick::None)
}

/// Total focus accumulated in the current logical session, including the
/// live work interval and excluding all pause/break gaps.
pub fn work_elapsed(run: &RunState, now: i64) -> i64 {
    let live = if run.phase.as_deref() == Some("work") {
        run.running_start
            .map(|start| (now - start).max(0))
            .unwrap_or(0)
    } else {
        0
    };
    run.session_work_ms.saturating_add(live)
}

/// Focus accumulated in the current Pomodoro work block. Unlike the live
/// segment clock this survives a manual pause/resume.
pub fn pomodoro_work_elapsed(run: &RunState, now: i64) -> i64 {
    let live = if run.phase.as_deref() == Some("work") {
        run.running_start
            .map(|start| (now - start).max(0))
            .unwrap_or(0)
    } else {
        0
    };
    run.pomodoro_work_ms.saturating_add(live)
}

/// Break time remaining in ms (0 if not on break). Uses `long_break_min`
/// instead of `break_min` when `run.long_break` is set.
pub fn break_remaining(run: &RunState, config: &SessionConfig, now: i64) -> i64 {
    if run.phase.as_deref() == Some("break") {
        if let Some(bs) = run.break_start {
            let break_len = if run.long_break {
                config.long_break_min
            } else {
                config.break_min
            };
            return (break_len * 60_000 - (now - bs)).max(0);
        }
    }
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg_pomodoro() -> SessionConfig {
        SessionConfig {
            mode: "pomodoro".into(),
            target_min: 45,
            work_min: 25,
            break_min: 5,
            break_sound: "Glass".into(),
            work_sound: "Ping".into(),
            cycles_before_long_break: 4,
            long_break_min: 20,
            hourly_nudge: true,
            updated_at: 0,
        }
    }

    fn started(task_id: &str, now: i64) -> RunState {
        begin(&RunState::default(), task_id, "session-a", now)
    }

    #[test]
    fn begin_starts_one_logical_session() {
        let run = started("a", 1000);
        assert_eq!(run.active_task_id.as_deref(), Some("a"));
        assert_eq!(run.active_session_id.as_deref(), Some("session-a"));
        assert_eq!(run.phase.as_deref(), Some("work"));
        assert_eq!(run.running_start, Some(1000));
    }

    #[test]
    fn pause_logs_focus_without_finishing_session() {
        let run = started("a", 1000);
        let (paused, log) = pause(&run, 6000);
        assert!(paused.active_task_id.is_none());
        assert_eq!(paused.active_session_id.as_deref(), Some("session-a"));
        assert_eq!(paused.session_work_ms, 5000);
        assert_eq!(log.unwrap().end - 1000, 5000);
    }

    #[test]
    fn pomodoro_transitions_start_each_phase_automatically() {
        let cfg = cfg_pomodoro();
        let run = started("a", 0);
        let w = cfg.work_min * 60_000;
        let b = cfg.break_min * 60_000;

        // still working just before 25m
        assert_eq!(tick(&run, &cfg, w - 1000).1, Tick::None);

        // Work ends at 25m, logs the block, and starts the break immediately.
        let (run2, t) = tick(&run, &cfg, w);
        match t {
            Tick::ToBreak(log) => assert_eq!(log.end - log.start, w),
            _ => panic!("expected ToBreak"),
        }
        assert_eq!(run2.phase.as_deref(), Some("break"));
        assert_eq!(run2.break_start, Some(w));

        // still on break
        assert_eq!(tick(&run2, &cfg, w + b - 1000).1, Tick::None);

        // Break ends after 5m and starts the next work block immediately.
        let (run3, t2) = tick(&run2, &cfg, w + b);
        assert_eq!(t2, Tick::ToWork);
        assert_eq!(run3.phase.as_deref(), Some("work"));
        assert_eq!(run3.running_start, Some(w + b));
    }

    #[test]
    fn pause_resume_retains_focus_and_session_identity() {
        let run = started("a", 1000);
        let (paused, _) = pause(&run, 5000);
        assert_eq!(paused.last_task_id.as_deref(), Some("a"));
        let resumed = resume(&paused, "a", 9000);
        assert_eq!(resumed.active_task_id.as_deref(), Some("a"));
        assert_eq!(resumed.active_session_id.as_deref(), Some("session-a"));
        assert_eq!(resumed.phase.as_deref(), Some("work"));
        assert_eq!(resumed.running_start, Some(9000));
        assert_eq!(work_elapsed(&resumed, 11_000), 6000);
    }

    #[test]
    fn elapsed_helpers() {
        let run = started("a", 1000);
        assert_eq!(work_elapsed(&run, 4000), 3000);
        assert_eq!(break_remaining(&run, &cfg_pomodoro(), 4000), 0);
    }

    /// Runs a full 4-cycle pomodoro set and checks the first three breaks are
    /// normal-length while the 4th is flagged long and uses `long_break_min`
    /// instead of `break_min` — the Nth-cycle case the acceptance criteria
    /// calls out, on top of the automatic boundary test above.
    #[test]
    fn long_break_every_nth_cycle() {
        let cfg = cfg_pomodoro(); // cycles_before_long_break: 4, long_break_min: 20
        let w = cfg.work_min * 60_000;
        let b = cfg.break_min * 60_000;
        let lb = cfg.long_break_min * 60_000;

        let mut run = started("a", 0);
        let mut now = 0i64;

        // First three work blocks earn a normal-length break; cycles_completed climbs 1, 2, 3.
        for expected_cycle in 1..=3 {
            now += w;
            let (r, t) = tick(&run, &cfg, now);
            assert!(
                matches!(t, Tick::ToBreak(_)),
                "expected ToBreak for cycle {expected_cycle}"
            );
            assert!(!r.long_break, "cycle {expected_cycle} should not be long");
            assert_eq!(r.cycles_completed, expected_cycle);

            run = r;
            assert!(!run.long_break);
            now += b;
            let (r2, t2) = tick(&run, &cfg, now);
            assert_eq!(t2, Tick::ToWork);
            run = r2;
        }

        // Fourth work block completes -> long break earned, counter resets to 0.
        now += w;
        let (r, t) = tick(&run, &cfg, now);
        assert!(
            matches!(t, Tick::ToBreak(_)),
            "expected ToBreak for the 4th cycle"
        );
        assert!(r.long_break, "4th break should be flagged long");
        assert_eq!(
            r.cycles_completed, 0,
            "counter resets once the long break is earned"
        );

        run = r;
        assert!(run.long_break);

        // A break_min-length (5m) tick does NOT end the long break.
        assert_eq!(tick(&run, &cfg, now + b).1, Tick::None);

        // The long break ends after long_break_min (20m), not break_min.
        let (r2, t2) = tick(&run, &cfg, now + lb);
        assert_eq!(t2, Tick::ToWork);
        assert!(!r2.long_break);
        assert_eq!(r2.cycles_completed, 0);
    }

    #[test]
    fn break_remaining_uses_long_break_min() {
        let cfg = cfg_pomodoro();
        let run = started("a", 0);
        let mut long_run = start_break(&run, 1000);
        long_run.long_break = true;
        let expected = cfg.long_break_min * 60_000 - 4000;
        assert_eq!(break_remaining(&long_run, &cfg, 5000), expected);
    }

    /// Pausing the timer mid-cycle must not forfeit cycles already earned
    /// toward the next long break — only a work block that runs to
    /// completion (via `tick`) changes the counter.
    #[test]
    fn pausing_mid_cycle_preserves_progress() {
        let cfg = cfg_pomodoro();
        let run = started("a", 0);
        let (run, _) = tick(&run, &cfg, cfg.work_min * 60_000);
        let (run, _) = tick(&run, &cfg, cfg.work_min * 60_000 + cfg.break_min * 60_000);
        assert_eq!(run.cycles_completed, 1);

        // Pause mid-way through the second work block.
        let (paused, _) = pause(&run, cfg.work_min * 60_000 + cfg.break_min * 60_000 + 5000);
        assert_eq!(
            paused.cycles_completed, 1,
            "pausing doesn't forfeit an already-earned cycle"
        );

        let resumed = resume(
            &paused,
            "a",
            cfg.work_min * 60_000 + cfg.break_min * 60_000 + 6000,
        );
        assert_eq!(resumed.cycles_completed, 1);
        assert_eq!(resumed.pomodoro_work_ms, 5000);
    }

    #[test]
    fn pomodoro_round_continues_after_pause() {
        let cfg = cfg_pomodoro();
        let run = started("a", 0);
        let twenty_minutes = 20 * 60_000;
        let (paused, _) = pause(&run, twenty_minutes);
        let resumed = resume(&paused, "a", twenty_minutes + 60_000);
        let five_more_minutes = twenty_minutes + 6 * 60_000;
        assert!(matches!(
            tick(&resumed, &cfg, five_more_minutes).1,
            Tick::ToBreak(_)
        ));
    }

    #[test]
    fn finish_clears_only_logical_session_state() {
        let run = started("a", 1000);
        let (finished, log) = finish(&run, 5000);
        assert_eq!(log.unwrap().end - 1000, 4000);
        assert!(finished.active_session_id.is_none());
        assert!(finished.active_task_id.is_none());
        assert_eq!(finished.session_work_ms, 0);
    }
}
