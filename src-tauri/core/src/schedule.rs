use chrono::{Datelike, Days, NaiveDate};

use crate::{Task, TaskList, WeeklyTimeWindow};

const DAY_MINUTES: i64 = 24 * 60;
const WEEK_MINUTES: i64 = 7 * DAY_MINUTES;
const APPROACH_MINUTES: i64 = 5;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ScheduleEventKind {
    DailyStarting,
    DailyEnding,
    ListStarting,
    ListEnding,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ScheduleEvent {
    pub kind: ScheduleEventKind,
    pub entity_id: String,
    /// The local date on which the selected weekday's occurrence starts.
    pub occurrence_date: NaiveDate,
    pub start_minute: i64,
    pub end_minute: i64,
    pub key: String,
}

fn event_for_window(
    date: NaiveDate,
    minute: i64,
    entity_id: &str,
    window: &WeeklyTimeWindow,
    kind: ScheduleEventKind,
    event_minute: i64,
) -> Option<ScheduleEvent> {
    if !(1..=7).contains(&window.weekday)
        || !(0..DAY_MINUTES).contains(&window.start_minute)
        || !(0..DAY_MINUTES).contains(&window.end_minute)
        || window.start_minute == window.end_minute
    {
        return None;
    }

    let current_week_minute =
        (date.weekday().number_from_monday() as i64 - 1) * DAY_MINUTES + minute;
    if event_minute.rem_euclid(WEEK_MINUTES) != current_week_minute {
        return None;
    }

    let start_day = window.weekday - 1;
    let event_day = event_minute.div_euclid(DAY_MINUTES);
    let day_offset = start_day - event_day;
    let occurrence_date = if day_offset >= 0 {
        date.checked_add_days(Days::new(day_offset as u64))?
    } else {
        date.checked_sub_days(Days::new((-day_offset) as u64))?
    };
    let kind_key = match kind {
        ScheduleEventKind::DailyStarting => "daily-start",
        ScheduleEventKind::DailyEnding => "daily-end",
        ScheduleEventKind::ListStarting => "list-start",
        ScheduleEventKind::ListEnding => "list-end",
    };

    Some(ScheduleEvent {
        kind,
        entity_id: entity_id.to_string(),
        occurrence_date,
        start_minute: window.start_minute,
        end_minute: window.end_minute,
        key: format!(
            "{kind_key}:{entity_id}:{occurrence_date}:{}:{}",
            window.start_minute, window.end_minute
        ),
    })
}

fn window_event_minutes(window: &WeeklyTimeWindow) -> (i64, i64) {
    let start = (window.weekday - 1) * DAY_MINUTES + window.start_minute;
    let end = (window.weekday - 1) * DAY_MINUTES
        + window.end_minute
        + if window.end_minute < window.start_minute {
            DAY_MINUTES
        } else {
            0
        };
    (start, end)
}

/// Returns schedule boundaries due in the supplied local calendar minute.
/// Filtering based on completion, active sessions, and notification-device
/// ownership stays in the app shell because those are mutable runtime facts.
pub fn due_schedule_events(
    date: NaiveDate,
    minute: i64,
    lists: &[TaskList],
    tasks: &[Task],
) -> Vec<ScheduleEvent> {
    if !(0..DAY_MINUTES).contains(&minute) {
        return Vec::new();
    }
    let mut events = Vec::new();

    for task in tasks.iter().filter(|task| task.cadence.as_deref() == Some("daily")) {
        for window in &task.daily_windows {
            let (start, end) = window_event_minutes(window);
            if let Some(event) = event_for_window(
                date,
                minute,
                &task.id,
                window,
                ScheduleEventKind::DailyStarting,
                start - APPROACH_MINUTES,
            ) {
                events.push(event);
            }
            if let Some(event) = event_for_window(
                date,
                minute,
                &task.id,
                window,
                ScheduleEventKind::DailyEnding,
                end,
            ) {
                events.push(event);
            }
        }
    }

    for list in lists {
        for window in &list.availability_windows {
            let (start, end) = window_event_minutes(window);
            if let Some(event) = event_for_window(
                date,
                minute,
                &list.id,
                window,
                ScheduleEventKind::ListStarting,
                start - APPROACH_MINUTES,
            ) {
                events.push(event);
            }
            // A five-minute warning is not meaningful for a window that is
            // itself five minutes or shorter.
            if end - start > APPROACH_MINUTES {
                if let Some(event) = event_for_window(
                    date,
                    minute,
                    &list.id,
                    window,
                    ScheduleEventKind::ListEnding,
                    end - APPROACH_MINUTES,
                ) {
                    events.push(event);
                }
            }
        }
    }

    events
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Task, TaskList};

    fn list(window: WeeklyTimeWindow) -> TaskList {
        TaskList {
            id: "work".into(),
            name: "Work".into(),
            emoji: "💼".into(),
            color: "#fff".into(),
            order: 0,
            updated_at: 0,
            life_area: None,
            life_direction: None,
            availability_windows: vec![window],
            deleted_at: None,
        }
    }

    fn daily(window: WeeklyTimeWindow) -> Task {
        Task {
            id: "sleep".into(),
            list_id: "health".into(),
            name: "Sleep".into(),
            depth: None,
            order: 0,
            estimate_min: None,
            album: None,
            completed_at: None,
            description: None,
            updated_at: 0,
            impact_tier: None,
            impact_sign: 1,
            deadline_at: None,
            cadence: Some("daily".into()),
            daily_windows: vec![window],
            min_session_min: None,
            max_session_min: None,
            deleted_at: None,
        }
    }

    #[test]
    fn overnight_daily_starts_on_selected_day_and_ends_next_day() {
        let monday = NaiveDate::from_ymd_opt(2026, 7, 13).unwrap();
        let window = WeeklyTimeWindow {
            weekday: 1,
            start_minute: 22 * 60,
            end_minute: 5 * 60,
        };
        let task = daily(window);

        let start = due_schedule_events(monday, 21 * 60 + 55, &[], std::slice::from_ref(&task));
        assert_eq!(start[0].kind, ScheduleEventKind::DailyStarting);
        assert_eq!(start[0].occurrence_date, monday);

        let tuesday = monday.succ_opt().unwrap();
        let end = due_schedule_events(tuesday, 5 * 60, &[], &[task]);
        assert_eq!(end[0].kind, ScheduleEventKind::DailyEnding);
        assert_eq!(end[0].occurrence_date, monday);
    }

    #[test]
    fn midnight_start_warning_fires_on_previous_day() {
        let sunday = NaiveDate::from_ymd_opt(2026, 7, 12).unwrap();
        let window = WeeklyTimeWindow {
            weekday: 1,
            start_minute: 3,
            end_minute: 60,
        };
        let events = due_schedule_events(sunday, 23 * 60 + 58, &[list(window)], &[]);
        assert_eq!(events[0].kind, ScheduleEventKind::ListStarting);
        assert_eq!(events[0].occurrence_date, sunday.succ_opt().unwrap());
    }

    #[test]
    fn list_end_warning_is_five_minutes_early() {
        let monday = NaiveDate::from_ymd_opt(2026, 7, 13).unwrap();
        let window = WeeklyTimeWindow {
            weekday: 1,
            start_minute: 9 * 60,
            end_minute: 17 * 60,
        };
        let events = due_schedule_events(monday, 16 * 60 + 55, &[list(window)], &[]);
        assert_eq!(events[0].kind, ScheduleEventKind::ListEnding);
    }
}
