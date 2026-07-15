# 0002 — Start Pomodoro phases automatically at boundaries

- Status: Accepted
- Date: 2026-07-15
- Owners: TaskPlayer
- Related: [`../features.md`](../features.md), [`../../CHANGELOG.md`](../../CHANGELOG.md),
  [`../pomodoro-user-stories.md`](../pomodoro-user-stories.md)

## Context

Pomodoro previously logged a completed work block and then entered `awaiting_break`; the user had
to click Start Break. When the break ended it entered `awaiting_work`, surfaced the app window,
and required another click to resume. Those confirmations interrupted the cadence the timer was
already configured to provide and made the user manage state the app already knew.

## Decision

At the work boundary, log the completed session, start the configured short/long break
immediately, pause music, and send a notification. At the break boundary, start the next work
block immediately, resume music, and send another notification. Neither transition forces the
main window forward or requires a confirmation click.

Keep recovery commands/UI for an old `awaiting_break` or `awaiting_work` state that may arrive
from an older synced client, but never generate those states in new cycles.

## ADHD and gamification check

This externalizes time and removes two executive-function demands at the point of transition.
The notifications remain immediate cues. No reward, loss framing, urgency language, or permanent
negative record is added.

## Alternatives considered

- Require confirmation at both boundaries — rejected because it makes the user remember and
  execute state transitions the configured timer can perform safely.
- Auto-start breaks but require work confirmation — rejected because it leaves the cycle stalled
  after every break and adds inconsistent behavior.
- Force the window forward at return-to-work — rejected because a notification is sufficient and
  focus stealing is more disruptive than helpful.

## Consequences

- Pomodoro runs continuously until the user stops it or skips a break early.
- Work sessions still log at each completed work boundary.
- Music and tray state follow each automatic phase transition.
- Users must stop the timer explicitly if they do not want the next work block to begin.
