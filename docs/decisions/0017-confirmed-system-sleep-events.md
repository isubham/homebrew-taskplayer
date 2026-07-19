# 0017 — Timer sleep handling requires confirmed system events

- Status: Accepted
- Date: 2026-07-19
- Owners: TaskPlayer
- Related: [Feature catalog](../features.md), [Rust module map](../rust-module-map.md)

## Context

TaskPlayer must exclude computer sleep from recorded work without pausing for ordinary process
scheduling delays. The original one-second timer loop treated any delay over five seconds as
sleep. A 5.3-second delay during a macOS maintenance wake therefore stopped a real work session
even though the computer had not entered a new sleep transition.

## Decision

The macOS shell observes `NSWorkspaceWillSleepNotification` and
`NSWorkspaceDidWakeNotification`. It remembers the confirmed sleep timestamp, and on confirmed
wake closes an owned work session at that timestamp. The ordinary timer loop no longer infers
sleep from elapsed wall-clock time or scheduler responsiveness.

Structured pause diagnostics identify the native workspace trigger and include the measured
sleep interval alongside session-history and run-state persistence outcomes.

## Alternatives considered

- Increase the scheduler-gap threshold — rejected because any threshold can still misclassify
  CPU pressure, debugging, App Nap, or a maintenance wake as system sleep.
- Keep the timer running through sleep — rejected because sleep would inflate factual work
  history and progress.
- Poll `pmset` logs — rejected because polling is indirect, slower, and less reliable than the
  native lifecycle notifications emitted for the running application.

## Consequences

- Ordinary delayed ticks cannot pause a task.
- Confirmed sleep remains excluded from tracked work.
- Sleep handling is macOS-specific shell behavior; the pure timer engine remains platform-free.
- Any future platform needs its own confirmed lifecycle integration rather than a timing
  heuristic.
