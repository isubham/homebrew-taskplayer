use super::super::*;
use chrono::{Local, TimeZone};
use std::collections::{HashMap, HashSet};

#[derive(serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LifeBalanceScore {
    pub key: String,
    pub label: String,
    pub color: String,
    pub ms: i64,
    pub pct: i64,
    pub neg_ms: i64,
    pub neg_pct: i64,
}

const IMPACT_WEIGHT_TO_MS: i64 = 40 * 60 * 1000;
const LIFE_BALANCE_CAP_MS: i64 = 5 * 60 * 60 * 1000;

fn get_life_areas() -> Vec<(&'static str, &'static str, &'static str)> {
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

#[derive(serde::Serialize, specta::Type, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RankTier {
    pub key: String,
    pub label: String,
    pub sub: String,
    pub min: i64,
}

#[derive(serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RankInfo {
    pub current: RankTier,
    pub next: Option<RankTier>,
    pub progress: Option<i64>,
    pub raw_total: i64,
}

fn get_ranks() -> Vec<RankTier> {
    vec![
        RankTier { key: "pp".into(), label: "Pianissimo".into(), sub: "just starting out".into(), min: 0 },
        RankTier { key: "p".into(), label: "Piano".into(), sub: "quiet, steady progress".into(), min: 15 },
        RankTier { key: "mf".into(), label: "Mezzo-forte".into(), sub: "building momentum".into(), min: 50 },
        RankTier { key: "f".into(), label: "Forte".into(), sub: "strong and steady".into(), min: 150 },
        RankTier { key: "ff".into(), label: "Fortissimo".into(), sub: "powerful, all in".into(), min: 400 },
        RankTier { key: "cresc".into(), label: "Crescendo".into(), sub: "full swell".into(), min: 1000 },
    ]
}

fn local_day_start(ms: i64) -> i64 {
    use chrono::{Datelike, NaiveDate, NaiveDateTime, NaiveTime};
    let dt = Local.timestamp_millis_opt(ms).unwrap();
    let d = NaiveDate::from_ymd_opt(dt.year(), dt.month(), dt.day()).unwrap();
    let t = NaiveTime::from_hms_opt(0, 0, 0).unwrap();
    let local_midnight = Local.from_local_datetime(&NaiveDateTime::new(d, t)).unwrap();
    local_midnight.timestamp_millis()
}

fn repeating_task_occurs_on(task: &Task, day_start_ms: i64) -> bool {
    if task.cadence.as_deref() != Some("daily") {
        return false;
    }
    let windows = &task.daily_windows;
    let mut weekdays = HashSet::new();
    for w in windows {
        if w.weekday >= 1 && w.weekday <= 7 {
            weekdays.insert(w.weekday);
        }
    }
    if weekdays.is_empty() {
        return true;
    }
    use chrono::{Datelike};
    let dt = Local.timestamp_millis_opt(day_start_ms).unwrap();
    let weekday_num = dt.weekday().number_from_monday() as i64;
    weekdays.contains(&weekday_num)
}

fn daily_payout_day_count(task: &Task, sessions: &[Session], window_start: i64, window_end: i64) -> usize {
    if task.cadence.as_deref() != Some("daily") {
        return 0;
    }
    let mut days = HashSet::new();
    for session in sessions {
        if session.task_id != task.id {
            continue;
        }
        if session.start < window_start || session.start >= window_end {
            continue;
        }
        let end = session.end.unwrap_or(session.start);
        if end <= session.start {
            continue;
        }
        if session.logical_session_id.is_some() && session.session_finished_at.is_none() {
            continue;
        }
        let d = local_day_start(session.start);
        if !repeating_task_occurs_on(task, d) {
            continue;
        }
        days.insert(d);
    }
    days.len()
}

#[specta::specta]
#[tauri::command]
pub(crate) fn get_life_balance_scores(state: State<AppState>) -> Result<Vec<LifeBalanceScore>, String> {
    let db = state.db.lock().unwrap();
    let lists = db.lists().unwrap_or_default();
    let tasks = db.tasks().unwrap_or_default();
    let sessions = db.sessions().unwrap_or_default();

    let now = now_ms();
    let window_start = now - 7 * 24 * 60 * 60 * 1000;

    let mut pos_ms: HashMap<String, i64> = HashMap::new();
    let mut neg_ms: HashMap<String, i64> = HashMap::new();
    for (key, _, _) in get_life_areas() {
        pos_ms.insert(key.to_string(), 0);
        neg_ms.insert(key.to_string(), 0);
    }

    let tasks_by_list = tasks.into_iter().fold(HashMap::new(), |mut acc: HashMap<String, Vec<Task>>, t| {
        acc.entry(t.list_id.clone()).or_default().push(t);
        acc
    });

    let sessions_by_task = sessions.into_iter().fold(HashMap::new(), |mut acc: HashMap<String, Vec<Session>>, s| {
        acc.entry(s.task_id.clone()).or_default().push(s);
        acc
    });

    for list in lists {
        let area = match list.life_area {
            Some(ref a) if pos_ms.contains_key(a) => a.clone(),
            _ => continue,
        };
        let is_decrease = list.life_direction.as_deref() == Some("decrease");
        let mut time_ms = 0;

        let list_tasks = tasks_by_list.get(&list.id);
        if let Some(list_tasks) = list_tasks {
            for task in list_tasks {
                let payout = jewel_payout(task);
                if let Some(amt) = payout {
                    if task.cadence.as_deref() == Some("daily") {
                        let empty_sessions = vec![];
                        let task_sessions = sessions_by_task.get(&task.id).unwrap_or(&empty_sessions);
                        let days = daily_payout_day_count(task, task_sessions, window_start, now) as i64;
                        if days > 0 {
                            let swing = amt * IMPACT_WEIGHT_TO_MS * days;
                            if swing >= 0 {
                                *pos_ms.get_mut(&area).unwrap() += swing;
                            } else {
                                *neg_ms.get_mut(&area).unwrap() += -swing;
                            }
                        }
                        continue;
                    }
                }
                if let Some(amt) = payout {
                    if let Some(completed_at) = task.completed_at {
                        if completed_at >= window_start && completed_at <= now {
                            let swing = amt * IMPACT_WEIGHT_TO_MS;
                            if swing >= 0 {
                                *pos_ms.get_mut(&area).unwrap() += swing;
                            } else {
                                *neg_ms.get_mut(&area).unwrap() += -swing;
                            }
                            continue;
                        }
                    }
                }

                if let Some(task_sessions) = sessions_by_task.get(&task.id) {
                    for session in task_sessions {
                        let seg_start = session.start.max(window_start);
                        let seg_end = session.end.unwrap_or(now).min(now);
                        time_ms += 0.max(seg_end - seg_start);
                    }
                }
            }
        }

        if is_decrease {
            *neg_ms.get_mut(&area).unwrap() += time_ms;
        } else {
            *pos_ms.get_mut(&area).unwrap() += time_ms;
        }
    }

    let mut result = Vec::new();
    for (key, label, color) in get_life_areas() {
        let neg = *neg_ms.get(key).unwrap_or(&0);
        let pos = *pos_ms.get(key).unwrap_or(&0);
        let net = pos - neg;
        
        let pct = (net as f64 / LIFE_BALANCE_CAP_MS as f64 * 100.0).round() as i64;
        let pct = pct.clamp(0, 100);
        
        let neg_pct = (neg as f64 / LIFE_BALANCE_CAP_MS as f64 * 100.0).round() as i64;
        let neg_pct = neg_pct.clamp(0, 100);

        result.push(LifeBalanceScore {
            key: key.to_string(),
            label: label.to_string(),
            color: color.to_string(),
            ms: net,
            pct,
            neg_ms: neg,
            neg_pct,
        });
    }

    Ok(result)
}

#[specta::specta]
#[tauri::command]
pub(crate) fn get_rank_info(state: State<AppState>) -> Result<RankInfo, String> {
    let db = state.db.lock().unwrap();
    let lists = db.lists().unwrap_or_default();
    let tasks = db.tasks().unwrap_or_default();
    let sessions = db.sessions().unwrap_or_default();
    
    let now = now_ms();
    
    let mut by_area = HashMap::new();
    let mut has_life_tags = false;
    
    let list_map: HashMap<_, _> = lists.into_iter().map(|l| (l.id.clone(), l)).collect();
    let sessions_by_task = sessions.into_iter().fold(HashMap::new(), |mut acc: HashMap<String, Vec<Session>>, s| {
        acc.entry(s.task_id.clone()).or_default().push(s);
        acc
    });
    
    for list in list_map.values() {
        if list.life_area.is_some() {
            has_life_tags = true;
            break;
        }
    }
    
    for task in tasks {
        let payout = jewel_payout(&task);
        if let Some(amt) = payout {
            if amt <= 0 { continue; }
            
            let key = match list_map.get(&task.list_id) {
                Some(l) if l.life_area.is_some() => l.life_area.clone().unwrap(),
                _ => "other".to_string(),
            };
            
            if task.cadence.as_deref() == Some("daily") {
                let empty_sessions = vec![];
                let task_sessions = sessions_by_task.get(&task.id).unwrap_or(&empty_sessions);
                let days = daily_payout_day_count(&task, task_sessions, 0, now) as i64;
                if days > 0 {
                    *by_area.entry(key).or_insert(0) += amt * days;
                }
            } else if task.completed_at.is_some() {
                *by_area.entry(key).or_insert(0) += amt;
            }
        }
    }
    
    let raw_total: i64 = by_area.values().sum();
    let ranks = get_ranks();
    
    let balanced_score_for = |tier_min: i64| -> i64 {
        if !has_life_tags { return raw_total; }
        // RANK_AREA_CAP_RATIO is 1/3
        let cap = tier_min / 3;
        let mut total = 0;
        for &v in by_area.values() {
            total += v.min(cap);
        }
        total
    };
    
    let mut current = ranks[0].clone();
    let mut current_idx = 0;
    
    for (i, rank) in ranks.iter().enumerate().skip(1) {
        if balanced_score_for(rank.min) >= rank.min {
            current = rank.clone();
            current_idx = i;
        } else {
            break;
        }
    }
    
    let next = ranks.get(current_idx + 1).cloned();
    let progress = next.as_ref().map(|n| balanced_score_for(n.min).min(n.min));
    
    Ok(RankInfo {
        current,
        next,
        progress,
        raw_total,
    })
}
