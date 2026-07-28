use super::super::*;
use chrono::{Local, TimeZone};
use std::collections::HashSet;

mod life_balance;
mod rank;

pub(crate) use life_balance::*;
pub(crate) use rank::*;

const IMPACT_WEIGHT_TO_MS: i64 = 40 * 60 * 1000;
const LIFE_BALANCE_CAP_MS: i64 = 5 * 60 * 60 * 1000;

fn life_areas() -> Vec<(&'static str, &'static str, &'static str)> {
    vec![
        ("career", "Career / Work", "#509bf5"),
        ("health", "Health & Wellbeing", "#2f9e8f"),
        ("relationships", "Relationships", "#e8115b"),
        ("finance", "Finances", "#e8b923"),
        ("recreation", "Recreation", "#ba5d07"),
    ]
}

fn jewel_payout(task: &Task) -> Option<i64> {
    let weight = match task.impact_tier.as_deref() {
        Some("low") => 1,
        Some("medium") => 2,
        Some("high") => 4,
        _ => return None,
    };
    let sign = if task.impact_sign == -1 { -1 } else { 1 };
    Some(sign * weight)
}

fn local_day_start(ms: i64) -> i64 {
    use chrono::{Datelike, NaiveDate, NaiveDateTime, NaiveTime};
    let dt = Local.timestamp_millis_opt(ms).unwrap();
    let date = NaiveDate::from_ymd_opt(dt.year(), dt.month(), dt.day()).unwrap();
    let time = NaiveTime::from_hms_opt(0, 0, 0).unwrap();
    Local
        .from_local_datetime(&NaiveDateTime::new(date, time))
        .unwrap()
        .timestamp_millis()
}

fn repeating_task_occurs_on(task: &Task, day_start_ms: i64) -> bool {
    if task.cadence.as_deref() != Some("daily") {
        return false;
    }
    let weekdays = task
        .daily_windows
        .iter()
        .filter(|window| (1..=7).contains(&window.weekday))
        .map(|window| window.weekday)
        .collect::<HashSet<_>>();
    if weekdays.is_empty() {
        return true;
    }
    use chrono::Datelike;
    let weekday = Local
        .timestamp_millis_opt(day_start_ms)
        .unwrap()
        .weekday()
        .number_from_monday() as i64;
    weekdays.contains(&weekday)
}

fn daily_payout_day_count(
    task: &Task,
    sessions: &[Session],
    window_start: i64,
    window_end: i64,
) -> usize {
    if task.cadence.as_deref() != Some("daily") {
        return 0;
    }
    sessions
        .iter()
        .filter(|session| session.task_id == task.id)
        .filter(|session| session.start >= window_start && session.start < window_end)
        .filter(|session| session.end.unwrap_or(session.start) > session.start)
        .filter(|session| {
            session.logical_session_id.is_none() || session.session_finished_at.is_some()
        })
        .map(|session| local_day_start(session.start))
        .filter(|day| repeating_task_occurs_on(task, *day))
        .collect::<HashSet<_>>()
        .len()
}
