# 0003 — Preserve backward compatibility across storage and sync

- Status: Accepted
- Date: 2026-07-15
- Owners: TaskPlayer
- Related: [`../compatibility-policy.md`](../compatibility-policy.md),
  [`../features.md`](../features.md), [`../../CHANGELOG.md`](../../CHANGELOG.md)

## Context

TaskPlayer stores data in per-device SQLite databases and optionally synchronizes several app
versions through one Supabase schema. Additive planner and life-area fields made it possible for
a newer and older client to touch the same row. Without an explicit contract, a backend change
could reject an older payload, and an old whole-row update could erase fields it does not know.
The original Supabase schema was also configured manually, so a fresh backend could not be
reproduced entirely from migration history.

## Decision

Use additive expand–migrate–contract changes and support the current plus previous two minor
clients against Supabase. Preserve SQLite upgrades from all released versions. Record backend
version/capabilities in `public.app_schema`; a client verifies them before syncing and remains
local-first when the backend is too old. Keep remote wire models column-based and tolerant of
missing/unknown fields.

Make compatibility an automated release gate through historical SQLite fixtures, old payload
deserialization tests, a fresh Supabase migration test, an old-client upsert preservation test,
and a destructive-SQL scanner. Backend migrations ship before dependent clients.

## ADHD and gamification check

This is infrastructure and adds no engagement mechanic. Keeping playback available when sync is
paused preserves point-of-performance behavior and avoids making the user recover from a backend
deployment problem while trying to work. Error copy is factual and non-punitive.

## Alternatives considered

- Require every user to upgrade immediately — rejected because desktop clients can remain open
  or offline and should not lose sync without warning.
- Allow destructive migrations with release notes — rejected because documentation does not
  prevent an older binary from sending incompatible data.
- Version the entire API for every release — rejected as unnecessary overhead while the schema
  remains additive; versioned RPCs remain appropriate when behavior cannot be extended safely.

## Consequences

- Backend deployment precedes each client release that needs a new capability.
- Obsolete columns remain for at least the support window.
- Sync performs one cached backend-contract check per app process.
- A missing migration pauses sync but does not stop local task management or playback.
- Synced-field migrations trigger a one-time field-level remote backfill before normal pushing,
  preserving unrelated local edits while recovering values skipped by an older client cursor.
- Destructive cleanup requires a deliberate reviewed override.
