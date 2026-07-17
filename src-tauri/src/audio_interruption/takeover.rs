use std::process::Command;

use super::{platform, AudioInterruptionKind};
use crate::constants::*;

#[derive(Default)]
pub(crate) struct MediaTakeover {
    paused_apple_music: bool,
    paused_spotify: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum PauseOutcome {
    PausedNow,
    AlreadyPaused,
    Failed,
}

impl PauseOutcome {
    fn succeeded(self) -> bool {
        self != Self::Failed
    }
}

impl MediaTakeover {
    pub(crate) fn take_over_music_players(&mut self, music_playing: bool) -> bool {
        let Ok(activity) = platform::scan(music_playing) else {
            return false;
        };
        if activity.kind == AudioInterruptionKind::Meeting {
            return false;
        }
        if activity.unsupported_output {
            self.restore_all_leases();
            return false;
        }
        if !activity.apple_music_output && !activity.spotify_output {
            return self.has_lease();
        }
        let apple_outcome = activity
            .apple_music_output
            .then(|| pause_player(APPLE_MUSIC_STATE_SCRIPT, APPLE_MUSIC_PAUSE_SCRIPT));
        let spotify_outcome = activity
            .spotify_output
            .then(|| pause_player(SPOTIFY_STATE_SCRIPT, SPOTIFY_PAUSE_SCRIPT));
        let apple_paused = apple_outcome
            .map(|outcome| apply_pause_outcome(&mut self.paused_apple_music, outcome))
            .unwrap_or(true);
        let spotify_paused = spotify_outcome
            .map(|outcome| apply_pause_outcome(&mut self.paused_spotify, outcome))
            .unwrap_or(true);
        if apple_paused && spotify_paused {
            return true;
        }
        self.restore_all_leases();
        false
    }

    pub(crate) fn release_music_players(&mut self, music_playing: bool) -> bool {
        if !self.has_lease() {
            return false;
        }
        let resume_apple = self.paused_apple_music;
        let resume_spotify = self.paused_spotify;
        self.paused_apple_music = false;
        self.paused_spotify = false;
        let Ok(activity) = platform::scan(music_playing) else {
            return false;
        };
        if activity.kind == AudioInterruptionKind::Meeting || activity.unsupported_output {
            return false;
        }
        if activity.apple_music_output
            && !resume_apple
            && player_is_playing(APPLE_MUSIC_STATE_SCRIPT)
        {
            return false;
        }
        if activity.spotify_output && !resume_spotify && player_is_playing(SPOTIFY_STATE_SCRIPT) {
            return false;
        }
        let apple_resumed =
            !resume_apple || run_script(APPLE_MUSIC_RESUME_SCRIPT, APPLE_MUSIC_RESUME_RESULT);
        let spotify_resumed =
            !resume_spotify || run_script(SPOTIFY_RESUME_SCRIPT, SPOTIFY_RESUME_RESULT);
        apple_resumed && spotify_resumed
    }

    fn has_lease(&self) -> bool {
        self.paused_apple_music || self.paused_spotify
    }

    fn restore_all_leases(&mut self) {
        if self.paused_apple_music {
            let _ = run_script(APPLE_MUSIC_RESUME_SCRIPT, APPLE_MUSIC_RESUME_RESULT);
            self.paused_apple_music = false;
        }
        if self.paused_spotify {
            let _ = run_script(SPOTIFY_RESUME_SCRIPT, SPOTIFY_RESUME_RESULT);
            self.paused_spotify = false;
        }
    }
}

fn run_script(script: &str, expected: &str) -> bool {
    script_output(script).is_some_and(|output| output == expected)
}

fn pause_player(state_script: &str, pause_script: &str) -> PauseOutcome {
    match script_output(state_script).as_deref() {
        Some(MEDIA_PLAYING_STATE) if run_script(pause_script, MEDIA_PAUSED_NOW_RESULT) => {
            PauseOutcome::PausedNow
        }
        Some(MEDIA_PAUSED_STATE) => PauseOutcome::AlreadyPaused,
        _ => PauseOutcome::Failed,
    }
}

fn player_is_playing(state_script: &str) -> bool {
    script_output(state_script).as_deref() == Some(MEDIA_PLAYING_STATE)
}

fn apply_pause_outcome(lease: &mut bool, outcome: PauseOutcome) -> bool {
    if outcome == PauseOutcome::PausedNow {
        *lease = true;
    }
    outcome.succeeded()
}

fn script_output(script: &str) -> Option<String> {
    Command::new(OSASCRIPT_PATH)
        .args(["-e", script])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|output| output.trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_takeover_has_no_resume_lease() {
        assert!(!MediaTakeover::default().has_lease());
    }

    #[test]
    fn already_paused_preserves_only_an_existing_lease() {
        let mut existing_lease = true;
        assert!(apply_pause_outcome(
            &mut existing_lease,
            PauseOutcome::AlreadyPaused
        ));
        assert!(existing_lease);

        let mut no_lease = false;
        assert!(apply_pause_outcome(
            &mut no_lease,
            PauseOutcome::AlreadyPaused
        ));
        assert!(!no_lease);
    }
}
