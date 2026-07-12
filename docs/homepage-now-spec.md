# Homepage "Now" section — design doc

Status: proposed, not yet implemented. Scoped against the actual current implementation
(`src/app/render.js`'s `renderHomePage`/`renderDetail`, `src/app/commands.js`,
`src-tauri/core/src/models.rs`, `src-tauri/core/src/db.rs`, `src-tauri/core/src/migrations.rs`,
`src-tauri/src/main.rs`, `src-tauri/src/sync.rs`) — not a generic wishlist. Covers Home page
question 1, "what should I be doing now" — only. Daily recurring tasks (question 2) are explicitly
out of scope; see §7.

Decisions locked in during scoping:
- **A new, minimal `deadline_at` field on `Task`** — no separate "reschedule count" or "snooze"
  field. Avoidance is *derived* at read time from data the app already has (sessions + deadline),
  not tracked as its own stored counter. Matches the precedent set by dropping the old
  multi-area/mana/vitality system in favor of `impact_tier` + `impact_sign` alone (see the comment
  atop `IMPACT_TIERS` in `utils.js`): don't build more machinery than the one idea is worth.
- **Only `medium`/`high` impact tasks are eligible.** "High impact" per the product ask means
  tier ≥ medium; a `low`-tier task never appears here regardless of deadline, and an untagged task
  (no `impactTier`) never appears either — same "weightless until tagged" rule the jewel system
  already uses.
- **Hard cap of 3 cards, and the section can be entirely absent.** No "see all" / no scroll. This
  is a glance, not a queue.

---

## 1. Problem

Today's Home page (`renderHomePage`, `render.js:1807`) answers "what have I been doing" — Life
balance, Jump back in (`recentTasks`, most-recently-played), Recent lists. Nothing answers "what
*should* I do right now." That gap matters specifically because of how ADHD attention works: a
boring-but-important task with a deadline doesn't get more salient as the deadline approaches the
way it does for a neurotypical brain — it stays exactly as unstimulating as ever, right up until
the deadline is an emergency. Barkley's framing (already the basis for `docs/adhd-design-principles.md`)
is that this is steep discounting of delayed/effortful reward, not a planning failure — so the
fix has to be the app surfacing the neglected-but-important task itself, not asking the user to
remember or notice it (ADHD rule 2).

Two things don't exist in the codebase yet and both are needed:
- `Task` has no deadline concept at all (confirmed: no `deadline`/`due` field anywhere in
  `models.rs`, `db.rs`, or the frontend).
- There's no "this task is being avoided" signal anywhere — `recentTasks` only surfaces what *was*
  played, which is the opposite of what's needed here.

## 2. Goals / non-goals

**Goals**
- Add an optional deadline to a task, set from the existing task-detail modal, same
  immediate-commit contract as `estimateMin`/`impactTier`.
- Surface up to 3 tasks on Home that are impact-tagged (medium/high), have a deadline, and show
  little/no recent engagement relative to how close that deadline is.
- Make the deadline physically visible (rule 3), not just a date string.
- Zero new user decisions beyond "optionally set a deadline" — no manual "mark as avoided," no
  category picker (rule 8).

**Non-goals (this iteration)**
- Daily recurring/habit tasks (Home question 2) — separate spec.
- Push notifications / OS-level reminders for an approaching deadline.
- A dedicated "all upcoming deadlines" page. If that's wanted later it's a new, separate surface —
  it must not creep into this one, which stays capped at 3 (rule 5).
- Tracking *how many times* a task was rescheduled/deferred as a stored, ever-growing counter —
  see the locked decision above. That shape is exactly the "permanent negative record" rule 7
  bans; avoidance here is a live, recomputed read, not an accumulating tally.

## 3. Current state (for reference)

- `Task` (`models.rs`) already has `impact_tier: Option<String>` (`"low"|"medium"|"high"`) and
  `impact_sign: i64`, both optional/weightless until set. No deadline field.
- `IMPACT_TIERS` (`utils.js`) gives each tier a fixed weight (low=1, medium=2, high=4) and
  `jewelPayout(task)` derives a deterministic jewel amount from it — already exactly the
  "disclosed, fixed reward" shape the gamification rules in `CLAUDE.md` require. Nothing new
  needed here; the "Now" cards just reuse `jewelPayout`.
- `renderHomePage` (`render.js:1807`) builds Home from `recentTasks(6)`, `recentLists(3)`, and
  `lifeBalanceScores()`, each a pure function reading `state.S`, and assembles static HTML —
  no separate data-fetch step, so a new section is just another pure function feeding the same
  template.
- `renderDetail` (`render.js:769`) is the task-detail modal: Notes → Depth → Impact
  (`renderImpactSection`) → List → Sessions, every field committing immediately via a
  `data-action` → `commands.js` dispatch → `invoke(...)` → `apply(snapshot)` round trip. E.g.
  `setEstimateInline` (`commands.js:266`) → `invoke("set_estimate", { id, minutes })` →
  `set_estimate` Tauri command (`main.rs:812`) → `Db::set_estimate` (`db.rs:185`).
- Schema changes go through `crate::migrations::MIGRATIONS` (`migrations.rs`), each entry an
  idempotent `add_column(conn, "tasks", ..., ...)` call — `impact_tier`'s own migration
  (`migrations.rs:110`) is the direct precedent to follow.
- Cross-device sync (`sync.rs`) mirrors `Task` into its own remote struct with an explicit field
  list (`impact_tier` appears at `sync.rs:121/140/157`) that pushes/pulls via the existing 60s
  loop described in `docs/session-sync-design.md`. A new `Task` field needs the same three-line
  addition there, plus a Supabase column, to actually sync — otherwise it's local-only (same
  interim state `impact_sign` was in before its own remote wiring, per that field's comment in
  `models.rs`).

## 4. Design

### 4.1 Data model addition

`Task` gains one field:

```rust
/// Optional deadline (ms epoch, date granularity — always midnight local
/// time of the chosen day). None = no deadline. Independent of estimateMin
/// (a deadline is *when*, an estimate is *how long*) and of impactTier (a
/// task can have either without the other) — only tasks with BOTH a
/// deadline and impactTier >= medium are eligible for the Home page's
/// "Now" section (see render.js's nowCandidates()).
#[serde(default)]
pub deadline_at: Option<i64>,
```

Migration (`migrations.rs`, new entry after the existing `impact_tier` one):
```rust
add_column(conn, "tasks", "deadline_at", "INTEGER")?;
```

Setter, mirroring `set_estimate` (`db.rs:185`) exactly:
```rust
pub fn set_deadline(&self, id: &str, deadline_at: Option<i64>) -> rusqlite::Result<()> {
    self.conn.execute(
        "UPDATE tasks SET deadline_at=?1, updated_at=?2 WHERE id=?3",
        params![deadline_at, now_ms(), id],
    )
}
```

Tauri command, mirroring `set_estimate` (`main.rs:812`):
```rust
#[tauri::command]
fn set_deadline(app: AppHandle, state: State<AppState>, id: String, deadline_at: Option<i64>) -> Snapshot {
    { let db = state.db.lock().unwrap(); let _ = db.set_deadline(&id, deadline_at); }
    push(&app);
    build_snapshot(state.inner())
}
```
(registered in the same `tauri::generate_handler!` list as `set_estimate`)

Frontend command (`commands.js`), mirroring `setEstimateInline`:
```js
async function setDeadlineInline(id, dateStr) {
  const ms = dateStr ? new Date(dateStr + "T00:00:00").getTime() : null;
  apply(await invoke("set_deadline", { id, deadlineAt: ms }));
}
```

Sync (`sync.rs`): add `deadline_at: Option<i64>` to the remote task struct alongside
`impact_tier`, plus a matching nullable `bigint` column on Supabase's `tasks` table (same pattern
`docs/session-sync-design.md` §5 used for `run_state`).

### 4.2 Setting a deadline (UI)

New "Deadline" block in `renderDetail` (`render.js:769`), placed after Impact and before List —
right where Impact already sits, since both are "how much does this matter" context before
"where does it live." A single `<input type="date">`, empty by default, committing on change via
`setDeadlineInline` — same immediate-commit contract as every other field in this modal, no Save
button. Clearing the date clears the deadline (passes `null`). No required field, no forced
choice — matches rule 8 (a fact you already know, e.g. "this is due Friday," never a deliberation
the app is forcing).

### 4.3 "Now" candidate scoring

New pure function in `render.js`, same shape as `recentTasks`/`lifeBalanceScores` — reads
`state.S`, returns a plain array, no side effects:

```js
function nowCandidates(limit = 3) {
  const now = Date.now();
  const run = state.S.run;
  const liveTaskId = run.activeTaskId && run.phase === "work" && run.runningStart ? run.activeTaskId : null;

  return state.S.tasks
    .filter((t) => !t.completedAt && t.id !== liveTaskId)
    .filter((t) => t.deadlineAt && (t.impactTier === "medium" || t.impactTier === "high"))
    .map((t) => {
      const daysLeft = (t.deadlineAt - now) / 86400000;
      const lastTouch = lastSessionEnd(t.id); // null if never played
      const daysSinceTouch = lastTouch ? (now - lastTouch) / 86400000 : Infinity;
      // Urgency: 0 (weeks out) to 1 (today/overdue), overdue clamped at 1 —
      // not allowed to grow past 1, so an overdue task doesn't out-rank
      // everything else more and more the longer it's ignored (that
      // unbounded growth is exactly the loss/urgency shape the ADHD x
      // gamification rules in CLAUDE.md ban).
      const urgency = Math.max(0, Math.min(1, 1 - daysLeft / 7));
      // Neglect: has this task been left alone while its deadline closes
      // in? A task touched today scores low here even with a near
      // deadline (it's already in motion, doesn't need resurfacing).
      const neglect = Math.max(0, Math.min(1, daysSinceTouch / Math.max(daysLeft, 1)));
      const impactWeight = IMPACT_TIERS[t.impactTier].weight; // 2 or 4
      return { task: t, score: impactWeight * (0.6 * urgency + 0.4 * neglect) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.task);
}
```

Deliberately simple and inspectable — three named, boundable factors (impact weight, urgency,
neglect), no hidden ML/heuristic tuning. That matters for rule 8 as much as the UI does: even
though the *selection* is automatic, the *reason* a card is showing should be explainable in one
sentence if the user ever wonders ("close deadline, hasn't been touched, tagged high-impact") —
not a score nobody could reconstruct.

### 4.4 UI placement and rendering

Checked against `CLAUDE.md`'s ADHD design rules and the ADHD×gamification hard constraints:

- **Point of performance (rule 1):** new `<section class="home-section home-now">` placed
  *first* in `home-body`, above Life balance — the top of the page is the point of performance
  for "what do I do next," and this is the one section on Home actually answering that question.
- **Make time physical (rule 3):** each card shows a small horizontal bar (reuse the visual
  language of `buildCapacityBar`, `utils.js:158`, but filled by *time elapsed toward the
  deadline* rather than session time toward an estimate) alongside the plain-text date — never
  date text alone.
- **Reward small/immediate/deterministic (rule 4 + gamification hard constraint 1):** each card
  shows `jewelPayout(task)`'s existing dots-and-number, unchanged — no new reward mechanism, just
  reusing the one that's already deterministic and disclosed.
- **Quick glance, not a destination (rule 5):** hard cap of 3, no "view all," no pagination. If
  more than 3 tasks qualify, the other candidates simply don't show — there is deliberately no
  affordance to go looking for them from here.
- **No punitive tone / no urgency framing (rule 9 + gamification hard constraints 2 & 3):** copy
  is flat and factual — "Due Friday" / "Due today" / "Due 2 days ago" — never "Overdue!",
  never a red flashing state, never "you're behind." Visual urgency is limited to the deadline
  bar's own fill color shifting from the app's neutral gray toward amber as `daysLeft` shrinks —
  no red, no pulsing/animation. One-tap play button, same `▶`/`⏸` component already used on
  Jump-back-in cards (`render.js:1823`) — starting the session *is* the point, so the action has
  to be right there, not behind a navigation.
- **Categorization is a fact, not a decision (rule 8):** the user never labels a task "being
  avoided." The section either shows something or it doesn't; there's no control to dismiss,
  snooze, or otherwise manage it, which would reintroduce exactly the kind of ongoing
  decision-making this section exists to remove.

Empty state, matching the existing convention used by Life balance / Jump back in
(`class="home-empty"`) rather than hiding the whole section abruptly: `"Nothing urgent right
now."` — calm, not congratulatory (congratulating "no urgent tasks" would be a hollow,
participation-flavored reward, the thing rule 2/Core Drive 2 already warns against).

### 4.5 Card content

```
[list-color dot]  Task name
[deadline bar — neutral→amber fill]  Due Friday
[jewel dots]  +4                                    [▶]
```

No list name, no album, no estimate — those all belong to the task-detail modal or the list view,
not this glance. The only new information here is *why this card exists*: it's due soon, and
tagged as mattering.

## 5. Schema change (Supabase)

```sql
alter table tasks add column deadline_at bigint;
```
No default, nullable, no RLS/trigger change needed — it rides the existing `tasks` row's
`lww_guard` and RLS policy untouched, same as every other plain column on that table.

## 6. Edge cases / open questions

- **Task has a deadline but no impact tier, or `low` tier.** Never appears in "Now" — deadline
  alone isn't "high impact" per the locked decision in §0. It still shows its deadline wherever
  deadlines are rendered elsewhere (task row / detail modal), just not on Home.
- **Deadline already passed.** Still eligible — urgency clamps at 1 rather than climbing further,
  so an old overdue task doesn't perpetually dominate all 3 slots over a newly-due one. If it's
  completed, `!t.completedAt` drops it immediately regardless of how overdue it was — no lingering
  "you missed this" card once it's actually done.
- **Task is the one currently playing.** Excluded from candidates (`t.id !== liveTaskId`) — if
  you're already doing it, resurfacing it as "start this" is redundant; `recentTasks`/the player
  bar already show it.
- **Every qualifying task was touched today.** All neglect scores near 0, so ranking falls back
  to urgency × impact weight alone — still a sensible ordering (nearest deadline, highest impact
  first), not a broken state.
- **User sets a deadline in the past by mistake.** No validation blocking it (rule 9 — a date
  picker rejecting input reads as scolding); it just immediately becomes maximally urgent, which
  is the correct behavior for "I mis-set this to yesterday, fix it" as much as for a genuinely
  missed date.

## 7. Explicitly out of scope for this iteration

- Home page question 2 (daily recurring/must-do-every-day tasks) — a different surface with
  different mechanics (habit-style, not deadline-scored); separate spec once this one is settled.
- Any notification/OS-alert tied to an approaching deadline.
- A "view all upcoming deadlines" page.
- Per-task snooze/dismiss controls on the Now card (see rule 8 reasoning in §4.4).

## 8. Suggested sequencing

1. `deadline_at` field + migration + `set_deadline` command (backend-only, testable like
   `set_estimate` already is).
2. Deadline input in `renderDetail`'s modal, wired to `setDeadlineInline` — deadline becomes
   settable and visible in the one place tasks are already edited, no Home change yet.
3. `nowCandidates()` as a standalone pure function, unit-testable against a fake `state.S` the
   same way `recentTasks`/`lifeBalanceScores` already are.
4. Home page section + card rendering + deadline bar component.
5. Sync wiring (`sync.rs` field + Supabase column) — can land independently/later; until then the
   field just behaves as local-only, same interim state `impact_sign` was in.
