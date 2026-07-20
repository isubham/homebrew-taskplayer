//! TaskPlayer core — platform-agnostic domain logic.
//! Contains the data model, the SQLite persistence layer, and the pure timing
//! engine. This crate has no Tauri/UI dependencies so it compiles and tests on
//! any platform, and is reused by the macOS app shell in `../src`.

pub mod db;
mod migrations;
pub mod models;
pub mod planner;
pub mod schedule;
pub mod timer;

pub use db::Db;
pub use models::*;

/// Compute total logged ms for a task, including the live work segment.
pub fn task_total_ms(sessions: &[Session], run: &RunState, task_id: &str, now: i64) -> i64 {
    let mut ms: i64 = sessions
        .iter()
        .filter(|s| s.task_id == task_id)
        .map(|s| s.end.unwrap_or(now) - s.start)
        .sum();
    if run.active_task_id.as_deref() == Some(task_id) && run.phase.as_deref() == Some("work") {
        if let Some(start) = run.running_start {
            ms += now - start;
        }
    }
    ms
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::timer;

    #[test]
    fn task_total_includes_live_segment() {
        let sessions = vec![Session {
            id: "s".into(),
            task_id: "a".into(),
            start: 0,
            end: Some(1000),
            logical_session_id: None,
            session_finished_at: None,
            updated_at: 0,
            deleted_at: None,
        }];
        let run = timer::begin(&RunState::default(), "a", "logical-a", 2000);
        // 1000 logged + live (5000-2000)=3000
        assert_eq!(task_total_ms(&sessions, &run, "a", 5000), 4000);
    }
}
