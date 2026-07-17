use super::super::*;

#[derive(Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AudioInterruptionCapability {
    pub(crate) available: bool,
    pub(crate) enabled: bool,
}

#[specta::specta]
#[tauri::command]
pub(crate) fn audio_interruption_capability(state: State<AppState>) -> AudioInterruptionCapability {
    let monitor = state.audio_interruption_monitor.lock().unwrap();
    AudioInterruptionCapability {
        available: audio_interruption_available(),
        enabled: monitor.enabled(),
    }
}

#[specta::specta]
#[tauri::command]
pub(crate) fn set_audio_interruption_monitoring(
    app: AppHandle,
    state: State<AppState>,
    enabled: bool,
) -> AudioInterruptionCapability {
    let mut monitor = state.audio_interruption_monitor.lock().unwrap();
    let available = if enabled {
        monitor.start(app)
    } else {
        monitor.stop();
        audio_interruption_available()
    };
    AudioInterruptionCapability {
        available,
        enabled: monitor.enabled(),
    }
}

#[specta::specta]
#[tauri::command]
pub(crate) fn set_pause_for_other_audio(
    app: AppHandle,
    state: State<AppState>,
    enabled: bool,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let mut settings = db.get_user_settings();
        settings.pause_for_other_audio = enabled;
        if !enabled {
            settings.take_over_apple_music = false;
            settings.take_over_music_players = false;
        }
        settings.updated_at = now_ms();
        let _ = db.set_user_settings(&settings);
    }
    if !enabled {
        release_music_player_takeover(state.inner());
    }
    push(&app);
    build_snapshot(state.inner())
}

#[specta::specta]
#[tauri::command]
pub(crate) fn set_music_player_takeover(
    app: AppHandle,
    state: State<AppState>,
    enabled: bool,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let mut settings = db.get_user_settings();
        settings.take_over_apple_music = enabled;
        settings.take_over_music_players = enabled;
        if enabled {
            settings.pause_for_other_audio = true;
        }
        settings.updated_at = now_ms();
        let _ = db.set_user_settings(&settings);
    }
    if !enabled {
        release_music_player_takeover(state.inner());
    }
    push(&app);
    build_snapshot(state.inner())
}

#[specta::specta]
#[tauri::command]
pub(crate) fn take_over_music_players(state: State<AppState>) -> bool {
    if !state
        .db
        .lock()
        .unwrap()
        .get_user_settings()
        .take_over_music_players
    {
        return false;
    }
    let music_playing = *state.music_playing.lock().unwrap();
    state
        .media_takeover
        .lock()
        .unwrap()
        .take_over_music_players(music_playing)
}

fn release_music_player_takeover(state: &AppState) -> bool {
    let music_playing = *state.music_playing.lock().unwrap();
    state
        .media_takeover
        .lock()
        .unwrap()
        .release_music_players(music_playing)
}

#[specta::specta]
#[tauri::command]
pub(crate) fn release_music_players(state: State<AppState>) -> bool {
    release_music_player_takeover(state.inner())
}
