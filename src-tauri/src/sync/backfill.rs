use super::*;

pub(super) fn backfill_planner_schema(db: &Db, token: &str) -> Result<bool, String> {
    finish(db, backfill_planner(db, token)?)
}

pub(super) fn backfill_music_favorites_schema(db: &Db, token: &str) -> Result<bool, String> {
    finish(db, backfill_music(db, token)?)
}

pub(super) fn backfill_planner_and_music_schema(db: &Db, token: &str) -> Result<bool, String> {
    let planner = backfill_planner(db, token)?;
    let music = backfill_music(db, token)?;
    finish(db, planner || music)
}

pub(super) fn backfill_user_settings_schema(db: &Db, token: &str) -> Result<bool, String> {
    finish(db, backfill_settings(db, token)?)
}

pub(super) fn backfill_planner_and_user_settings_schema(
    db: &Db,
    token: &str,
) -> Result<bool, String> {
    let planner = backfill_planner(db, token)?;
    let settings = backfill_settings(db, token)?;
    finish(db, planner || settings)
}

pub(super) fn backfill_music_and_user_settings_schema(
    db: &Db,
    token: &str,
) -> Result<bool, String> {
    let music = backfill_music(db, token)?;
    let settings = backfill_settings(db, token)?;
    finish(db, music || settings)
}

pub(super) fn backfill_all_current_schema(db: &Db, token: &str) -> Result<bool, String> {
    let planner = backfill_planner(db, token)?;
    let music = backfill_music(db, token)?;
    let settings = backfill_settings(db, token)?;
    finish(db, planner || music || settings)
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

fn finish(db: &Db, changed: bool) -> Result<bool, String> {
    db.clear_sync_schema_backfill()
        .map_err(|error| error.to_string())?;
    Ok(changed)
}
