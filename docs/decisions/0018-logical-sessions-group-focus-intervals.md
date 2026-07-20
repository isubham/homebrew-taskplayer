# 0018 — Logical sessions group focus intervals and derive breaks

- Status: Accepted
- Date: 2026-07-19
- Owners: TaskPlayer
- Related: [Feature catalog](../features.md), [Compatibility policy](../compatibility-policy.md),
  [ADHD design principles](../adhd-design-principles.md)

## Context

TaskPlayer historically treated every pause as the end of a session because each row in
`sessions` represented one continuous start/end range. That inflated session counts, restarted
Pomodoro progress, and made an ordinary interruption look like several completed work units.

The product needs one user-visible session to survive pauses in Open, Target, and Pomodoro modes,
while retaining factual focus boundaries and showing the breaks that occurred inside it. This must
remain compatible with existing SQLite databases, Supabase rows, backups, and supported older
clients.

## Decision

- A row in `sessions` remains one factual focus interval. Additive nullable
  `logical_session_id` and `session_finished_at` fields group intervals and mark explicit closure.
- `RunState` carries the open logical-session id, accumulated session focus, and accumulated focus
  in the current Pomodoro work block.
- Pause stores the live focus interval and keeps the logical session open. Resume appends another
  interval to the same id. Finish stores any live interval, stamps the group's finish time, and
  clears its runtime identity.
- Breaks are derived from gaps between ordered focus intervals and the trailing gap before Finish
  or the current time. Breaks are not stored as mutable rows and never enter tracked-focus totals.
- Starting a different task cannot silently repurpose an open session. The UI asks to finish it,
  then starts a new id after confirmation.
- Counts, history entries, and session deletion operate on the logical group. Duration, estimates,
  and life balance continue to use actual focus time. Repeating rewards require completed
  logical-session focus, so a pause never pays as if it were Finish. Reassigning one editable
  interval reassigns every interval in that logical session so one session cannot span tasks.
- Legacy rows without a group id are interpreted as standalone finished sessions. Manually
  recorded work creates the same one-interval finished shape.
- Sync changes are additive and advertised as `logical_sessions_v1`; old wire payloads default the
  new fields without erasing newer remote values.
- If a device finishes a remotely owned group before any of its focus rows have arrived locally, a
  zero-duration closure carrier preserves the group id and finish time through the existing
  sessions sync channel. Current clients exclude that carrier from focus time and visuals.

## Alternatives considered

- Add a separate session/event table — rejected because the existing interval rows already contain
  the factual work record and another entity would add joins, sync ordering, and migration surface.
- Store pause/play timestamps as a JSON array on one row — rejected because every pause would
  rewrite a growing blob, merge conflicts would be opaque, and older clients could overwrite the
  entire history.
- Keep pause equal to finish and group only in the UI — rejected because counts, Pomodoro progress,
  cross-device state, and explicit user intent would remain wrong.

## Consequences

- The implementation adds two nullable session columns and three backward-compatible run-state
  fields, but no new table.
- A paused open session has a break that grows until resume or Finish, making time physical without
  asking the user to classify interruptions.
- Home shows only the current session's compact breakdown, while Planner and Insights provide
  factual context without creating a failure or shame tally.
- Editing interval boundaries can change a derived break, which is expected because the break is a
  consequence of the factual focus ranges rather than independent user-entered data.
