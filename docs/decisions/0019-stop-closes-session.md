# 0019 — Stop closes the current session

- Status: Accepted
- Date: 2026-07-26
- Owners: TaskPlayer
- Supersedes: [0018](0018-logical-sessions-group-focus-intervals.md)
- Related: [Feature catalog](../features.md), [Compatibility policy](../compatibility-policy.md),
  [ADHD design principles](../adhd-design-principles.md)

## Context

Requiring a separate Finish action after Stop allowed a forgotten logical session to remain open
for hours or days. Its derived break then spanned calendar days, distorted session history, and
required the user to remember an extra closure rule after they had already indicated that work
stopped. This conflicts with the requirement to externalize state instead of relying on memory.

The additive logical-session fields remain part of released storage and sync contracts, so the
interaction can be simplified without removing or rewriting those fields.

## Decision

- Start creates a logical session and Stop closes it. Starting the task later creates a new
  logical-session id.
- Task-row, player, tray, keyboard, and confirmed-system-sleep stop paths use the same closure
  behavior.
- A locally owned session still active at its next local midnight closes at that boundary. The
  timer remains stopped rather than silently recording the following day.
- Pomodoro's automatic focus and break phases may remain grouped while the timer continues.
  Manually stopping either phase closes the group.
- `logical_session_id`, `session_finished_at`, and the additive run-state fields remain supported
  for storage, sync, backups, and older clients. Existing grouped history remains readable.
- The explicit `finish_session` command remains as a compatibility alias for older clients and
  recovery paths, but ordinary controls no longer require a separate Finish step.

## Consequences

- One Start → Stop interaction equals one user-visible session.
- Ordinary history cannot acquire a multi-day trailing break because the user forgot Finish.
- Short manual interruptions become separate sessions. This is preferable to an indefinitely open
  container and restores the simpler, visible interaction contract.
- Existing multi-interval sessions are preserved rather than destructively migrated.
