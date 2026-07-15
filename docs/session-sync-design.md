# Cross-device live session sync — design doc

Status: implemented. This document preserves the original design; the authoritative current
behavior and limitations are in [`features.md`](features.md). Scoped against the implementation
(`src-tauri/src/sync.rs`, `src-tauri/core/src/db.rs`, `src-tauri/core/src/models.rs`,
`src-tauri/core/src/timer.rs`, `src-tauri/src/main.rs`) — not a generic wishlist.

Decisions locked in during scoping:
- **Single active session per account, Spotify-style** — starting a session on one device
  is authoritative; the other device's session is superseded, not run in parallel.
- **Reuse the existing 60s sync cadence** — no new realtime infrastructure. A few seconds
  to a couple minutes of lag before another device notices is acceptable.

---

## 1. Problem

Today `RunState` (whether a task is playing, which one, work-vs-break phase, elapsed
timing) lives only in local SQLite (`Db::get_run`/`set_run`, a JSON blob under the `meta`
table). It never reaches Supabase. Only *finished* segments (`Session { start, end }`)
sync, via the existing `lists`/`tasks`/`sessions` push-pull loop in `sync.rs`.

So today, starting a task on a laptop and later opening the app on a desktop shows no
trace that anything is running elsewhere — no awareness, and no way to pick up or hand
off a live session the way Spotify Connect shows "Playing on [device]" and lets you take
over.

## 2. Goals / non-goals

**Goals**
- Any signed-in device can see whether a session is currently active on another of the
  user's devices, and which task/phase it's on.
- Pressing play on a task on one device becomes the new authoritative session; the
  previous device's session is superseded within one sync cycle.
- No time gets silently lost — a superseded device still logs the work segment it ran.
- Fits the existing sync loop and LWW (`updated_at`) pattern. No new background thread,
  no websocket/Realtime channel.

**Non-goals (this iteration)**
- Sub-few-second "instant" handoff — explicitly out of scope per the latency decision
  above.
- Running two genuinely concurrent sessions across devices (e.g. tracking two different
  tasks at once from two machines). The account has one live session, period.
- Remote control (pausing/stopping *another* device's session without physically taking
  over locally). Out of scope for v1 — see §7.

## 3. Current state (for reference)

- `sync.rs` pushes/pulls three tables — `lists`, `tasks`, `sessions` — every 60s
  (`main.rs`'s `60s background loop`). Each row carries `updated_at`; a Postgres
  `lww_guard` trigger silently keeps whichever `updated_at` is greater on conflicting
  upserts, so plain `upsert(...)` calls are safe.
- `Db::dirty_since(cursor)` / `Db::get_push_cursor()`/`set_push_cursor()` — push only
  sends rows changed since the last push, then unconditionally advances the cursor to
  `now_ms()` regardless of what was actually dirty.
- `Db::upsert_from_remote(...)` — applies pulled rows locally via the same
  `WHERE excluded.updated_at > x.updated_at` guard SQLite-side.
- `RunState` (`models.rs`) has no `updated_at` and no device identity at all today.
- `timer.rs` is a pure state machine (`play`, `stop`, `tick`, `start_break`,
  `skip_break`) — no I/O, fully unit-tested. `main.rs`'s 1s background loop calls
  `timer::tick` every second and drives notifications/menu-bar/session-logging off the
  result.

## 4. Design

### 4.1 Data model additions

- A `device_id`, generated once on first launch (same `new_id()` helper already used for
  other ids) and stored in local `meta` — stable for the life of the install.
- A best-effort `device_name` (OS hostname, e.g. via the `hostname`/`gethostname` crate),
  used only for display ("Playing on MacBook Pro"). Falls back to something generic if
  unavailable — never blocks the feature.
- `RunState` gains:
  - `device_id: Option<String>` — whose session this is.
  - `updated_at: i64` — bumped whenever *this* device's own `play`/`stop`/`start_break`/
    `skip_break`/phase-transition produces a new `RunState`. Exactly mirrors how
    `Task`/`TaskList` already get touched on local edits.

  Both fields default to `None`/`0` via `#[serde(default)]`, so existing locally-saved
  `RunState` JSON keeps deserializing (same pattern already used for `last_task_id`,
  `cycles_completed`, etc. in `models.rs`).

### 4.2 Sync mechanics — reusing the existing loop

Treat `run_state` as a fourth synced entity in `sync.rs`, but shaped as a **singleton row
keyed by `user_id`**, not a growing table like `lists`/`tasks`/`sessions`. That shape is
what gives "only one active session per account" for free — there's structurally nowhere
for a second concurrent session to live. A play on device B overwrites device A's row via
ordinary LWW; no bespoke conflict logic needed.

- `push()`: include the local run-state row only if its `updated_at` is newer than the
  push cursor — same `dirty_since` mechanism already used for the other three tables.
- `pull()`: fetch the one row for the account; if its `updated_at` is newer than the
  locally-known one, apply it via the same `upsert_from_remote`-style write.
- **No echo-loop special-casing required.** `push()` already advances `push_cursor` to
  `now_ms()` every cycle regardless of what was sent. A row just pulled carries a
  timestamp from the past (stamped by whichever device wrote it), so it's already below
  the cursor and won't look dirty on the next push — the same property that already
  makes the existing three-table sync safe against re-pushing pulled rows. Confirmed by
  reading `push()`/`pull()` in `sync.rs` — this isn't a new mechanism, just a fourth
  table riding the one that exists.

### 4.3 Ownership — gating the local timer FSM

The 1s tick loop and pomodoro FSM (`main.rs` + `timer::tick`) must only *drive* a
`RunState` when `device_id` matches this device's own id (or is unset — legacy/
never-synced state). If a pull brings back a row with a different `device_id`:

- Treat it as a **read-only mirror**. Compute elapsed/remaining time for display by
  diffing `running_start`/`break_start` against the wall clock — but never call
  `timer::tick` against it, never fire the break/work sound notification, never log a
  `Session` for it. That machinery belongs solely to the device actually driving the
  session; running it on a second device would double-log completed sessions and
  double-fire notifications.
- The local device's *own* player stays fully interactive underneath — the mirror is
  informational, not a lock. Pressing play on a task here is exactly what triggers
  takeover (§4.4).

### 4.4 Takeover semantics

Pressing play locally always wins **immediately and locally** — no round trip, no
"asking permission" from the other device. Two distinct cases, both in `do_play`
(`main.rs`):

**Continuing the same task, still mid-flight** (mirrored session is in `work` or
`break` phase, and the task pressed is the one already active) — treated as
Spotify's "play here": the new `RunState` keeps the *original* `running_start`/
`break_start` unchanged, only `device_id`/`device_name`/`updated_at` change. The live
clock, the target/pomodoro countdown, and cycle progress all continue exactly where
they were instead of resetting to 0:00 — switching laptops mid-session doesn't cost you
the progress already made. First implementation reset the clock on every takeover
(cross-device propagation delay was mistaken for the cause — it isn't; realtime sync
wouldn't have fixed this, since the reset happens the instant `play` is pressed, before
any round trip); this is the corrected behavior.

**Anything else** (different task, or the mirrored session isn't actively counting down)
— unchanged from before: `as_local_baseline` sanitizes the foreign state to idle first,
so `timer::play()` starts a genuinely fresh segment and never fabricates a log entry for
work that happened elsewhere.

The **losing device** only finds out on its own next pull (per the accepted latency).
When it notices its previously-own `device_id` has been replaced by a newer row from
someone else, `reconcile_run_after_sync` (`main.rs`) checks which of the two takeover
cases happened:

- **Same-segment continuation** (new remote row has the same task/phase/`running_start`/
  `break_start`, just a different `device_id`) — the new owner now holds the *original*
  start time and is responsible for logging the whole segment, start to finish, whenever
  it actually ends. The losing device logs nothing here; doing so would double-count the
  overlap between its own partial log and the new owner's eventual full one.
- **Anything else** (task changed, or the old segment genuinely didn't carry over) — log
  whatever had been running locally, from its last known `running_start` up to the moment
  of discovery, as a completed `Session`, so the time isn't silently dropped.

Either way, the losing device then switches that task to read-only mirror mode per §4.3.
The end time of a discovery-time safety log is necessarily approximate (bounded by the
pull cadence, i.e. within the accepted 60–120s window) — a known imprecision, not a bug
to chase further given the latency decision already made. The trade-off on the
continuation path: if the new owner's device crashes or is force-quit before it ever
logs the segment, that time is lost with no safety net — the same durability the app
already has against a hard crash on a single device, not a new risk introduced here.

### 4.5 UI placement (checked against `CLAUDE.md`'s ADHD design rules)

- **Point of performance (rule 1):** the "playing elsewhere" cue belongs on the player
  bar / task row itself, where the local player already lives — not a Settings toggle or
  a separate page. This is also where a "take over" action (press play) naturally lives.
- **Make time physical (rule 3):** the mirror shows a live running clock computed from
  the synced `running_start`/phase, ticking client-side — not a static "someone is
  working" label.
- **No shame tally (rule 7) / no punitive tone (rule 9):** the mirror is purely
  informational ("Playing on MacBook Pro — 12:34"). No framing around the other device
  "still running" as something gone wrong, no accumulating record of takeovers.

## 5. Schema change (Supabase)

```sql
create table run_state (
  user_id           uuid primary key references auth.users(id),
  device_id         text not null,
  device_name       text,
  active_task_id    text,
  running_start     bigint,
  phase             text,
  break_start       bigint,
  last_task_id      text,
  cycles_completed  bigint not null default 0,
  long_break        boolean not null default false,
  updated_at        bigint not null,
  deleted_at        bigint
);
-- same lww_guard trigger + RLS policy pattern already applied to lists/tasks/sessions.
```

`user_id` as the primary key (rather than a generated `id`) is what enforces "one row per
account" at the schema level — there's no query pattern that could accidentally create a
second live session for the same user.

## 6. Edge cases / open questions

- **Both devices offline / never sync.** Nothing changes locally — each keeps running its
  own session until a successful sync tells it otherwise. Fails open, not closed, matching
  the app's existing offline-tolerant design (see the `PULL_REWIND_MS` comment in
  `sync.rs` for the precedent).
- **Signed out on one device.** No `access_token` means no push/pull at all for that
  device (same as today for the other three tables) — its local session just runs
  untouched by any of this until it signs back in.
- **Clock skew across devices.** `updated_at` is stamped using each device's own clock, no
  server-side trigger sets it on arrival — identical assumption to the existing three
  tables, not a new risk introduced by this feature.
- **First device signs in with legacy local-only `RunState` (no `device_id`).** Treated
  as this device's own (per §4.1's default), so it just becomes the initial owner on next
  push — no migration/backfill script needed.

## 7. Explicitly out of scope for this iteration

- Realtime push (Supabase Realtime / websockets) for sub-few-second handoff — revisit only
  if the 60s cadence proves genuinely annoying in practice, not preemptively.
- Remote control of another device's session (pause/stop it without taking over locally).
- Showing session history/awareness for more than one other "currently active" device at
  a time — the account has one live session; past-device history is already covered by
  the existing `sessions` table and Sessions page.

## 8. Suggested sequencing

1. `RunState`/`models.rs` fields + local `device_id`/`device_name` generation — no sync
   yet, just plumbing. Low risk, testable in isolation like the rest of `timer.rs`.
2. Supabase migration (`run_state` table + trigger + RLS) and the `sync.rs` fourth-entity
   wiring (push/pull, no UI yet) — mirrors the existing three-table pattern closely enough
   that this should be a small diff.
3. Ownership gating in the 1s tick loop (`main.rs`) — the part that actually prevents
   double-notifications/double-logging once two devices can both see the same session.
4. Player-bar UI for the read-only mirror + live clock.

Steps 1–3 are backend-only and independently testable against `timer.rs`'s existing unit
test style before any UI work starts.
