// TaskPlayer library — Tauri shell around taskplayer-core.
mod auth;
mod background_jobs;
mod bindings;
mod config;
mod constants;
mod startup;
mod sync;
mod tick_loop;
mod tick_notifications;

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use chrono::{Days, Local, NaiveDate, TimeZone, Timelike};
use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;

use taskplayer_core::models::now_ms;
use taskplayer_core::schedule::{due_schedule_events, ScheduleEvent, ScheduleEventKind};
use taskplayer_core::{
    task_total_ms, timer, AccountInfo, Db, RunState, Session, SessionConfig, Snapshot, Status,
    Task, TaskList,
};

use constants::*;

mod state;
use state::*;

mod snapshot;
use snapshot::*;

mod diagnostics;
use diagnostics::*;

mod tray;
use tray::*;

mod auth_session;
mod device;
mod playback_service;
mod sync_service;

use auth_session::*;
use device::*;
use playback_service::*;
use sync_service::*;

mod commands;
use commands::*;

pub fn run() {
    install_panic_hook();

    bindings::export_debug_bindings();

    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .setup(startup::setup)
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            // keep the app alive in the menu bar when the main window is closed
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
            // Catches "I switched to my other laptop and back" without
            // shortening the 60s baseline interval for everyone else.
            if let WindowEvent::Focused(true) = event {
                let handle = window.app_handle().clone();
                std::thread::spawn(move || run_sync(&handle));
            }
        })
        .invoke_handler(tauri::generate_handler![
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
            open_url,
            check_for_update,
            install_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running TaskPlayer");
}
