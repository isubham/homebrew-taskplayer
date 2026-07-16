use super::super::*;

#[derive(Debug)]
pub(crate) struct ScheduleNotice {
    key: String,
    pub(crate) title: String,
    pub(crate) body: String,
}

pub(crate) fn local_time_ms(date: NaiveDate, minute: i64) -> Option<i64> {
    let hour = u32::try_from(minute.div_euclid(60)).ok()?;
    let minute = u32::try_from(minute.rem_euclid(60)).ok()?;
    let local = date.and_hms_opt(hour, minute, 0)?;
    Local
        .from_local_datetime(&local)
        .earliest()
        .map(|value| value.timestamp_millis())
}

pub(crate) fn daily_occurrence_is_done(
    task: &Task,
    sessions: &[Session],
    event: &ScheduleEvent,
) -> bool {
    // `completed_at` is still what the current checkbox command writes. A
    // daily session is the newer per-day completion signal. Accepting either
    // keeps reminders consistent with both existing UI paths.
    if task.completed_at.is_some() {
        return true;
    }
    let Some(day_start) = local_time_ms(event.occurrence_date, 0) else {
        return false;
    };
    let end_date = if event.end_minute < event.start_minute {
        event.occurrence_date.checked_add_days(Days::new(1))
    } else {
        Some(event.occurrence_date)
    };
    let Some(end) = end_date.and_then(|date| local_time_ms(date, event.end_minute)) else {
        return false;
    };
    sessions.iter().any(|session| {
        session.task_id == task.id && session.start >= day_start && session.start <= end
    })
}

pub(crate) fn collect_schedule_notices(state: &AppState, now: i64) -> Vec<ScheduleNotice> {
    // The one-second timer does not need to read SQLite every second for
    // minute-granularity reminders. Ten seconds still gives six chances to
    // observe each boundary (including shortly after a sync completes).
    {
        let mut notify = state.session_notify.lock().unwrap();
        let bucket = now.div_euclid(10_000);
        if notify.schedule_checked_bucket == Some(bucket) {
            return Vec::new();
        }
        notify.schedule_checked_bucket = Some(bucket);
        notify
            .schedule_fired
            .retain(|_, fired_at| now - *fired_at < 8 * 24 * 60 * 60 * 1000);
    }

    let run = state.run.lock().unwrap().clone();
    let (lists, tasks, sessions, signed_in) = {
        let db = state.db.lock().unwrap();
        (
            db.lists().unwrap_or_default(),
            db.tasks().unwrap_or_default(),
            db.sessions().unwrap_or_default(),
            db.get_account().is_some(),
        )
    };

    // For signed-in accounts, the most recent session-owning device is the
    // notification leader. This reuses the already-synced run ownership and
    // avoids the same reminder appearing on every signed-in Mac.
    if signed_in && run.device_id.as_deref() != Some(state.device_id.as_str()) {
        return Vec::new();
    }

    let Some(local_now) = Local.timestamp_millis_opt(now).single() else {
        return Vec::new();
    };
    let minute = i64::from(local_now.hour()) * 60 + i64::from(local_now.minute());
    let events = due_schedule_events(local_now.date_naive(), minute, &lists, &tasks);
    let mut notices = Vec::new();

    for event in events {
        match event.kind {
            ScheduleEventKind::DailyStarting | ScheduleEventKind::DailyEnding => {
                let Some(task) = tasks.iter().find(|task| task.id == event.entity_id) else {
                    continue;
                };
                if daily_occurrence_is_done(task, &sessions, &event) {
                    continue;
                }
                let (title, body) = match event.kind {
                    ScheduleEventKind::DailyStarting => (
                        format!("{} starts in 5 minutes", task.name),
                        "Open TaskPlayer when you're ready.".to_string(),
                    ),
                    ScheduleEventKind::DailyEnding => (
                        format!("{} time has ended", task.name),
                        "Open TaskPlayer to mark it complete.".to_string(),
                    ),
                    _ => unreachable!(),
                };
                notices.push(ScheduleNotice {
                    key: event.key,
                    title,
                    body,
                });
            }
            ScheduleEventKind::ListStarting => {
                let Some(list) = lists.iter().find(|list| list.id == event.entity_id) else {
                    continue;
                };
                let Some(task) = tasks
                    .iter()
                    .filter(|task| {
                        task.list_id == list.id
                            && task.cadence.as_deref() != Some("daily")
                            && task.completed_at.is_none()
                    })
                    .min_by_key(|task| task.order)
                else {
                    continue;
                };
                notices.push(ScheduleNotice {
                    key: event.key,
                    title: format!("{} time starts in 5 minutes", list.name),
                    body: format!("{} is ready.", task.name),
                });
            }
            ScheduleEventKind::ListEnding => {
                if run.phase.as_deref() != Some("work") {
                    continue;
                }
                let Some(task) = run
                    .active_task_id
                    .as_deref()
                    .and_then(|id| tasks.iter().find(|task| task.id == id))
                else {
                    continue;
                };
                if task.list_id != event.entity_id {
                    continue;
                }
                let list_name = lists
                    .iter()
                    .find(|list| list.id == event.entity_id)
                    .map(|list| list.name.as_str())
                    .unwrap_or("This list");
                notices.push(ScheduleNotice {
                    key: event.key,
                    title: format!("{list_name} time ends in 5 minutes"),
                    body: format!("Wrap up {}.", task.name),
                });
            }
        }
    }

    let mut notify = state.session_notify.lock().unwrap();
    notices.retain(|notice| {
        if notify.schedule_fired.contains_key(&notice.key) {
            false
        } else {
            notify.schedule_fired.insert(notice.key.clone(), now);
            true
        }
    });
    notices
}
