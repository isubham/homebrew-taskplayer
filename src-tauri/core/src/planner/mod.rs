mod constants;
mod time;

use std::collections::HashMap;

use chrono_tz::Tz;
use serde::{Deserialize, Serialize};

pub use constants::AUTOMATIC_PLANNER_MAX_SUGGESTIONS;
use constants::{
    AUTOMATIC_PLANNER_EXCLUDED_LIFE_DIRECTION, AUTOMATIC_PLANNER_MILLISECONDS_PER_MINUTE,
    AUTOMATIC_PLANNER_REPEATING_CADENCE, AUTOMATIC_PLANNER_START_STEP_MINUTES,
    AUTOMATIC_PLANNER_UNRANKED_PRIORITY,
};
use time::{expand_weekly_windows, horizon_end};

use crate::{LifeAreaPriority, PlannedSession, Session, Task, TaskList};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Interval {
    start: i64,
    end: i64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AutomaticPlanSuggestion {
    pub task_id: String,
    #[specta(type = f64)]
    pub start: i64,
    #[specta(type = f64)]
    pub end: i64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AutomaticPlanRemainder {
    pub task_id: String,
    #[specta(type = i32)]
    pub remaining_minutes: i64,
    #[specta(type = Option<f64>)]
    pub deadline_at: Option<i64>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AutomaticPlanPreview {
    pub suggestions: Vec<AutomaticPlanSuggestion>,
    pub remainders: Vec<AutomaticPlanRemainder>,
    #[specta(type = i32)]
    pub capacity_minutes: i64,
    #[specta(type = i32)]
    pub existing_planned_minutes: i64,
    #[specta(type = i32)]
    pub suggested_minutes: i64,
    #[specta(type = f64)]
    pub horizon_end: i64,
}

pub struct AutomaticPlannerInput<'a> {
    pub lists: &'a [TaskList],
    pub tasks: &'a [Task],
    pub sessions: &'a [Session],
    pub planned_sessions: &'a [PlannedSession],
    pub life_area_priorities: &'a [LifeAreaPriority],
    pub now: i64,
    pub time_zone: Tz,
}

pub fn parse_time_zone(value: &str) -> Option<Tz> {
    value.parse().ok()
}

fn round_up(value: i64, step: i64) -> i64 {
    value.div_euclid(step) * step + i64::from(value.rem_euclid(step) != 0) * step
}

fn merge_intervals(mut intervals: Vec<Interval>) -> Vec<Interval> {
    intervals.sort_by_key(|interval| (interval.start, interval.end));
    let mut merged: Vec<Interval> = Vec::new();
    for interval in intervals {
        if let Some(last) = merged.last_mut() {
            if interval.start <= last.end {
                last.end = last.end.max(interval.end);
                continue;
            }
        }
        merged.push(interval);
    }
    merged
}

fn subtract_intervals(openings: &[Interval], occupied: &[Interval]) -> Vec<Interval> {
    let occupied = merge_intervals(occupied.to_vec());
    let mut result = Vec::new();
    for opening in openings {
        let mut cursor = opening.start;
        for busy in &occupied {
            if busy.end <= cursor {
                continue;
            }
            if busy.start >= opening.end {
                break;
            }
            if busy.start > cursor {
                result.push(Interval {
                    start: cursor,
                    end: busy.start.min(opening.end),
                });
            }
            cursor = cursor.max(busy.end);
            if cursor >= opening.end {
                break;
            }
        }
        if cursor < opening.end {
            result.push(Interval {
                start: cursor,
                end: opening.end,
            });
        }
    }
    result
}

fn interval_minutes(interval: Interval) -> i64 {
    (interval.end - interval.start).max(0) / AUTOMATIC_PLANNER_MILLISECONDS_PER_MINUTE
}

fn total_minutes(intervals: &[Interval]) -> i64 {
    merge_intervals(intervals.to_vec())
        .into_iter()
        .map(interval_minutes)
        .sum()
}

fn actual_minutes(task_id: &str, sessions: &[Session], now: i64) -> i64 {
    let tracked_ms: i64 = sessions
        .iter()
        .filter(|session| session.task_id == task_id)
        .map(|session| (session.end.unwrap_or(now) - session.start).max(0))
        .sum();
    tracked_ms / AUTOMATIC_PLANNER_MILLISECONDS_PER_MINUTE
}

fn planned_minutes(task_id: &str, plans: &[PlannedSession], now: i64) -> i64 {
    plans
        .iter()
        .filter(|plan| plan.task_id == task_id && plan.end > now)
        .map(|plan| (plan.end - plan.start).max(0) / AUTOMATIC_PLANNER_MILLISECONDS_PER_MINUTE)
        .sum()
}

fn balanced_chunk(remaining: i64, capacity: i64, minimum: i64, maximum: i64) -> i64 {
    let mut chunk = remaining.min(capacity).min(maximum);
    let remainder = remaining - chunk;
    if remainder > 0 && remainder < minimum {
        let adjustment = minimum - remainder;
        if chunk - adjustment >= minimum {
            chunk -= adjustment;
        }
    }
    chunk
}

pub fn suggest_automatic_plan(input: AutomaticPlannerInput<'_>) -> AutomaticPlanPreview {
    let start_step =
        AUTOMATIC_PLANNER_START_STEP_MINUTES * AUTOMATIC_PLANNER_MILLISECONDS_PER_MINUTE;
    let planning_start = round_up(input.now, start_step);
    let end = horizon_end(input.time_zone, input.now).unwrap_or(planning_start);
    let list_by_id: HashMap<_, _> = input
        .lists
        .iter()
        .map(|list| (list.id.as_str(), list))
        .collect();
    let priority_by_area: HashMap<_, _> = input
        .life_area_priorities
        .iter()
        .map(|item| (item.area_key.as_str(), item.priority_rank))
        .collect();
    let availability_by_list: HashMap<_, _> = input
        .lists
        .iter()
        .map(|list| {
            (
                list.id.as_str(),
                expand_weekly_windows(
                    &list.availability_windows,
                    input.time_zone,
                    planning_start,
                    end,
                ),
            )
        })
        .collect();
    let all_availability =
        merge_intervals(availability_by_list.values().flatten().copied().collect());
    let repeating: Vec<_> = input
        .tasks
        .iter()
        .filter(|task| task.cadence.as_deref() == Some(AUTOMATIC_PLANNER_REPEATING_CADENCE))
        .flat_map(|task| {
            expand_weekly_windows(&task.daily_windows, input.time_zone, planning_start, end)
        })
        .collect();
    let existing_plans: Vec<_> = input
        .planned_sessions
        .iter()
        .filter(|plan| plan.end > planning_start && plan.start < end)
        .map(|plan| Interval {
            start: plan.start.max(planning_start),
            end: plan.end.min(end),
        })
        .collect();
    let capacity = subtract_intervals(&all_availability, &repeating);
    let mut occupied = merge_intervals(
        repeating
            .into_iter()
            .chain(existing_plans.iter().copied())
            .collect(),
    );

    let mut tasks: Vec<_> = input
        .tasks
        .iter()
        .filter_map(|task| {
            let list = list_by_id.get(task.list_id.as_str())?;
            let (Some(estimate), Some(minimum), Some(maximum)) = (
                task.estimate_min,
                task.min_session_min,
                task.max_session_min,
            ) else {
                return None;
            };
            if task.completed_at.is_some()
                || task.deleted_at.is_some()
                || task.cadence.is_some()
                || task.impact_sign < 0
                || list.life_direction.as_deref() == Some(AUTOMATIC_PLANNER_EXCLUDED_LIFE_DIRECTION)
                || estimate <= 0
                || minimum <= 0
                || maximum < minimum
            {
                return None;
            }
            let remaining = (estimate
                - actual_minutes(&task.id, input.sessions, input.now)
                - planned_minutes(&task.id, input.planned_sessions, input.now))
            .max(0);
            let priority = list
                .life_area
                .as_deref()
                .and_then(|area| priority_by_area.get(area).copied())
                .unwrap_or(AUTOMATIC_PLANNER_UNRANKED_PRIORITY);
            Some((task, remaining, minimum, maximum, priority))
        })
        .collect();
    tasks.sort_by(|left, right| {
        left.0
            .deadline_at
            .unwrap_or(i64::MAX)
            .cmp(&right.0.deadline_at.unwrap_or(i64::MAX))
            .then(left.4.cmp(&right.4))
            .then(left.0.order.cmp(&right.0.order))
            .then_with(|| left.0.id.cmp(&right.0.id))
    });

    let mut suggestions = Vec::new();
    let mut remainders = Vec::new();
    for (task, mut remaining, minimum, maximum, _) in tasks {
        let cutoff = task.deadline_at.unwrap_or(end).min(end);
        while remaining >= minimum && suggestions.len() < AUTOMATIC_PLANNER_MAX_SUGGESTIONS {
            let openings = availability_by_list
                .get(task.list_id.as_str())
                .map(Vec::as_slice)
                .unwrap_or(&[]);
            let openings = subtract_intervals(openings, &occupied)
                .into_iter()
                .map(|item| Interval {
                    start: item.start,
                    end: item.end.min(cutoff),
                })
                .filter(|item| item.end > item.start)
                .collect::<Vec<_>>();
            let Some((opening_index, opening)) = openings
                .iter()
                .copied()
                .enumerate()
                .find(|(_, item)| interval_minutes(*item) >= minimum)
            else {
                break;
            };
            let largest = remaining.min(interval_minutes(opening)).min(maximum);
            let balanced = balanced_chunk(remaining, interval_minutes(opening), minimum, maximum);
            let follow_up_fits = interval_minutes(opening) - balanced >= minimum
                || openings[opening_index + 1..]
                    .iter()
                    .any(|item| interval_minutes(*item) >= minimum);
            let duration = if balanced < largest && follow_up_fits {
                balanced
            } else {
                largest
            };
            if duration < minimum {
                break;
            }
            let suggestion = AutomaticPlanSuggestion {
                task_id: task.id.clone(),
                start: opening.start,
                end: opening.start + duration * AUTOMATIC_PLANNER_MILLISECONDS_PER_MINUTE,
            };
            occupied.push(Interval {
                start: suggestion.start,
                end: suggestion.end,
            });
            occupied = merge_intervals(occupied);
            remaining -= duration;
            suggestions.push(suggestion);
        }
        if remaining > 0 {
            remainders.push(AutomaticPlanRemainder {
                task_id: task.id.clone(),
                remaining_minutes: remaining,
                deadline_at: task.deadline_at,
            });
        }
    }
    suggestions.sort_by(|left, right| {
        left.start
            .cmp(&right.start)
            .then(left.task_id.cmp(&right.task_id))
            .then(left.end.cmp(&right.end))
    });
    let suggested_minutes = suggestions
        .iter()
        .map(|item| (item.end - item.start) / AUTOMATIC_PLANNER_MILLISECONDS_PER_MINUTE)
        .sum();
    let capacity_minutes = total_minutes(&capacity);
    let existing_planned_minutes =
        capacity_minutes - total_minutes(&subtract_intervals(&capacity, &existing_plans));
    AutomaticPlanPreview {
        suggestions,
        remainders,
        capacity_minutes,
        existing_planned_minutes,
        suggested_minutes,
        horizon_end: end,
    }
}

#[cfg(test)]
mod tests;
