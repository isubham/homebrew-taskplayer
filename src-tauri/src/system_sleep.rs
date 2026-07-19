use tauri::AppHandle;

#[cfg(target_os = "macos")]
mod macos {
    use super::super::*;
    use block2::RcBlock;
    use objc2_app_kit::{
        NSWorkspace, NSWorkspaceDidWakeNotification, NSWorkspaceWillSleepNotification,
    };
    use objc2_foundation::NSNotification;
    use std::ptr::NonNull;
    use std::sync::{Arc, Mutex};

    pub(super) fn register(app: &AppHandle) {
        let workspace = NSWorkspace::sharedWorkspace();
        let center = workspace.notificationCenter();
        let sleep_started_at = Arc::new(Mutex::new(None));

        let will_sleep_time = Arc::clone(&sleep_started_at);
        let will_sleep = RcBlock::new(move |_: NonNull<NSNotification>| {
            guard("macOS will-sleep notification", || {
                *will_sleep_time.lock().unwrap() = Some(now_ms());
            });
        });
        let will_sleep_observer = unsafe {
            center.addObserverForName_object_queue_usingBlock(
                Some(NSWorkspaceWillSleepNotification),
                None,
                None,
                &will_sleep,
            )
        };

        let wake_time = Arc::clone(&sleep_started_at);
        let wake_handle = app.clone();
        let did_wake = RcBlock::new(move |_: NonNull<NSNotification>| {
            guard("macOS did-wake notification", || {
                let Some(sleep_start) = wake_time.lock().unwrap().take() else {
                    return;
                };
                let wake_at = now_ms();
                let state = wake_handle.state::<AppState>();
                let run = state.run.lock().unwrap().clone();
                if is_own(&run, &state.device_id) && run.phase.as_deref() == Some(RUN_PHASE_WORK) {
                    do_stop_after_confirmed_sleep(
                        state.inner(),
                        sleep_start,
                        wake_at.saturating_sub(sleep_start),
                    );
                    push(&wake_handle);
                }
            });
        });
        let did_wake_observer = unsafe {
            center.addObserverForName_object_queue_usingBlock(
                Some(NSWorkspaceDidWakeNotification),
                None,
                None,
                &did_wake,
            )
        };

        std::mem::forget((will_sleep_observer, did_wake_observer));
        log_line(SYSTEM_SLEEP_OBSERVER_REGISTERED_LOG);
    }
}

pub(crate) fn register(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    macos::register(app);

    #[cfg(not(target_os = "macos"))]
    let _ = app;
}
