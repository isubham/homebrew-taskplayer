use super::*;

pub(crate) fn export_debug_bindings() {
    // Generate TypeScript bindings for Tauri commands
    #[cfg(debug_assertions)]
    {
        let builder =
            tauri_specta::Builder::<tauri::Wry>::new().commands(tauri_specta::collect_commands![
                get_snapshot,
                add_list,
                rename_list,
                set_list_style,
                set_list_life_tag,
                set_list_availability,
                reorder_lists,
                reorder_life_areas,
                delete_list,
                add_task,
                rename_task,
                set_depth,
                set_cadence,
                set_daily_windows,
                set_session_range,
                set_estimate,
                set_deadline,
                set_task_impact,
                set_done,
                set_description,
                set_album,
                move_task,
                reorder_tasks,
                delete_task,
                add_session,
                update_session,
                delete_session,
                suggest_automatic_plan,
                accept_automatic_plan,
                create_planned_session,
                update_planned_session,
                delete_planned_session,
                start_planned_session,
                export_data,
                reveal_logs,
                import_data,
                play,
                stop,
                skip_break,
                start_break,
                resume_work,
                set_mode,
                set_app_zoom,
                set_config_field,
                set_config_sound,
                sound_options,
                sign_in_google,
                sign_out,
                sync_now,
                full_sync,
                open_main,
                set_music_playing,
                toggle_music_favorite,
                import_music_favorites,
                open_url,
                check_for_update,
                install_update
            ]);

        // Export bindings on startup in debug mode
        let _ = builder
            .export(
                specta_typescript::Typescript::default(),
                "../src/app/bindings.ts",
            )
            .map_err(|e| {
                eprintln!("Failed to export specta bindings: {:?}", e);
            });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generate_specta_bindings() {
        let builder =
            tauri_specta::Builder::<tauri::Wry>::new().commands(tauri_specta::collect_commands![
                get_snapshot,
                add_list,
                rename_list,
                set_list_style,
                set_list_life_tag,
                set_list_availability,
                reorder_lists,
                reorder_life_areas,
                delete_list,
                add_task,
                rename_task,
                set_depth,
                set_cadence,
                set_daily_windows,
                set_session_range,
                set_estimate,
                set_deadline,
                set_task_impact,
                set_done,
                set_description,
                set_album,
                move_task,
                reorder_tasks,
                delete_task,
                add_session,
                update_session,
                delete_session,
                suggest_automatic_plan,
                accept_automatic_plan,
                create_planned_session,
                update_planned_session,
                delete_planned_session,
                start_planned_session,
                export_data,
                reveal_logs,
                import_data,
                play,
                stop,
                skip_break,
                start_break,
                resume_work,
                set_mode,
                set_app_zoom,
                set_config_field,
                set_config_sound,
                sound_options,
                sign_in_google,
                sign_out,
                sync_now,
                full_sync,
                open_main,
                set_music_playing,
                toggle_music_favorite,
                import_music_favorites,
                open_url,
                check_for_update,
                install_update
            ]);

        builder
            .export(
                specta_typescript::Typescript::default(),
                "../src/app/bindings.ts",
            )
            .unwrap();
    }
}
