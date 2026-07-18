# 0011 — Local audio-interruption detection

- Status: Superseded by [0014](0014-no-external-audio-coordination.md)
- Date: 2026-07-17
- Owners: TaskPlayer
- Related: `docs/features.md` Audius player, `src-tauri/src/audio_interruption.rs`
- Preference default/persistence: superseded by [0012](0012-synced-user-settings.md)

## Context

Focus music should yield when another media app or meeting starts, then resume without asking the
user to remember to restart it. Teams, browser meetings, and WhatsApp do not share a dependable
local call-state API, and service-specific integrations would add accounts, network dependency,
and inconsistent behavior.

## Decision

TaskPlayer observes macOS Core Audio process input/output activity locally. A stable external
output signal is treated as media; any stable external input signal is treated as a meeting. The
monitor excludes TaskPlayer's own output using the native process identity when available and a
single-WebView-output heuristic otherwise. It emits only an active flag and media/meeting kind.

An event-listener implementation was trialed on 2026-07-17 and then withdrawn because process
property notifications were inconsistent across real media apps. The monitor uses a 500 ms local
process-state scan instead. Focus music pauses on the first detected scan, while a one-second
release delay limits rapid automatic resume.

The feature is opt-in and device-local. It does not capture PCM samples, record or transcribe
audio, persist process activity, or sync any interruption state. User intent remains authoritative:
automatic suppression never clears the user's desire for music, manual Pause prevents automatic
resume, and manual Play overrides the current interruption.

## ADHD and gamification check

The feature externalizes interruption handling at the point of performance. Its mini-player status
is quiet and immediate, with no toast, history, score, penalty, or engagement reward.

## Alternatives considered

- Core Audio process tap and amplitude measurement — more precise for silence, but requests a
  sensitive System Audio Recording permission and processes audio samples unnecessarily.
- Teams, Google Meet, and WhatsApp APIs — incomplete across native/browser clients and require
  service-specific authentication or cloud infrastructure.
- Private MediaRemote APIs — fragile, unsupported, and unsuitable for a durable product rule.

## Consequences

- Meetings remain suppressed through silence when their input/output streams stay active.
- Browser microphone use cannot distinguish Meet from another browser call; that is intentional.
- Some apps may keep output streams active while paused. The opt-in setting, release delay, and
  manual override limit the impact; amplitude capture remains a future fallback if testing
  demonstrates unacceptable false positives.
- Older macOS versions continue working without this optional feature.
