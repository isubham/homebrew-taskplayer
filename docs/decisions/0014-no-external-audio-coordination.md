# 0014 — No external audio coordination

- Status: Accepted
- Date: 2026-07-18
- Owners: TaskPlayer
- Supersedes: [0011](0011-local-audio-interruption-detection.md),
  [0013](0013-exact-media-takeover.md)

## Context

TaskPlayer 0.9.1 added two forms of external playback coordination: automatic focus-music
pause/resume around audio or microphone activity, and optional Apple Music or Spotify takeover.
Both made focus playback depend on inferred activity outside TaskPlayer and added a background
Core Audio monitor, application-specific control, settings, and macOS permissions.

## Decision

Focus music is independent of external audio. TaskPlayer neither observes audio activity from
other apps nor pauses, resumes, or otherwise controls their playback. External services likewise
do not automatically change TaskPlayer's focus-music state. The user, TaskPlayer's work/break
state, and TaskPlayer's own media controls remain the only playback inputs.

Released SQLite migrations, Supabase columns, wire fields, and capability identifiers remain in
place during the compatibility support window. They preserve safe upgrades and older-client sync
but have no playback effect in the current client.

## Consequences

- Apple Music, Spotify, browsers, and meeting apps can play alongside focus music until the user
  pauses one of them.
- TaskPlayer no longer needs Core Audio process scanning or macOS Automation permission.
- The playback-coordination settings are removed.
- Removing the retired storage and sync fields is a future compatibility-window contract step,
  not part of this behavior removal.
