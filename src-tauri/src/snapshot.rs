use super::*;

// ---- snapshot / status builders ----
pub(crate) fn build_snapshot(state: &AppState) -> Snapshot {
    // Snapshot reads must never hold the database mutex while acquiring one
    // of the smaller state mutexes. Timer/config mutations use the opposite
    // order when they persist a change, so overlapping the guards here can
    // deadlock two Tauri command threads (and freeze the main thread behind
    // the resulting push). Copy the database-backed fields first, then drop
    // that guard before reading the remaining state.
    let (lists, life_area_priorities, tasks, sessions, music_favorites, user_settings, account) = {
        let db = state.db.lock().unwrap();
        (
            db.lists().unwrap_or_default(),
            db.life_area_priorities().unwrap_or_default(),
            db.tasks().unwrap_or_default(),
            db.sessions().unwrap_or_default(),
            db.music_favorites().unwrap_or_default(),
            db.get_user_settings(),
            db.get_account(),
        )
    };
    let sync_status = state.sync_status.lock().unwrap().clone();
    let config = state.config.lock().unwrap().clone();
    let run = state.run.lock().unwrap().clone();
    Snapshot {
        lists,
        life_area_priorities,
        tasks,
        sessions,
        music_favorites,
        user_settings,
        config,
        run,
        device_id: state.device_id.clone(),
        account,
        syncing: sync_status.syncing,
        last_synced_at: sync_status.last_synced_at,
        last_sync_error: sync_status.last_sync_error,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

pub(crate) fn build_status(state: &AppState, now: i64) -> Status {
    let run = state.run.lock().unwrap().clone();
    let config = state.config.lock().unwrap().clone();
    let db = state.db.lock().unwrap();

    let mut st = Status {
        active: false,
        phase: run.phase.clone(),
        task_id: run.active_task_id.clone(),
        task_name: None,
        list_name: None,
        list_color: None,
        elapsed_ms: 0,
        minutes: 0,
        task_total_ms: 0,
    };

    if let Some(tid) = run.active_task_id.clone() {
        st.active = true;
        if let Ok(tasks) = db.tasks() {
            if let Some(t) = tasks.iter().find(|x| x.id == tid) {
                st.task_name = Some(t.name.clone());
                if let Ok(lists) = db.lists() {
                    if let Some(l) = lists.iter().find(|x| x.id == t.list_id) {
                        st.list_name = Some(l.name.clone());
                        st.list_color = Some(l.color.clone());
                    }
                }
            }
        }
        if let Ok(sessions) = db.sessions() {
            st.task_total_ms = task_total_ms(&sessions, &run, &tid, now);
        }
        st.elapsed_ms = if run.phase.as_deref() == Some("break") {
            timer::break_remaining(&run, &config, now)
        } else {
            timer::work_elapsed(&run, now)
        };
        st.minutes = st.elapsed_ms / 60_000;
    }
    st
}

/// Format milliseconds as "1h 05m" / "1h" / "45m", matching the frontend's fmtHM.
pub(crate) fn format_hm(ms: i64) -> String {
    let minutes = ms / 60_000;
    let hours = minutes / 60;
    let remainder = minutes % 60;
    if hours > 0 {
        if remainder > 0 {
            format!("{}h {}m", hours, remainder)
        } else {
            format!("{}h", hours)
        }
    } else {
        format!("{}m", minutes)
    }
}

/// Trim a title to `n` characters (char-safe), adding an ellipsis if cut.
pub(crate) fn truncate(s: &str, n: usize) -> String {
    if s.chars().count() > n {
        format!(
            "{}…",
            s.chars().take(n.saturating_sub(1)).collect::<String>()
        )
    } else {
        s.to_string()
    }
}

/// Task name to show in a pomodoro transition notification, truncated the
/// same way the tray title is — a 90-character task name would otherwise
/// blow out the notification body.
pub(crate) fn task_name_for_notification(db: &Db, task_id: &str) -> String {
    db.tasks()
        .unwrap_or_default()
        .into_iter()
        .find(|t| t.id == task_id)
        .map(|t| truncate(&t.name, 60))
        .unwrap_or_else(|| "your task".to_string())
}
