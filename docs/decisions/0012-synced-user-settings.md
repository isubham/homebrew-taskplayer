# 0012 — Synced user settings

- Status: Accepted
- Date: 2026-07-17
- Owners: TaskPlayer
- Related: [0011](0011-local-audio-interruption-detection.md), `public.user_settings`

## Context

General preferences need consistent behavior across devices. Timer configuration already syncs in
`config`, but expanding that model with unrelated UI and playback choices would blur its boundary.
The audio-interruption preference was initially stored only on one device and defaulted off.

## Decision

Account preferences use a separate, one-row-per-user `user_settings` model in SQLite and
Supabase. It is additive, protected by row-level security, and resolves concurrent changes using
the existing `updated_at` last-write-wins rule. Fields use backward-compatible defaults.

`pause_for_other_audio` is the first field. It defaults to true; a user can explicitly disable it,
and that override syncs across signed-in devices. Only the preference syncs. Audio-process activity
and interruption events remain ephemeral and local to each device.

## Consequences

- Future general preferences have a home that does not expand session configuration.
- A fresh install works safely before any server row exists because local and wire defaults agree.
- Clients require the additive `user_settings_v1` backend capability before syncing this model.
- Exact-player takeover consent uses the additive `music_player_takeover_v2` capability; the
  Apple-only v1 field remains dual-written during the older-client support window.
- Device-specific settings should not be placed here; they remain local by design.
