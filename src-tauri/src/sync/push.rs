use super::*;

pub(super) fn push(db_mutex: &Mutex<Db>, access_token: &str, user_id: &str) -> Result<(), String> {
    let (
        cursor,
        lists,
        albums,
        tasks,
        sessions,
        priorities,
        music_favorites,
        planned_sessions,
        goals,
        goal_task_links,
        run,
        config,
        user_settings,
        now,
    ) = {
        let db = db_mutex.lock().unwrap();
        let cursor = db.get_push_cursor();
        let (lists, tasks, sessions) = db.dirty_since(cursor).map_err(|e| e.to_string())?;
        let albums = db.albums_dirty_since(cursor).map_err(|e| e.to_string())?;
        let priorities = db
            .life_area_priorities_dirty_since(cursor)
            .map_err(|e| e.to_string())?;
        let music_favorites = db
            .music_favorites_dirty_since(cursor)
            .map_err(|e| e.to_string())?;
        let planned_sessions = db
            .planned_sessions_dirty_since(cursor)
            .map_err(|e| e.to_string())?;
        let goals = db.goals_dirty_since(cursor).map_err(|e| e.to_string())?;
        let goal_task_links = db
            .goal_task_links_dirty_since(cursor)
            .map_err(|e| e.to_string())?;
        let run = db.get_run();
        let config = db.get_config();
        let user_settings = db.get_user_settings();
        let now = now_ms();
        (
            cursor,
            lists,
            albums,
            tasks,
            sessions,
            priorities,
            music_favorites,
            planned_sessions,
            goals,
            goal_task_links,
            run,
            config,
            user_settings,
            now,
        )
    };

    upsert(
        access_token,
        "lists",
        &lists
            .iter()
            .map(|l| RemoteList::from_local(l, user_id))
            .collect::<Vec<_>>(),
    )?;
    upsert(
        access_token,
        "albums",
        &albums
            .iter()
            .map(|album| RemoteAlbum::from_local(album, user_id))
            .collect::<Vec<_>>(),
    )?;
    upsert(
        access_token,
        "tasks",
        &tasks
            .iter()
            .map(|t| RemoteTask::from_local(t, user_id))
            .collect::<Vec<_>>(),
    )?;
    upsert(
        access_token,
        "sessions",
        &sessions
            .iter()
            .map(|s| RemoteSession::from_local(s, user_id))
            .collect::<Vec<_>>(),
    )?;
    upsert(
        access_token,
        "life_area_priorities",
        &priorities
            .iter()
            .map(|p| RemoteLifeAreaPriority::from_local(p, user_id))
            .collect::<Vec<_>>(),
    )?;
    upsert(
        access_token,
        "music_favorites",
        &music_favorites
            .iter()
            .map(|favorite| RemoteMusicFavorite::from_local(favorite, user_id))
            .collect::<Vec<_>>(),
    )?;
    upsert(
        access_token,
        "planned_sessions",
        &planned_sessions
            .iter()
            .map(|session| RemotePlannedSession::from_local(session, user_id))
            .collect::<Vec<_>>(),
    )?;
    upsert(
        access_token,
        "goals",
        &goals
            .iter()
            .map(|goal| RemoteGoal::from_local(goal, user_id))
            .collect::<Vec<_>>(),
    )?;
    upsert(
        access_token,
        "goal_task_links",
        &goal_task_links
            .iter()
            .map(|link| RemoteGoalTaskLink::from_local(link, user_id))
            .collect::<Vec<_>>(),
    )?;

    // `run_state` is a single JSON blob under `meta` (see `Db::get_run`/
    // `set_run`), not a real SQL table — it isn't covered by `dirty_since`,
    // so check its own `updated_at` against the same push cursor directly.
    // This is also exactly what keeps an idle device from re-pushing (and
    // thereby re-claiming ownership of) a session it isn't actually running:
    // `updated_at` only advances on an actual local play/pause/finish/phase
    // transition (see `RunState::updated_at`'s doc comment in models.rs), so
    // a device that hasn't touched its timer never has anything dirty here.
    // a device that hasn't touched its timer never has anything dirty here.
    if run.updated_at > cursor {
        if let Some(remote_run) = RemoteRunState::from_local(&run, user_id) {
            upsert(access_token, "run_state", &[remote_run])?;
        }
    }

    // Same story as run_state, one paragraph up — `config` is also a `meta`
    // JSON blob, not a real table, and only push it if a local settings
    // change actually bumped its own `updated_at` past the cursor.
    // change actually bumped its own `updated_at` past the cursor.
    if config.updated_at > cursor {
        upsert(
            access_token,
            "config",
            &[RemoteConfig::from_local(&config, user_id)],
        )?;
    }

    if user_settings.updated_at > cursor {
        upsert(
            access_token,
            "user_settings",
            &[RemoteUserSettings::from_local(&user_settings, user_id)],
        )?;
    }

    let db = db_mutex.lock().unwrap();
    db.set_push_cursor(now).map_err(|e| e.to_string())
}
