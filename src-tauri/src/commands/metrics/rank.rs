use super::*;
use std::collections::HashMap;

#[derive(serde::Serialize, specta::Type, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RankTier {
    pub key: String,
    pub label: String,
    pub sub: String,
    #[specta(type = f64)]
    pub min: i64,
}

#[derive(serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RankInfo {
    pub current: RankTier,
    pub next: Option<RankTier>,
    #[specta(type = Option<f64>)]
    pub progress: Option<i64>,
    #[specta(type = f64)]
    pub raw_total: i64,
}

fn ranks() -> Vec<RankTier> {
    [
        ("pp", "Pianissimo", "just starting out", 0),
        ("p", "Piano", "quiet, steady progress", 15),
        ("mf", "Mezzo-forte", "building momentum", 50),
        ("f", "Forte", "strong and steady", 150),
        ("ff", "Fortissimo", "powerful, all in", 400),
        ("cresc", "Crescendo", "full swell", 1000),
    ]
    .map(|(key, label, sub, min)| RankTier {
        key: key.into(),
        label: label.into(),
        sub: sub.into(),
        min,
    })
    .to_vec()
}

#[specta::specta]
#[tauri::command]
pub(crate) fn get_rank_info(state: State<AppState>) -> Result<RankInfo, String> {
    let db = state.db.lock().unwrap();
    let lists = db.lists().unwrap_or_default();
    let tasks = db.tasks().unwrap_or_default();
    let sessions = db.sessions().unwrap_or_default();
    let now = now_ms();
    let list_map = lists
        .into_iter()
        .map(|list| (list.id.clone(), list))
        .collect::<HashMap<_, _>>();
    let has_life_tags = list_map.values().any(|list| list.life_area.is_some());
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
    let mut by_area: HashMap<String, i64> = HashMap::new();
    for task in tasks {
        let Some(payout) = jewel_payout(&task).filter(|amount| *amount > 0) else {
            continue;
        };
        let area = list_map
            .get(&task.list_id)
            .and_then(|list| list.life_area.clone())
            .unwrap_or_else(|| "other".to_string());
        let units = if task.cadence.as_deref() == Some("daily") {
            daily_payout_day_count(
                &task,
                sessions_by_task
                    .get(&task.id)
                    .map(Vec::as_slice)
                    .unwrap_or_default(),
                0,
                now,
            ) as i64
        } else if task.completed_at.is_some() {
            1
        } else {
            0
        };
        *by_area.entry(area).or_insert(0) += payout * units;
    }
    let raw_total: i64 = by_area.values().sum();
    let balanced_score = |tier_min: i64| {
        if !has_life_tags {
            return raw_total;
        }
        by_area
            .values()
            .map(|value| (*value).min(tier_min / 3))
            .sum()
    };
    let ranks = ranks();
    let current_index = ranks
        .iter()
        .enumerate()
        .skip(1)
        .take_while(|(_, rank)| balanced_score(rank.min) >= rank.min)
        .map(|(index, _)| index)
        .last()
        .unwrap_or(0);
    let current = ranks[current_index].clone();
    let next = ranks.get(current_index + 1).cloned();
    let progress = next
        .as_ref()
        .map(|rank| balanced_score(rank.min).min(rank.min));
    Ok(RankInfo {
        current,
        next,
        progress,
        raw_total,
    })
}
