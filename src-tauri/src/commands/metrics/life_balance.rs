use super::*;
use std::collections::HashMap;

#[derive(serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LifeBalanceScore {
    pub key: String,
    pub label: String,
    pub color: String,
    #[specta(type = f64)]
    pub ms: i64,
    #[specta(type = f64)]
    pub pct: i64,
    #[specta(type = f64)]
    pub neg_ms: i64,
    #[specta(type = f64)]
    pub neg_pct: i64,
}

#[specta::specta]
#[tauri::command]
pub(crate) fn get_life_balance_scores(
    state: State<AppState>,
) -> Result<Vec<LifeBalanceScore>, String> {
    let db = state.db.lock().unwrap();
    let lists = db.lists().unwrap_or_default();
    let tasks = db.tasks().unwrap_or_default();
    let sessions = db.sessions().unwrap_or_default();
    let now = now_ms();
    let window_start = now - 7 * 24 * 60 * 60 * 1000;
    let mut positive = HashMap::new();
    let mut negative = HashMap::new();
    for (key, _, _) in life_areas() {
        positive.insert(key.to_string(), 0);
        negative.insert(key.to_string(), 0);
    }
    let tasks_by_list = tasks.into_iter().fold(
        HashMap::new(),
        |mut grouped: HashMap<String, Vec<Task>>, task| {
            grouped.entry(task.list_id.clone()).or_default().push(task);
            grouped
        },
    );
    let sessions_by_task = sessions.into_iter().fold(
        HashMap::new(),
        |mut grouped: HashMap<String, Vec<Session>>, session| {
            grouped
                .entry(session.task_id.clone())
                .or_default()
                .push(session);
            grouped
        },
    );

    for list in lists {
        let area = match list.life_area {
            Some(ref value) if positive.contains_key(value) => value.clone(),
            _ => continue,
        };
        let mut time_ms = 0;
        for task in tasks_by_list.get(&list.id).into_iter().flatten() {
            if let Some(payout) = jewel_payout(task) {
                let units = if task.cadence.as_deref() == Some("daily") {
                    daily_payout_day_count(
                        task,
                        sessions_by_task
                            .get(&task.id)
                            .map(Vec::as_slice)
                            .unwrap_or_default(),
                        window_start,
                        now,
                    ) as i64
                } else if task
                    .completed_at
                    .is_some_and(|at| at >= window_start && at <= now)
                {
                    1
                } else {
                    0
                };
                if units > 0 {
                    let swing = payout * IMPACT_WEIGHT_TO_MS * units;
                    let target = if swing >= 0 {
                        &mut positive
                    } else {
                        &mut negative
                    };
                    *target.get_mut(&area).unwrap() += swing.abs();
                    continue;
                }
                if task.cadence.as_deref() == Some("daily") {
                    continue;
                }
            }
            for session in sessions_by_task.get(&task.id).into_iter().flatten() {
                let start = session.start.max(window_start);
                let end = session.end.unwrap_or(now).min(now);
                time_ms += 0.max(end - start);
            }
        }
        let target = if list.life_direction.as_deref() == Some("decrease") {
            &mut negative
        } else {
            &mut positive
        };
        *target.get_mut(&area).unwrap() += time_ms;
    }

    Ok(life_areas()
        .into_iter()
        .map(|(key, label, color)| {
            let neg = *negative.get(key).unwrap_or(&0);
            let net = *positive.get(key).unwrap_or(&0) - neg;
            LifeBalanceScore {
                key: key.to_string(),
                label: label.to_string(),
                color: color.to_string(),
                ms: net,
                pct: ((net as f64 / LIFE_BALANCE_CAP_MS as f64 * 100.0).round() as i64)
                    .clamp(0, 100),
                neg_ms: neg,
                neg_pct: ((neg as f64 / LIFE_BALANCE_CAP_MS as f64 * 100.0).round() as i64)
                    .clamp(0, 100),
            }
        })
        .collect())
}
