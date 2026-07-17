# Backward compatibility policy

Last reviewed: 2026-07-15

TaskPlayer is local-first and may have several desktop versions connected to the same Supabase
account. A release must not corrupt newer fields, make a supported older client unable to sync,
or make an existing SQLite database unable to open.

## Support contract

- Local SQLite databases upgrade from every released schema version.
- Supabase supports the current client and the previous two minor client releases.
- A newer desktop client may pause sync when its required backend migration has not been applied;
  local tasks, sessions, and playback must remain available.
- Schema migrations are deployed and verified before the client that depends on them is released.
- Removing an obsolete backend field waits until no supported client reads or writes it.

## Required change pattern

Backend changes use expand–migrate–contract:

1. **Expand:** add nullable columns, columns with safe defaults, new tables, new capabilities, or
   versioned RPCs. Do not change existing field behavior.
2. **Migrate:** release clients that understand both old and new shapes, write both forms when a
   rename is necessary, and backfill existing rows.
3. **Contract:** remove the old shape only after its client support window has expired. Contract
   migrations require explicit review and the compatibility override marker.

Normal migrations must not drop or rename tables/columns, change column types, or add `NOT NULL`
to an existing column. Do not remove enum-like string values or change an existing RPC response
in place. Introduce a versioned replacement instead.

## Supabase contract

`public.app_schema` is a read-only singleton containing the backend schema version, minimum
supported client, and named capabilities. The desktop app verifies its required capabilities
before the first sync in each process. An absent, old, or incomplete contract pauses sync with a
recoverable error instead of sending a payload the backend may not understand.

Old clients do not know about `app_schema` and continue using their existing tables. Their
upserts must update only fields present in their wire model so newer fields remain untouched.

Current capabilities:

- `planner_windows_v1`
- `life_area_priorities_v1`
- `run_state_v1`
- `music_favorites_v1`

## Serialization rules

- Additive Rust fields that may be absent in old JSON use `#[serde(default)]` or `Option<T>`.
- Unknown remote fields remain accepted.
- Existing serialized names and types are stable during the support window.
- New enum-like values require an unknown/fallback behavior before they are written remotely.
- Whole-object replacement is not used when an older client could erase fields it does not know.
- A migration that adds synced fields must schedule a durable, field-level remote backfill before
  the next push. The marker is cleared only after success so old pull cursors cannot hide the new
  remote values permanently.

## Local SQLite rules

- Append migrations; never reorder or edit a released migration.
- Keep each migration transactional, deterministic, and safe against existing user data.
- Add and backfill before making a value required.
- Never reuse a retired column for a different meaning.
- Opening an old fixture and running every migration is a required CI test.

## Automated release gates

The compatibility workflow runs on pull requests and `main`:

- rejects destructive Supabase migration statements;
- upgrades a historical SQLite database and verifies its data;
- verifies current models accept old Supabase/JSON payloads;
- creates a fresh Supabase database from migration history;
- simulates old-client list/task upserts and verifies new planner fields survive;
- runs the current Rust test suites and formatting check.

Run the local portion with:

```sh
npm run test:compatibility
```

Run Supabase contract tests against the local Supabase stack with:

```sh
npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor
npx supabase test db
```

An exceptional destructive migration must include:

```sql
-- compatibility-approved: destructive
```

The marker is not permission by itself. Its review must confirm that the support window has
expired, data is backed up or migrated, and the corresponding client code has already shipped.
