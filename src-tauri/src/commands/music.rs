use super::super::*;

fn valid_track(track: &MusicFavoriteInput) -> bool {
    !track.track_id.trim().is_empty()
        && !track.title.trim().is_empty()
        && !track.artist.trim().is_empty()
        && matches!(track.source_type.as_str(), "audius" | "noise")
}

#[specta::specta]
#[tauri::command]
pub(crate) fn toggle_music_favorite(
    app: AppHandle,
    state: State<AppState>,
    track: MusicFavoriteInput,
) -> Snapshot {
    if valid_track(&track) {
        let _ = state.db.lock().unwrap().toggle_music_favorite(&track);
        push(&app);
    }
    build_snapshot(state.inner())
}

/// One-time bridge from the localStorage implementation. Existing SQLite
/// rows, including tombstones synced from another device, always win so an
/// old browser cache cannot resurrect a deliberately removed favorite.
#[specta::specta]
#[tauri::command]
pub(crate) fn import_music_favorites(
    app: AppHandle,
    state: State<AppState>,
    tracks: Vec<MusicFavoriteInput>,
) -> Snapshot {
    let valid = tracks.into_iter().filter(valid_track).collect::<Vec<_>>();
    if !valid.is_empty() {
        let _ = state.db.lock().unwrap().import_music_favorites(&valid);
        push(&app);
    }
    build_snapshot(state.inner())
}
