# 0022 — Goals organize existing work

- Status: Accepted
- Date: 2026-07-28
- Owners: TaskPlayer
- Related: [`../health-life-area-page-spec.md`](../health-life-area-page-spec.md),
  [`0021-adaptive-life-area-pages.md`](0021-adaptive-life-area-pages.md)

## Context

A Health outcome such as “wake up rested” is not a task, routine, list, or recorded session. Using
one of those primitives would either create false completion semantics or force extra hierarchy.
At the same time, duplicating executable work inside a Goal would fragment playback, history, and
rewards.

## Decision

- Goal is a first-class, synced outcome with a life area, title, optional context, active/completed/
  archived lifecycle, optional current-focus flag, and optional next linked task.
- Goal-to-task links reference existing tasks. The link supports both one-time tasks and routines;
  it never copies or owns their execution data.
- Only one locally edited Goal can be current focus within a life area.
- Goal progress is derived from linked one-time task completion. Routines remain visible as linked
  practices without a streak, failure count, or terminal contribution.
- Goals never issue jewels or any other reward. Rewards remain attached to real completed units of
  task/session work.
- Storage, wire tables, snapshots, and backups are additive. Deleted task links are tombstoned and
  a deleted next task is cleared without deleting the Goal.

## Consequences

- A Goal can be created before the user knows every action and refined without changing tasks.
- Tasks can contribute to multiple outcomes without duplicating history.
- Other life-area pages can adopt Goal modules without inheriting Health's full layout.
- Goal progress is intentionally modest; milestones, metrics, and appointments remain separate
  product decisions rather than fields added preemptively.
