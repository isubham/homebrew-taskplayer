# 0020 — Store albums as first-class entities

- Status: Accepted
- Date: 2026-07-27
- Related: [`0003-backward-compatible-storage-and-sync.md`](0003-backward-compatible-storage-and-sync.md), [`../features.md`](../features.md), [`../../CHANGELOG.md`](../../CHANGELOG.md)

## Context

Albums were previously inferred from the free-form `album` text on tasks. That made an album
disappear as soon as its last task moved or was deleted, and made it impossible to create an empty
album before deciding which tasks belonged in it.

## Decision

- Albums are list-owned rows with stable identity, order, update time, and soft-delete state.
- SQLite and Supabase each store and sync albums independently from tasks.
- List detail renders stored albums even when they contain no tasks.
- Existing task album names are backfilled into album rows during migration.
- The legacy task `album` text remains additive and supported during the compatibility window so
  older clients can continue grouping and updating tasks. Current writes ensure a matching album
  entity exists.
- Moving a task to another list clears its album because albums belong to one list.
- Backups include album rows; older backups without them recreate rows from task album names.

## ADHD and gamification check

This removes a memory-dependent prerequisite: the album can be created at the list’s point of
performance before its tasks are known. It adds no reward, urgency, loss, streak, or browsing loop.

## Consequences

- Empty albums persist locally, in backups, and across devices.
- Supported older clients do not erase album entities because their task upserts do not touch the
  separate table.
- Album names remain the temporary task-to-album compatibility link. Replacing that link with an
  album ID can happen only through a later expand–migrate–contract change.
