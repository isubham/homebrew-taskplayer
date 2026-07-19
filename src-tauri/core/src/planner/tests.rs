use chrono::{LocalResult, NaiveDate, TimeZone, Timelike};
use chrono_tz::Tz;

use super::*;
use crate::WeeklyTimeWindow;

fn timestamp(tz: Tz, year: i32, month: u32, day: u32, hour: u32, minute: u32) -> i64 {
    let local = NaiveDate::from_ymd_opt(year, month, day)
        .unwrap()
        .and_hms_opt(hour, minute, 0)
        .unwrap();
    match tz.from_local_datetime(&local) {
        LocalResult::Single(value) => value.timestamp_millis(),
        LocalResult::Ambiguous(first, second) => first.min(second).timestamp_millis(),
        LocalResult::None => panic!("test timestamp must exist"),
    }
}

fn window(weekday: i64, start_minute: i64, end_minute: i64) -> WeeklyTimeWindow {
    WeeklyTimeWindow {
        weekday,
        start_minute,
        end_minute,
    }
}

fn list(id: &str, area: &str, windows: Vec<WeeklyTimeWindow>) -> TaskList {
    TaskList {
        id: id.into(),
        name: id.into(),
        emoji: String::new(),
        color: String::new(),
        order: 0,
        updated_at: 0,
        life_area: Some(area.into()),
        life_direction: Some("increase".into()),
        availability_windows: windows,
        deleted_at: None,
    }
}

fn task(id: &str, list_id: &str, estimate: i64, minimum: i64, maximum: i64) -> Task {
    Task {
        id: id.into(),
        list_id: list_id.into(),
        name: id.into(),
        depth: None,
        order: 0,
        estimate_min: Some(estimate),
        album: None,
        completed_at: None,
        description: None,
        updated_at: 0,
        impact_tier: None,
        impact_sign: 1,
        deadline_at: None,
        cadence: None,
        daily_windows: Vec::new(),
        min_session_min: Some(minimum),
        max_session_min: Some(maximum),
        deleted_at: None,
    }
}

fn priority(area: &str, rank: i64) -> LifeAreaPriority {
    LifeAreaPriority {
        area_key: area.into(),
        priority_rank: rank,
        updated_at: 0,
    }
}

fn preview(
    lists: &[TaskList],
    tasks: &[Task],
    sessions: &[Session],
    plans: &[PlannedSession],
    priorities: &[LifeAreaPriority],
    now: i64,
    time_zone: Tz,
) -> AutomaticPlanPreview {
    suggest_automatic_plan(AutomaticPlannerInput {
        lists,
        tasks,
        sessions,
        planned_sessions: plans,
        life_area_priorities: priorities,
        now,
        time_zone,
    })
}

#[test]
fn expands_overnight_availability_across_the_week_boundary() {
    let tz = chrono_tz::UTC;
    let now = timestamp(tz, 2026, 7, 19, 21, 0);
    let lists = [list("work", "career", vec![window(7, 22 * 60, 2 * 60)])];
    let tasks = [task("write", "work", 120, 60, 120)];

    let result = preview(&lists, &tasks, &[], &[], &[priority("career", 1)], now, tz);

    assert_eq!(result.suggestions.len(), 1);
    assert_eq!(
        result.suggestions[0].start,
        timestamp(tz, 2026, 7, 19, 22, 0)
    );
    assert_eq!(result.suggestions[0].end, timestamp(tz, 2026, 7, 20, 0, 0));
}

#[test]
fn preserves_local_wall_time_across_spring_dst() {
    let tz: Tz = "America/New_York".parse().unwrap();
    let now = timestamp(tz, 2026, 3, 8, 0, 30);
    let lists = [list("work", "career", vec![window(7, 90, 210)])];
    let tasks = [task("write", "work", 60, 30, 60)];

    let result = preview(&lists, &tasks, &[], &[], &[priority("career", 1)], now, tz);
    let suggestion = &result.suggestions[0];
    let start = chrono::DateTime::from_timestamp_millis(suggestion.start)
        .unwrap()
        .with_timezone(&tz);
    let end = chrono::DateTime::from_timestamp_millis(suggestion.end)
        .unwrap()
        .with_timezone(&tz);

    assert_eq!((start.hour(), start.minute()), (1, 30));
    assert_eq!((end.hour(), end.minute()), (3, 30));
    assert_eq!((suggestion.end - suggestion.start) / 60_000, 60);
}

#[test]
fn deadline_is_a_hard_allocation_cutoff() {
    let tz = chrono_tz::UTC;
    let now = timestamp(tz, 2026, 7, 20, 8, 0);
    let lists = [list("work", "career", vec![window(1, 9 * 60, 12 * 60)])];
    let mut item = task("write", "work", 120, 60, 60);
    item.deadline_at = Some(timestamp(tz, 2026, 7, 20, 10, 0));

    let result = preview(&lists, &[item], &[], &[], &[priority("career", 1)], now, tz);

    assert_eq!(result.suggestions.len(), 1);
    assert_eq!(result.suggestions[0].end, timestamp(tz, 2026, 7, 20, 10, 0));
    assert_eq!(result.remainders[0].remaining_minutes, 60);
}

#[test]
fn subtracts_repeating_and_existing_plan_collisions() {
    let tz = chrono_tz::UTC;
    let now = timestamp(tz, 2026, 7, 20, 8, 0);
    let lists = [list("work", "career", vec![window(1, 9 * 60, 13 * 60)])];
    let mut routine = task("standup", "work", 0, 30, 60);
    routine.cadence = Some("daily".into());
    routine.daily_windows = vec![window(1, 10 * 60, 11 * 60)];
    let work = task("write", "work", 120, 60, 60);
    let existing = PlannedSession {
        id: "existing".into(),
        task_id: "other".into(),
        start: timestamp(tz, 2026, 7, 20, 12, 0),
        end: timestamp(tz, 2026, 7, 20, 13, 0),
        updated_at: 0,
        deleted_at: None,
    };

    let result = preview(
        &lists,
        &[routine, work],
        &[],
        &[existing],
        &[priority("career", 1)],
        now,
        tz,
    );

    assert_eq!(result.suggestions.len(), 2);
    assert_eq!(
        result.suggestions[0].start,
        timestamp(tz, 2026, 7, 20, 9, 0)
    );
    assert_eq!(
        result.suggestions[1].start,
        timestamp(tz, 2026, 7, 20, 11, 0)
    );
}

#[test]
fn capacity_counts_only_existing_plans_inside_usable_availability() {
    let tz = chrono_tz::UTC;
    let now = timestamp(tz, 2026, 7, 20, 8, 0);
    let lists = [list("work", "career", vec![window(1, 9 * 60, 11 * 60)])];
    let tasks = [task("write", "work", 120, 120, 120)];
    let outside = PlannedSession {
        id: "outside".into(),
        task_id: "other".into(),
        start: timestamp(tz, 2026, 7, 20, 15, 0),
        end: timestamp(tz, 2026, 7, 20, 16, 0),
        updated_at: 0,
        deleted_at: None,
    };

    let result = preview(
        &lists,
        &tasks,
        &[],
        &[outside],
        &[priority("career", 1)],
        now,
        tz,
    );

    assert_eq!(result.capacity_minutes, 120);
    assert_eq!(result.existing_planned_minutes, 0);
    assert_eq!(result.suggested_minutes, 120);
}

#[test]
fn chunks_sessions_and_ranks_tasks_deterministically() {
    let tz = chrono_tz::UTC;
    let now = timestamp(tz, 2026, 7, 20, 8, 0);
    let lists = [
        list("career", "career", vec![window(1, 9 * 60, 13 * 60)]),
        list("health", "health", vec![window(1, 9 * 60, 13 * 60)]),
    ];
    let mut due = task("due", "health", 30, 30, 60);
    due.deadline_at = Some(timestamp(tz, 2026, 7, 21, 0, 0));
    let mut first = task("first", "career", 100, 30, 60);
    first.order = 1;
    let mut second = task("second", "career", 30, 30, 60);
    second.order = 2;

    let result = preview(
        &lists,
        &[second, first, due],
        &[],
        &[],
        &[priority("career", 1), priority("health", 2)],
        now,
        tz,
    );

    let task_ids: Vec<_> = result
        .suggestions
        .iter()
        .map(|item| item.task_id.as_str())
        .collect();
    let durations: Vec<_> = result
        .suggestions
        .iter()
        .filter(|item| item.task_id == "first")
        .map(|item| (item.end - item.start) / 60_000)
        .collect();
    assert_eq!(task_ids, vec!["due", "first", "first", "second"]);
    assert_eq!(durations, vec![60, 40]);
}

#[test]
fn fills_a_lone_opening_instead_of_reserving_an_unplaceable_minimum() {
    let tz = chrono_tz::UTC;
    let now = timestamp(tz, 2026, 7, 20, 8, 0);
    let lists = [list("work", "career", vec![window(1, 9 * 60, 10 * 60)])];
    let tasks = [task("write", "work", 70, 30, 60)];

    let result = preview(&lists, &tasks, &[], &[], &[priority("career", 1)], now, tz);

    assert_eq!(result.suggested_minutes, 60);
    assert_eq!(result.remainders[0].remaining_minutes, 10);
}

#[test]
fn completed_and_deleted_tasks_never_receive_suggestions() {
    let tz = chrono_tz::UTC;
    let now = timestamp(tz, 2026, 7, 20, 8, 0);
    let lists = [list("work", "career", vec![window(1, 9 * 60, 12 * 60)])];
    let mut completed = task("completed", "work", 30, 30, 60);
    completed.completed_at = Some(now);
    let mut deleted = task("deleted", "work", 30, 30, 60);
    deleted.deleted_at = Some(now);

    let result = preview(
        &lists,
        &[completed, deleted],
        &[],
        &[],
        &[priority("career", 1)],
        now,
        tz,
    );

    assert!(result.suggestions.is_empty());
    assert!(result.remainders.is_empty());
}
