use super::*;

pub(super) fn backfill_schema(db: &Db, token: &str, marker: &str) -> Result<bool, String> {
    let needs_planner = marker.contains("planner");
    let needs_music = marker.contains("music");
    let needs_settings = marker.contains("user_settings") || marker.contains("takeover");
    let needs_planned_sessions = marker.contains("planned_sessions");
    if !needs_planner && !needs_music && !needs_settings && !needs_planned_sessions {
        return Err(format!(
            "Sync paused: this client does not understand schema backfill {marker}."
        ));
    }

    let mut changed = false;
    if needs_planner {
        changed |= backfill_planner(db, token)?;
    }
    if needs_music {
        changed |= backfill_music(db, token)?;
    }
    if needs_settings {
        changed |= backfill_settings(db, token)?;
    }
    if needs_planned_sessions {
        changed |= backfill_planned_sessions(db, token)?;
    }
    finish(db, changed)
}

fn backfill_planner(db: &Db, token: &str) -> Result<bool, String> {
    let lists = fetch_since::<RemoteList>(token, "lists", 0)?
        .into_iter()
        .map(RemoteList::into_local)
        .collect::<Vec<_>>();
    let tasks = fetch_since::<RemoteTask>(token, "tasks", 0)?
        .into_iter()
        .map(RemoteTask::into_local)
        .collect::<Vec<_>>();
    let priorities = fetch_since::<RemoteLifeAreaPriority>(token, "life_area_priorities", 0)?
        .into_iter()
        .map(RemoteLifeAreaPriority::into_local)
        .collect::<Vec<_>>();
    db.backfill_planner_fields_from_remote(&lists, &tasks, &priorities)
        .map_err(|error| error.to_string())
}

fn backfill_music(db: &Db, token: &str) -> Result<bool, String> {
    let favorites = fetch_since::<RemoteMusicFavorite>(token, "music_favorites", 0)?
        .into_iter()
        .map(RemoteMusicFavorite::into_local)
        .collect::<Vec<_>>();
    let changed = !favorites.is_empty();
    db.upsert_music_favorites_from_remote(&favorites, false)
        .map_err(|error| error.to_string())?;
    Ok(changed)
}

fn backfill_settings(db: &Db, token: &str) -> Result<bool, String> {
    let settings = fetch_since::<RemoteUserSettings>(token, "user_settings", 0)?
        .into_iter()
        .map(RemoteUserSettings::into_local)
        .next();
    match settings {
        Some(value) => db
            .upsert_user_settings_from_remote(&value, false)
            .map_err(|error| error.to_string()),
        None => Ok(false),
    }
}

fn backfill_planned_sessions(db: &Db, token: &str) -> Result<bool, String> {
    let sessions = fetch_since::<RemotePlannedSession>(token, "planned_sessions", 0)?
        .into_iter()
        .map(RemotePlannedSession::into_local)
        .collect::<Vec<_>>();
    let changed = !sessions.is_empty();
    db.upsert_planned_sessions_from_remote(&sessions, false)
        .map_err(|error| error.to_string())?;
    Ok(changed)
}

fn finish(db: &Db, changed: bool) -> Result<bool, String> {
    db.clear_sync_schema_backfill()
        .map_err(|error| error.to_string())?;
    Ok(changed)
}
