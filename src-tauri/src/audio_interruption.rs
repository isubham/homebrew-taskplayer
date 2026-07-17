use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::thread::JoinHandle;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};

use crate::{constants::*, state::AppState};

#[cfg(target_os = "macos")]
mod core_audio;
mod platform;
#[cfg(all(test, target_os = "macos"))]
mod platform_tests;
mod takeover;

pub(crate) use takeover::MediaTakeover;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum AudioInterruptionKind {
    #[default]
    None,
    Media,
    Meeting,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AudioInterruptionEvent {
    pub(crate) active: bool,
    pub(crate) kind: AudioInterruptionKind,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(crate) struct AudioActivity {
    pub(crate) kind: AudioInterruptionKind,
    pub(crate) apple_music_output: bool,
    pub(crate) spotify_output: bool,
    pub(crate) unsupported_output: bool,
}

#[derive(Default)]
pub(crate) struct AudioInterruptionMonitor {
    stop: Option<Arc<AtomicBool>>,
    thread: Option<JoinHandle<()>>,
}

pub(crate) fn audio_interruption_available() -> bool {
    platform::scan(false).is_ok()
}

impl AudioInterruptionMonitor {
    pub(crate) fn enabled(&self) -> bool {
        self.thread.is_some()
    }

    pub(crate) fn start(&mut self, app: AppHandle) -> bool {
        if self.enabled() {
            return true;
        }
        if !audio_interruption_available() {
            return false;
        }
        let stop = Arc::new(AtomicBool::new(false));
        let thread_stop = stop.clone();
        self.stop = Some(stop);
        self.thread = Some(std::thread::spawn(move || monitor_loop(app, thread_stop)));
        true
    }

    pub(crate) fn stop(&mut self) {
        if let Some(stop) = self.stop.take() {
            stop.store(true, Ordering::Relaxed);
        }
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

impl Drop for AudioInterruptionMonitor {
    fn drop(&mut self) {
        self.stop();
    }
}

fn monitor_loop(app: AppHandle, stop: Arc<AtomicBool>) {
    let mut debouncer = InterruptionDebouncer::new(Instant::now());
    while !stop.load(Ordering::Relaxed) {
        let now = Instant::now();
        let music_playing = *app.state::<AppState>().music_playing.lock().unwrap();
        let raw = platform::scan(music_playing).unwrap_or_default().kind;
        if let Some(emitted) = debouncer.update(raw, now) {
            emit_interruption(&app, emitted);
        }
        std::thread::sleep(AUDIO_INTERRUPTION_POLL_INTERVAL);
    }
    if debouncer.emitted != AudioInterruptionKind::None {
        emit_interruption(&app, AudioInterruptionKind::None);
    }
}

fn emit_interruption(app: &AppHandle, kind: AudioInterruptionKind) {
    let _ = app.emit(
        AUDIO_INTERRUPTION_EVENT,
        AudioInterruptionEvent {
            active: kind != AudioInterruptionKind::None,
            kind,
        },
    );
}

struct InterruptionDebouncer {
    emitted: AudioInterruptionKind,
    candidate: AudioInterruptionKind,
    candidate_since: Instant,
}

impl InterruptionDebouncer {
    fn new(now: Instant) -> Self {
        Self {
            emitted: AudioInterruptionKind::None,
            candidate: AudioInterruptionKind::None,
            candidate_since: now,
        }
    }

    fn update(
        &mut self,
        raw: AudioInterruptionKind,
        now: Instant,
    ) -> Option<AudioInterruptionKind> {
        if raw != self.candidate {
            self.candidate = raw;
            self.candidate_since = now;
        }
        let delay = if self.candidate == AudioInterruptionKind::None {
            AUDIO_INTERRUPTION_RELEASE_DELAY
        } else {
            AUDIO_INTERRUPTION_PAUSE_DELAY
        };
        if self.candidate != self.emitted && now.duration_since(self.candidate_since) >= delay {
            self.emitted = self.candidate;
            Some(self.emitted)
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests;
