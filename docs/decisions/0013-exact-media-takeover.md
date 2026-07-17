# 0013 — Exact media takeover

- Status: Accepted
- Date: 2026-07-17
- Owners: TaskPlayer
- Related: [0011](0011-local-audio-interruption-detection.md), [0012](0012-synced-user-settings.md)

## Context

Some users want focus music to keep priority when another player starts. A global media-key event
cannot reliably identify which application receives it or prove which playback TaskPlayer should
resume later. Resuming the wrong browser tab, meeting, or player would be surprising and unsafe.

## Decision

Media takeover is explicit, off by default, and implemented per supported application. The first
adapters control Apple Music and Spotify through macOS Apple Events after Core Audio confirms the
exact bundle ID has active output. A successful pause creates an in-memory ownership lease for
that player. TaskPlayer may resume leased players only when no other media or meeting is active.

The lease is never persisted or synced. The preference to permit takeover is stored in synced
`user_settings`. Unsupported players and meetings retain the normal behavior where TaskPlayer
yields. Generic media-key simulation is excluded.

## Consequences

- macOS may show an Automation permission prompt the first time takeover is used.
- Quitting TaskPlayer loses the lease, intentionally preventing delayed surprise playback.
- If a supported player is manually resumed during focus, TaskPlayer pauses it again only while
  focus music remains active and the opt-in is still enabled.
- Supporting another player requires a separate exact adapter and compatibility review.
