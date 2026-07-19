use chrono::{Datelike, Days, Duration, LocalResult, NaiveDate, TimeZone};
use chrono_tz::Tz;

use super::constants::{
    AUTOMATIC_PLANNER_DST_SEARCH_MINUTES, AUTOMATIC_PLANNER_HORIZON_DAYS,
    AUTOMATIC_PLANNER_MINUTES_PER_DAY,
};
use super::Interval;
use crate::WeeklyTimeWindow;

fn resolve_local(tz: Tz, date: NaiveDate, minute: i64, prefer_latest: bool) -> Option<i64> {
    let naive = date.and_hms_opt((minute / 60) as u32, (minute % 60) as u32, 0)?;
    for shift in 0..=AUTOMATIC_PLANNER_DST_SEARCH_MINUTES {
        let candidate = naive.checked_add_signed(Duration::minutes(shift))?;
        match tz.from_local_datetime(&candidate) {
            LocalResult::Single(value) => return Some(value.timestamp_millis()),
            LocalResult::Ambiguous(first, second) => {
                let selected = if prefer_latest {
                    first.max(second)
                } else {
                    first.min(second)
                };
                return Some(selected.timestamp_millis());
            }
            LocalResult::None => continue,
        }
    }
    None
}

pub(super) fn horizon_end(tz: Tz, now: i64) -> Option<i64> {
    let today = chrono::DateTime::from_timestamp_millis(now)?
        .with_timezone(&tz)
        .date_naive();
    let end_date = today.checked_add_days(Days::new(AUTOMATIC_PLANNER_HORIZON_DAYS as u64))?;
    resolve_local(tz, end_date, 0, true)
}

pub(super) fn expand_weekly_windows(
    windows: &[WeeklyTimeWindow],
    tz: Tz,
    range_start: i64,
    range_end: i64,
) -> Vec<Interval> {
    let Some(today) = chrono::DateTime::from_timestamp_millis(range_start)
        .map(|value| value.with_timezone(&tz).date_naive())
    else {
        return Vec::new();
    };
    let mut intervals = Vec::new();
    for day_offset in -1..AUTOMATIC_PLANNER_HORIZON_DAYS {
        let date = if day_offset < 0 {
            today.checked_sub_days(Days::new((-day_offset) as u64))
        } else {
            today.checked_add_days(Days::new(day_offset as u64))
        };
        let Some(date) = date else { continue };
        for window in windows {
            if window.weekday != date.weekday().number_from_monday() as i64
                || !(0..AUTOMATIC_PLANNER_MINUTES_PER_DAY).contains(&window.start_minute)
                || !(0..AUTOMATIC_PLANNER_MINUTES_PER_DAY).contains(&window.end_minute)
                || window.start_minute == window.end_minute
            {
                continue;
            }
            let end_date = if window.end_minute < window.start_minute {
                date.checked_add_days(Days::new(1))
            } else {
                Some(date)
            };
            let (Some(start), Some(end_date)) = (
                resolve_local(tz, date, window.start_minute, false),
                end_date,
            ) else {
                continue;
            };
            let Some(end) = resolve_local(tz, end_date, window.end_minute, true) else {
                continue;
            };
            let clipped = Interval {
                start: start.max(range_start),
                end: end.min(range_end),
            };
            if clipped.end > clipped.start {
                intervals.push(clipped);
            }
        }
    }
    super::merge_intervals(intervals)
}
