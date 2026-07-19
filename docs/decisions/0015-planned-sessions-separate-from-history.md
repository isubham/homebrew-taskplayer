# 0015 — Keep planned sessions separate from work history

- Status: Accepted
- Date: 2026-07-18
- Owners: TaskPlayer
- Related: [Planner calendar specification](../planner-calendar-spec.md),
  [compatibility policy](../compatibility-policy.md)

## Context

TaskPlayer already stores sessions as evidence that work occurred. A calendar also needs future
intent, but overloading session rows with planned/actual states would make totals, rewards, task
completion, sync, and history depend on a new enum-like interpretation.

## Decision

Future one-time-task commitments use a separate `planned_sessions` collection. A planned row has
its own id, task id, start, end, last-write-wins timestamp, and soft-delete tombstone. Starting a
planned block removes the plan and uses the existing timer/session path; recorded sessions remain
actual work only. Repeating occurrences stay derived from task weekly windows rather than being
materialized into planned rows.

## ADHD and gamification check

Separating intent from evidence keeps the timeline factual and prevents an unstarted plan from
becoming permanent failure history. The feature adds no reward, streak, or loss mechanic.

## Alternatives considered

- Add a status to `sessions` — rejected because every existing history and reward calculation would
  need to filter future intent correctly, including supported older clients.
- Materialize repeating occurrences — rejected because it duplicates weekly rules and creates an
  unbounded synchronization surface.
- Keep plans only in frontend storage — rejected because plans are external working memory and
  must survive restart and remain consistent across signed-in devices.

## Consequences

- Planner CRUD and sync are isolated from actual-session behavior.
- Starting a planned block does not require linking or mutating a later recorded session.
- The additive table and capability must be deployed before a client that syncs planned sessions.
