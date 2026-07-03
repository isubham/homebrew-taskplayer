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
        },
        log_segment(run, now),
    )
}

/// End a break early and resume work on the same task.
pub fn skip_break(run: &RunState, now: i64) -> RunState {
    RunState {
        active_task_id: run.active_task_id.clone(),
        running_start: Some(now),
        phase: Some("work".into()),
        break_start: None,
        last_task_id: run.active_task_id.clone().or_else(|| run.last_task_id.clone()),
    }
}

#[derive(Debug, PartialEq)]
pub enum Tick {
    None,
    /// Work block finished — log it and enter break.
    ToBreak(SessionLog),
    /// Break finished — resume work.
    ToWork,
}

/// Advance pomodoro phases based on elapsed time. No-op for other modes.
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
                    return (
                        RunState {
                            active_task_id: run.active_task_id.clone(),
                            running_start: None,
                            phase: Some("break".into()),
                            break_start: Some(now),
                            last_task_id: run.active_task_id.clone().or_else(|| run.last_task_id.clone()),
                        },
                        Tick::ToBreak(log),
                    );
                }
            }
        }
        Some("break") => {
            if let Some(bs) = run.break_start {
                if now - bs >= config.break_min * 60_000 {
                    return (skip_break(run, now), Tick::ToWork);
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

/// Break time remaining in ms (0 if not on break).
pub fn break_remaining(run: &RunState, config: &SessionConfig, now: i64) -> i64 {
    if run.phase.as_deref() == Some("break") {
        if let Some(bs) = run.break_start {
            return (config.break_min * 60_000 - (now - bs)).max(0);
        }
    }
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg_pomodoro() -> SessionConfig {
        SessionConfig { mode: "pomodoro".into(), target_min: 45, work_min: 25, break_min: 5 }
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
    fn pomodoro_transitions_and_excludes_break() {
        let cfg = cfg_pomodoro();
        let (run, _) = play(&RunState::default(), "a", 0);
        let w = cfg.work_min * 60_000;
        let b = cfg.break_min * 60_000;

        // still working just before 25m
        assert_eq!(tick(&run, &cfg, w - 1000).1, Tick::None);

        // work -> break at 25m, logs a 25m block
        let (run2, t) = tick(&run, &cfg, w);
        match t {
            Tick::ToBreak(log) => assert_eq!(log.end - log.start, w),
            _ => panic!("expected ToBreak"),
        }
        assert_eq!(run2.phase.as_deref(), Some("break"));

        // still on break
        assert_eq!(tick(&run2, &cfg, w + b - 1000).1, Tick::None);

        // break -> work after 5m, no time logged for the break
        let (run3, t2) = tick(&run2, &cfg, w + b);
        assert_eq!(t2, Tick::ToWork);
        assert_eq!(run3.phase.as_deref(), Some("work"));
        assert_eq!(run3.running_start, Some(w + b));
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
}
