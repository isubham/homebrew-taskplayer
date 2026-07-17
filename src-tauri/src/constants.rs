use std::time::Duration;

pub(crate) const REFRESH_SKEW_MS: i64 = 5 * 60 * 1000;
pub(crate) const AUDIO_INTERRUPTION_EVENT: &str = "audio-interruption-changed";
pub(crate) const AUDIO_INTERRUPTION_POLL_INTERVAL: Duration = Duration::from_millis(500);
pub(crate) const AUDIO_INTERRUPTION_PAUSE_DELAY: Duration = Duration::ZERO;
pub(crate) const AUDIO_INTERRUPTION_RELEASE_DELAY: Duration = Duration::from_secs(1);
pub(crate) const APPLE_MUSIC_BUNDLE_ID: &str = "com.apple.Music";
pub(crate) const SPOTIFY_BUNDLE_ID: &str = "com.spotify.client";
pub(crate) const OSASCRIPT_PATH: &str = "/usr/bin/osascript";
pub(crate) const APPLE_MUSIC_RESUME_RESULT: &str = "resumed";
pub(crate) const SPOTIFY_RESUME_RESULT: &str = "resumed";
pub(crate) const MEDIA_PAUSED_NOW_RESULT: &str = "paused-now";
pub(crate) const MEDIA_PLAYING_STATE: &str = "playing";
pub(crate) const MEDIA_PAUSED_STATE: &str = "paused";
pub(crate) const APPLE_MUSIC_STATE_SCRIPT: &str = r#"
if application "Music" is running then
  tell application "Music" to return player state
end if
return "inactive"
"#;
pub(crate) const APPLE_MUSIC_PAUSE_SCRIPT: &str = r#"
if application "Music" is running then
  tell application "Music"
    pause
    return "paused-now"
  end tell
end if
return "inactive"
"#;
pub(crate) const APPLE_MUSIC_RESUME_SCRIPT: &str = r#"
if application "Music" is running then
  tell application "Music"
    play
    return "resumed"
  end tell
end if
return "inactive"
"#;
pub(crate) const SPOTIFY_STATE_SCRIPT: &str = r#"
if application "Spotify" is running then
  tell application "Spotify" to return player state
end if
return "inactive"
"#;
pub(crate) const SPOTIFY_PAUSE_SCRIPT: &str = r#"
if application "Spotify" is running then
  tell application "Spotify"
    pause
    return "paused-now"
  end tell
end if
return "inactive"
"#;
pub(crate) const SPOTIFY_RESUME_SCRIPT: &str = r#"
if application "Spotify" is running then
  tell application "Spotify"
    play
    return "resumed"
  end tell
end if
return "inactive"
"#;

pub(crate) const SESSION_EXPIRED_MSG: &str =
    "Not signed in (your session expired) — sign out and sign back in.";
pub(crate) const SYNC_RETRY_MSG: &str =
    "Sync paused by a connection issue — retrying automatically.";

pub(crate) const SOUND_OPTIONS: &[&str] = &[
    "Basso",
    "Blow",
    "Bottle",
    "Frog",
    "Funk",
    "Glass",
    "Hero",
    "Morse",
    "Ping",
    "Pop",
    "Purr",
    "Sosumi",
    "Submarine",
    "Tink",
];
