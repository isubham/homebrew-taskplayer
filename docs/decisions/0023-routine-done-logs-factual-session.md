# 0023 — Routine “Done today” logs a factual session

- Status: Accepted
- Date: 2026-07-28
- Owners: TaskPlayer
- Related: [`../health-life-area-page-spec.md`](../health-life-area-page-spec.md),
  [`0019-stop-closes-session.md`](0019-stop-closes-session.md)

## Context

Some routines are easier to complete away from the timer. Requiring playback adds ceremony at the
point of performance, but a bare checkmark would lose factual time and create a second completion
record beside sessions. Silently treating the scheduled window as actual work would make history
untrustworthy.

## Decision

- A scheduled repeating task may show **Done today** while today's occurrence is unfinished.
- The control opens the existing session editor; it never starts playback.
- Start and end are prefilled from the applicable routine window and remain editable. The user
  must confirm factual times, and future or overlapping ranges remain invalid.
- Confirmation creates the same finished, one-interval session used by other manually recorded
  work. Existing daily completion and reward derivation then applies.
- A timed session and a manually logged session are equivalent evidence for the day. The daily
  deterministic reward pays at most once regardless of session count.
- No streak, missed-day row, or separate routine-completion primitive is stored.

## Consequences

- Session history and tracked duration remain truthful and use one storage/sync path.
- Untimed app interaction stays short while still requiring explicit confirmation.
- Routines without a fixed window use an editable recent-duration fallback.
- Future changes to routine completion must preserve session truth rather than inventing duration.
