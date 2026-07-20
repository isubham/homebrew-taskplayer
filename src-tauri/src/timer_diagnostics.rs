use super::*;
use serde::Serialize;

#[derive(Serialize)]
struct TimerPauseDiagnostic<'a> {
    event: &'static str,
    reason: &'a str,
    trigger: &'a str,
    task_id: Option<&'a str>,
    phase: Option<&'a str>,
    session_start: Option<i64>,
    pause_at: i64,
    sleep_interval_ms: Option<i64>,
    device_id: &'a str,
    session_write: &'a str,
    run_write: &'a str,
}

pub(crate) fn timer_write_status<T, E: std::fmt::Display>(result: &Result<T, E>) -> String {
    match result {
        Ok(_) => TIMER_WRITE_STATUS_OK.to_string(),
        Err(error) => format!("{TIMER_WRITE_STATUS_ERROR}({error})"),
    }
}

pub(crate) fn log_timer_pause(
    state: &AppState,
    reason: &str,
    trigger: &str,
    previous: &RunState,
    pause_at: i64,
    session_write: &str,
    run_write: &str,
) {
    write_timer_pause(
        state,
        reason,
        trigger,
        previous,
        pause_at,
        None,
        session_write,
        run_write,
    );
}

pub(crate) fn log_timer_pause_after_sleep(
    state: &AppState,
    reason: &str,
    trigger: &str,
    previous: &RunState,
    pause_at: i64,
    sleep_interval_ms: i64,
    session_write: &str,
    run_write: &str,
) {
    write_timer_pause(
        state,
        reason,
        trigger,
        previous,
        pause_at,
        Some(sleep_interval_ms),
        session_write,
        run_write,
    );
}

#[allow(clippy::too_many_arguments)]
fn write_timer_pause(
    state: &AppState,
    reason: &str,
    trigger: &str,
    previous: &RunState,
    pause_at: i64,
    sleep_interval_ms: Option<i64>,
    session_write: &str,
    run_write: &str,
) {
    let event = TimerPauseDiagnostic {
        event: TIMER_PAUSE_LOG_EVENT,
        reason,
        trigger,
        task_id: previous.active_task_id.as_deref(),
        phase: previous.phase.as_deref(),
        session_start: previous.running_start,
        pause_at,
        sleep_interval_ms,
        device_id: &state.device_id,
        session_write,
        run_write,
    };
    if let Ok(line) = serde_json::to_string(&event) {
        log_line(line);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pause_diagnostic_serializes_sleep_evidence() {
        let event = TimerPauseDiagnostic {
            event: TIMER_PAUSE_LOG_EVENT,
            reason: TIMER_PAUSE_REASON_SYSTEM_SLEEP,
            trigger: TIMER_PAUSE_TRIGGER_MACOS_WORKSPACE,
            task_id: Some(TIMER_PAUSE_TRIGGER_TASK_DELETE),
            phase: Some(RUN_PHASE_WORK),
            session_start: Some(i64::MIN),
            pause_at: i64::MIN,
            sleep_interval_ms: Some(i64::MAX),
            device_id: TIMER_PAUSE_TRIGGER_MACOS_WORKSPACE,
            session_write: TIMER_WRITE_STATUS_OK,
            run_write: TIMER_WRITE_STATUS_OK,
        };
        let value = serde_json::to_value(event).unwrap();

        assert_eq!(value["event"], TIMER_PAUSE_LOG_EVENT);
        assert_eq!(value["reason"], TIMER_PAUSE_REASON_SYSTEM_SLEEP);
        assert_eq!(value["trigger"], TIMER_PAUSE_TRIGGER_MACOS_WORKSPACE);
        assert_eq!(value["sleep_interval_ms"], i64::MAX);
        assert_eq!(value["session_write"], TIMER_WRITE_STATUS_OK);
        assert_eq!(value["run_write"], TIMER_WRITE_STATUS_OK);
    }
}
