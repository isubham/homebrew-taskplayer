//! Pure timing engine — no I/O. Given the current RunState it computes the next
//! state and any session that needs to be logged. Fully unit-testable.

use crate::models::{RunState, SessionConfig, SessionLog};

fn log_segment(run: &RunState, now: i64) -> Option<SessionLog> {
    if run.phase.as_deref() == Some("work") {
        if let (Some(tid), Some(start)) = (run.active_task_id.clone(), run.running_start) {
            return Some(SessionLog { task_id: tid, start, end: now });
        }
    }
    None
}

/// Start (or toggle-stop) a task. Enforces the single-active-task invariant:
/// starting a task while another runs stops+logs the previous one.
pub fn play(run: &RunState, task_id: &str, now: i64) -> (RunState, Option<SessionLog>) {
    if run.active_task_id.as_deref() == Some(task_id) && run.phase.is_some() {
        return stop(run, now);
    }
    let log = if run.active_task_id.is_some() { log_segment(run, now) } else { None };
    (
        RunState {
            active_task_id: Some(task_id.to_string()),
            running_start: Some(now),
            phase: Some("work".into()),
            break_start: None,
            last_task_id: Some(task_id.to_string()),
            // The long-break cycle count is a global pomodoro counter, not
            // tied to any one task — it survives switching/resuming tasks.
            cycles_completed: run.cycles_completed,
            long_break: false,
            // device_id/device_name/updated_at are cross-device sync
            // metadata this pure engine doesn't reason about — carried
            // through unchanged. The I/O shell (main.rs's `stamp_own`)
            // overwrites them on every local mutation; see
            // docs/session-sync-design.md.
            device_id: run.device_id.clone(),
            device_name: run.device_name.clone(),
            updated_at: run.updated_at,
        },
        log,
    )
}

/// Stop the timer, logging the current work segment (if any). The stopped task
/// is remembered in `last_task_id` so the player can keep showing it and resume.
pub fn stop(run: &RunState, now: i64) -> (RunState, Option<SessionLog>) {
    (
        RunState {
            active_task_id: None,
            running_start: None,
            phase: None,
            break_start: None,
            last_task_id: run.active_task_id.clone().or_else(|| run.last_task_id.clone()),
            // Stopping mid-cycle doesn't forfeit progress already earned
            // toward the next long break — only a completed work block
            // (see `tick`) changes this counter.
            cycles_completed: run.cycles_completed,
            long_break: false,
            device_id: run.device_id.clone(),
            device_name: run.device_name.clone(),
            updated_at: run.updated_at,
        },
        log_segment(run, now),
    )
}

/// End a break early and resume work on the same task. Also used to advance
/// out of `awaiting_work` when the user clicks "Start work" — from either
/// starting phase the resulting state is identical: work resumes now.
pub fn skip_break(run: &RunState, now: i64) -> RunState {
    RunState {
        active_task_id: run.active_task_id.clone(),
        running_start: Some(now),
        phase: Some("work".into()),
        break_start: None,
        last_task_id: run.active_task_id.clone().or_else(|| run.last_task_id.clone()),
        cycles_completed: run.cycles_completed,
        long_break: false,
        device_id: run.device_id.clone(),
        device_name: run.device_name.clone(),
        updated_at: run.updated_at,
    }
}

/// Starts the break countdown when the user clicks "Start break" from
/// `awaiting_break`. A no-op-shaped state change if called from any other
/// phase (callers are expected to only invoke this from `awaiting_break`).
pub fn start_break(run: &RunState, now: i64) -> RunState {
    RunState {
        active_task_id: run.active_task_id.clone(),
        running_start: None,
        phase: Some("break".into()),
        break_start: Some(now),
        last_task_id: run.active_task_id.clone().or_else(|| run.last_task_id.clone()),
        cycles_completed: run.cycles_completed,
        // Carries over the flag `tick` set on `awaiting_break` — whether
        // *this* break is the long one doesn't change just because the user
        // finally clicked the button.
        long_break: run.long_break,
        device_id: run.device_id.clone(),
        device_name: run.device_name.clone(),
        updated_at: run.updated_at,
    }
}

#[derive(Debug, PartialEq)]
pub enum Tick {
    None,
    /// Work block finished and logged — now waiting on the user to start the break.
    ToBreak(SessionLog),
    /// Break finished — now waiting on the user to resume work.
    ToWork,
}

/// Advance pomodoro phases based on elapsed time. No-op for other modes.
///
/// Both real countdowns (`work`, `break`) end in a *waiting* phase
/// (`awaiting_break`, `awaiting_work`) rather than immediately starting the
/// next one — the clock doesn't advance again until the user explicitly
/// clicks "Start break" / "Start work" (see `start_break`/`skip_break`).
/// `awaiting_break`/`awaiting_work` are otherwise inert here: this function
/// never advances out of them on its own, so a tick that lands while paused
/// there is always a no-op.
pub fn tick(run: &RunState, config: &SessionConfig, now: i64) -> (RunState, Tick) {
    if config.mode != "pomodoro" || run.active_task_id.is_none() {
        return (run.clone(), Tick::None);
    }
    match run.phase.as_deref() {
        Some("work") => {
            if let Some(start) = run.running_start {
                if now - start >= config.work_min * 60_000 {
                    let log = SessionLog {
                        task_id: run.active_task_id.clone().unwrap(),
                        start,
                        end: now,
                    };
                    // A completed work block earns one cycle toward the next
                    // long break. Once that count reaches the configured
                    // threshold, this break is the long one and the counter
                    // resets — the long break is "earned" the instant the
                    // Nth work block finishes, not when the user actually
                    // starts it (see `start_break`, which just carries the
                    // flag through unchanged).
                    let cycles = run.cycles_completed + 1;
                    let is_long = cycles >= config.cycles_before_long_break.max(1);
                    let next_cycles = if is_long { 0 } else { cycles };
                    return (
                        RunState {
                            active_task_id: run.active_task_id.clone(),
                            running_start: None,
                            phase: Some("awaiting_break".into()),
                            break_start: None,
                            last_task_id: run.active_task_id.clone().or_else(|| run.last_task_id.clone()),
                            cycles_completed: next_cycles,
                            long_break: is_long,
                            device_id: run.device_id.clone(),
                            device_name: run.device_name.clone(),
                            updated_at: run.updated_at,
                        },
                        Tick::ToBreak(log),
                    );
                }
            }
        }
        Some("break") => {
            if let Some(bs) = run.break_start {
                let break_len = if run.long_break { config.long_break_min } else { config.break_min };
                if now - bs >= break_len * 60_000 {
                    return (
                        RunState {
                            active_task_id: run.active_task_id.clone(),
                            running_start: None,
                            phase: Some("awaiting_work".into()),
                            break_start: None,
                            last_task_id: run.active_task_id.clone().or_else(|| run.last_task_id.clone()),
                            cycles_completed: run.cycles_completed,
                            long_break: false,
                            device_id: run.device_id.clone(),
                            device_name: run.device_name.clone(),
                            updated_at: run.updated_at,
                        },
                        Tick::ToWork,
                    );
                }
            }
        }
        _ => {}
    }
    (run.clone(), Tick::None)
}

/// Elapsed ms of the current work segment (0 during break/idle).
pub fn work_elapsed(run: &RunState, now: i64) -> i64 {
    if run.phase.as_deref() == Some("work") {
        if let Some(start) = run.running_start {
            return (now - start).max(0);
        }
    }
    0
}

/// Break time remaining in ms (0 if not on break). Uses `long_break_min`
/// instead of `break_min` when `run.long_break` is set.
pub fn break_remaining(run: &RunState, config: &SessionConfig, now: i64) -> i64 {
    if run.phase.as_deref() == Some("break") {
        if let Some(bs) = run.break_start {
            let break_len = if run.long_break { config.long_break_min } else { config.break_min };
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
            updated_at: 0,
        }
    }

    #[test]
    fn play_starts_work() {
        let (run, log) = play(&RunState::default(), "a", 1000);
        assert_eq!(run.active_task_id.as_deref(), Some("a"));
        assert_eq!(run.phase.as_deref(), Some("work"));
        assert_eq!(run.running_start, Some(1000));
        assert!(log.is_none());
    }

    #[test]
    fn single_active_task_switch_logs_previous() {
        let (run_a, _) = play(&RunState::default(), "a", 1000);
        let (run_b, log) = play(&run_a, "b", 4000);
        assert_eq!(run_b.active_task_id.as_deref(), Some("b"));
        let log = log.expect("previous task should be logged");
        assert_eq!(log.task_id, "a");
        assert_eq!(log.end - log.start, 3000);
    }

    #[test]
    fn toggle_same_task_stops_and_logs() {
        let (run_a, _) = play(&RunState::default(), "a", 1000);
        let (run_b, log) = play(&run_a, "a", 6000);
        assert!(run_b.active_task_id.is_none());
        assert_eq!(log.unwrap().end - 1000, 5000);
    }

    #[test]
    fn pomodoro_transitions_wait_for_user_input_at_each_boundary() {
        let cfg = cfg_pomodoro();
        let (run, _) = play(&RunState::default(), "a", 0);
        let w = cfg.work_min * 60_000;
        let b = cfg.break_min * 60_000;

        // still working just before 25m
        assert_eq!(tick(&run, &cfg, w - 1000).1, Tick::None);

        // work -> awaiting_break at 25m, logs a 25m block, but the break
        // clock does NOT start on its own.
        let (run2, t) = tick(&run, &cfg, w);
        match t {
            Tick::ToBreak(log) => assert_eq!(log.end - log.start, w),
            _ => panic!("expected ToBreak"),
        }
        assert_eq!(run2.phase.as_deref(), Some("awaiting_break"));
        assert_eq!(run2.break_start, None);

        // ticking indefinitely while awaiting_break never advances on its own
        assert_eq!(tick(&run2, &cfg, w + 999_999_999).1, Tick::None);
        assert_eq!(tick(&run2, &cfg, w + 999_999_999).0.phase.as_deref(), Some("awaiting_break"));

        // user clicks "Start break" — now the break countdown actually begins
        let run3 = start_break(&run2, w + 10_000);
        assert_eq!(run3.phase.as_deref(), Some("break"));
        assert_eq!(run3.break_start, Some(w + 10_000));

        // still on break
        assert_eq!(tick(&run3, &cfg, w + 10_000 + b - 1000).1, Tick::None);

        // break -> awaiting_work after 5m; work does NOT resume on its own
        let (run4, t2) = tick(&run3, &cfg, w + 10_000 + b);
        assert_eq!(t2, Tick::ToWork);
        assert_eq!(run4.phase.as_deref(), Some("awaiting_work"));
        assert_eq!(run4.running_start, None);

        // ticking indefinitely while awaiting_work never advances on its own
        assert_eq!(tick(&run4, &cfg, w + 10_000 + b + 999_999_999).1, Tick::None);

        // user clicks "Start work" (same primitive as skipping a break early)
        let run5 = skip_break(&run4, w + 10_000 + b + 20_000);
        assert_eq!(run5.phase.as_deref(), Some("work"));
        assert_eq!(run5.running_start, Some(w + 10_000 + b + 20_000));
    }

    #[test]
    fn stop_remembers_last_task() {
        let (run, _) = play(&RunState::default(), "a", 1000);
        let (stopped, _) = stop(&run, 5000);
        assert!(stopped.active_task_id.is_none());
        assert!(stopped.phase.is_none());
        assert_eq!(stopped.last_task_id.as_deref(), Some("a"));
        // resuming from the remembered task starts a fresh work segment
        let (resumed, _) = play(&stopped, "a", 9000);
        assert_eq!(resumed.active_task_id.as_deref(), Some("a"));
        assert_eq!(resumed.phase.as_deref(), Some("work"));
        assert_eq!(resumed.running_start, Some(9000));
    }

    #[test]
    fn elapsed_helpers() {
        let (run, _) = play(&RunState::default(), "a", 1000);
        assert_eq!(work_elapsed(&run, 4000), 3000);
        assert_eq!(break_remaining(&run, &cfg_pomodoro(), 4000), 0);
    }

    /// Runs a full 4-cycle pomodoro set and checks the first three breaks are
    /// normal-length while the 4th is flagged long and uses `long_break_min`
    /// instead of `break_min` — the Nth-cycle case the acceptance criteria
    /// calls out, on top of the unmodified boundary-waiting test above.
    #[test]
    fn long_break_every_nth_cycle() {
        let cfg = cfg_pomodoro(); // cycles_before_long_break: 4, long_break_min: 20
        let w = cfg.work_min * 60_000;
        let b = cfg.break_min * 60_000;
        let lb = cfg.long_break_min * 60_000;

        let (mut run, _) = play(&RunState::default(), "a", 0);
        let mut now = 0i64;

        // First three work blocks earn a normal-length break; cycles_completed climbs 1, 2, 3.
        for expected_cycle in 1..=3 {
            now += w;
            let (r, t) = tick(&run, &cfg, now);
            assert!(matches!(t, Tick::ToBreak(_)), "expected ToBreak for cycle {expected_cycle}");
            assert!(!r.long_break, "cycle {expected_cycle} should not be long");
            assert_eq!(r.cycles_completed, expected_cycle);

            run = start_break(&r, now);
            assert!(!run.long_break);
            now += b;
            let (r2, t2) = tick(&run, &cfg, now);
            assert_eq!(t2, Tick::ToWork);
            run = skip_break(&r2, now);
        }

        // Fourth work block completes -> long break earned, counter resets to 0.
        now += w;
        let (r, t) = tick(&run, &cfg, now);
        assert!(matches!(t, Tick::ToBreak(_)), "expected ToBreak for the 4th cycle");
        assert!(r.long_break, "4th break should be flagged long");
        assert_eq!(r.cycles_completed, 0, "counter resets once the long break is earned");

        run = start_break(&r, now);
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
        let (run, _) = play(&RunState::default(), "a", 0);
        let mut long_run = start_break(&run, 1000);
        long_run.long_break = true;
        let expected = cfg.long_break_min * 60_000 - 4000;
        assert_eq!(break_remaining(&long_run, &cfg, 5000), expected);
    }

    /// Stopping the timer mid-cycle must not forfeit cycles already earned
    /// toward the next long break — only a work block that runs to
    /// completion (via `tick`) changes the counter.
    #[test]
    fn stopping_mid_cycle_preserves_progress() {
        let cfg = cfg_pomodoro();
        let (run, _) = play(&RunState::default(), "a", 0);
        let (run, _) = tick(&run, &cfg, cfg.work_min * 60_000);
        let run = start_break(&run, cfg.work_min * 60_000);
        let (run, _) = tick(&run, &cfg, cfg.work_min * 60_000 + cfg.break_min * 60_000);
        let run = skip_break(&run, cfg.work_min * 60_000 + cfg.break_min * 60_000 + 1000);
        assert_eq!(run.cycles_completed, 1);

        // Stop mid-way through the second work block.
        let (stopped, _) = stop(&run, cfg.work_min * 60_000 + cfg.break_min * 60_000 + 5000);
        assert_eq!(stopped.cycles_completed, 1, "stopping doesn't forfeit an already-earned cycle");

        // Resuming keeps the progress.
        let (resumed, _) = play(&stopped, "a", cfg.work_min * 60_000 + cfg.break_min * 60_000 + 6000);
        assert_eq!(resumed.cycles_completed, 1);
    }
}
