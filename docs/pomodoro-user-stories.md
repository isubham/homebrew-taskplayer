# Pomodoro mode — user stories

Status: historical research and planning notes. Shipped behavior has evolved; see
[`features.md`](features.md) for the authoritative current Pomodoro behavior. In particular,
Pomodoro phase boundaries now start the next break/work phase automatically, superseding older
acceptance criteria below that refer to `awaiting_break`, `awaiting_work`, or manual start clicks.

Source: gap analysis against Pomodoro Technique history, current research (Biwer et al.
2023; Ogut 2025 meta-analysis; MDPI 2025 Flowtime comparison; ADHD-specific literature),
and feature surveys of Tiimo, Forest, Focus Bear, Focusmate, Session, Flow, and Flocus.
Each story below is scoped against the actual current implementation
(`src-tauri/core/src/timer.rs`, `src-tauri/core/src/models.rs`, `src/app/render.js`) —
not a generic wishlist.

Priority/size are a starting proposal, not a commitment — reorder before building.

---

## 1. Long break every N cycles

**Priority: High — size: Medium**

As a Pomodoro user, I want every Nth break (default 4) to be a longer break, so my rest
after a full set of work blocks matches the original technique and gives me real
recovery instead of another identical 5-minute break.

**Why:** This is the single most literal piece of Cirillo's original six-step method
that's currently absent. `SessionConfig` (`models.rs`) only has `work_min`/`break_min` —
there's no cycle count and no separate long-break length anywhere in the model, so the
4th break today is identical to the 1st.

**Acceptance criteria**
- Settings exposes `cycles_before_long_break` (default 4) and `long_break_min` (default
  20, editable 1–60) alongside the existing work/break fields.
- The app tracks completed work cycles since the last long break (resets after a long
  break is taken; needs a decision on whether stopping the timer entirely also resets
  the count, or only a taken long break does).
- When `timer::tick`'s `Tick::ToBreak` fires and the cycle count has reached the
  threshold, the resulting `awaiting_break` state is flagged as a long break (e.g. a
  `long: bool` on `Tick::ToBreak` or a `phase` variant), and `break_min` is substituted
  with `long_break_min` for that one break.
- The break notification and the "Start break" button distinguish long breaks ("Long
  break ☕☕ — 20m" vs "Break ☕ — 5m").
- Existing pomodoro tests in `timer.rs` (`pomodoro_transitions_wait_for_user_input_at_each_boundary`)
  still pass unmodified for the non-long-break path; new tests cover the Nth-cycle case.

**Technical notes:** touches `SessionConfig` (new fields + migration/default in
`db.rs`), `RunState` (new cycle counter field), `timer::tick`'s `ToBreak` arm, and the
`ToBreak` notification/UI branch in `main.rs` + `render.js`.

---

## 2. Interruption / void tracking

**Priority: Medium — size: Medium (schema change)**

As a deep-work user, I want to mark a work block as interrupted when something breaks my
focus, so my history reflects genuinely clean pomodoros versus ones that got derailed,
instead of every logged session looking equally "complete."

**Why:** Cirillo's original rule treats a pomodoro as indivisible — interrupted work
either gets negotiated away or the pomodoro is voided, never silently counted as a full
block. `SessionLog` today is just `{task_id, start, end}` — there's no way to represent
this at all, so a 25-minute block where you got pulled away twice is indistinguishable
from a clean one in the data.

**Acceptance criteria**
- `SessionLog` gains an `interrupted: bool` (or richer `interruption_count: i64`) field,
  with a corresponding SQLite column + migration in `db.rs`.
- While a work block is active, the player UI has a lightweight "flag interruption"
  affordance that doesn't stop the timer — just marks the eventual logged session.
- The Sessions page (`renderSessionsPage` in `render.js`) visually distinguishes
  interrupted sessions (e.g. a small marker), without needing a new dedicated view.
- Existing session-logging call sites (`do_stop_at`, the `ToBreak` tick handler) default
  the new field to `false`/`0` so nothing breaks for un-flagged sessions.

**Technical notes:** this is the one story requiring a DB schema migration — worth
bundling with any other schema changes if several of these ship together, to avoid
multiple migrations in quick succession.

---

## 3. Interval presets with guidance

**Priority: High — size: Small**

As someone who doesn't know what work/break length actually suits me, I want a few
labeled presets next to the manual minute fields, so I can start from a sensible default
instead of guessing — especially since research on the "right" interval is genuinely
split (ADHD literature alone recommends both shorter *and* longer than 25/5 depending on
the source).

**Why:** the Settings copy currently says only "Classic is 25 / 5" next to two blank
number fields. Every science-branded competitor (Tiimo, Focus Bear) either presets
intervals or explains the reasoning; TaskPlayer offers neither.

**Acceptance criteria**
- Three (or more) preset buttons appear above the work/break fields in
  `sessionControlsHtml()`: **Classic** (25/5), **Extended** (50/10), **Ultradian**
  (90/20) — each with a one-line rationale on hover/below (e.g. "Ultradian — matches
  ~90-minute natural attention cycles").
- Clicking a preset fills the existing `workMin`/`breakMin` fields via the current
  `setConfigField` action — fields remain manually editable afterward, presets are just
  a starting point, not a locked mode.
- No backend change required — this is presentation-layer only.

**Technical notes:** frontend-only change in `render.js`; good first story to ship since
it's low-risk and immediately useful.

---

## 4. Distraction blocking during work blocks

**Priority: Low (as a first cut) — size: Large**

As a user trying to protect a work block, I want TaskPlayer to optionally block chosen
distracting apps or sites while a work session is active, so starting a session actually
removes the competing option instead of only starting a clock.

**Why:** this is the one feature nearly every app in the survey (Session, Flow, Focus
Bear) ships and TaskPlayer has no equivalent of at all — it's purely a timer/logger
today, not an environment-shaper.

**Acceptance criteria (first cut — website blocking only, narrower than full app blocking)**
- Settings: a user-editable list of blocked domains.
- Enforcement is active only while `phase == "work"`; lifts automatically on
  `awaiting_break`/`break`/stop.
- Some visible indicator that blocking is active (tray tooltip or in-window badge).

**Technical notes — flag before scoping further:** this is materially bigger than the
other stories. Website blocking on macOS realistically means a local DNS/hosts-file
approach or a system extension with real entitlements; app blocking means Screen Time
APIs, which need their own authorization flow and aren't casually scriptable from a
Tauri Rust core. Recommend treating this as its own design spike rather than a
sprint-sized story — split further before estimating seriously.

---

## 5. Daily goal + streak

**Priority: Medium — size: Medium**

As a user, I want to set a simple daily focus goal (minutes or completed pomodoros) and
see a streak of days I've hit it, so finishing a work day closes a loop and I have a
reason to keep coming back to the app.

**Why:** TaskPlayer already logs everything needed for this (the `sessions` table) but
nothing surfaces it as a daily target — the motivational "did today count" signal that
Flocus's Focus Ring and Forest's tree both lean on is currently absent.

**Acceptance criteria**
- Settings: set a daily goal, either in minutes or completed pomodoro count.
- A small progress indicator (ring, bar, or plain "38 / 60 min today") visible from the
  main window — home view or sessions page.
- A streak counter increments once per calendar day the goal is met, resets to 0 on a
  day it's missed (needs a decision: does the streak check run live, or lazily the next
  time the app computes it — likely the latter, computed from existing session data
  rather than tracked incrementally, to stay resilient to the app not running 24/7).

**Technical notes:** the underlying data already exists (`db.sessions()`); this is
mostly a new derived query + a small amount of new config/state, plus frontend for the
ring/counter. No timer.rs changes needed — orthogonal to the Pomodoro state machine
itself and would work for Open/Target modes too.

---

## 6. Genuine-rest break guidance

**Priority: Low — size: Small (cosmetic)**

As a user on break, I want a short on-screen cue suggesting an actual break — step away,
no screen — rather than silence, so the break has a better chance of being real
recovery instead of me reflexively opening another app.

**Why:** the fatigue/attention research draws a real line between genuine rest (letting
the brain's default-mode network activate) and "fake rest" like scrolling, which keeps
attention networks engaged and doesn't restore anything. Right now the only signal
during a break is that music pauses — reasonable, but implicit.

**Acceptance criteria**
- The `awaiting_break`/`break` UI state shows one short rotating tip (e.g. "Look at
  something 20 feet away," "Stand up and stretch," "Leave the screen") alongside the
  existing "Start break" button.
- Purely additive copy/UI — no state machine or config changes.

**Technical notes:** frontend-only, `render.js`, cheapest story on this list.

---

## 7. Flowtime as a fourth session mode

**Priority: Medium/Large — needs a design decision before sizing** 

As a user who dislikes being cut off mid-flow by a fixed timer, I want a session mode
where I work until I naturally stop, and the break length is automatically scaled to how
long I worked, so my breaks stay proportional without needing a pre-committed interval.

**Why:** the most recent (2025) head-to-head study of self-regulated, Pomodoro, and
Flowtime break-taking found Flowtime produced the slowest fatigue increase of the three
— it's a credible middle ground between the existing fully-open "Open" mode and the
fully-fixed "Pomodoro" mode, not just a Pomodoro variant.

**Acceptance criteria**
- New `mode: "flowtime"` value alongside `open`/`target`/`pomodoro` in `SessionConfig`.
- On manual stop (not a countdown — this mode has no work timer to expire), compute a
  suggested break length as a configurable ratio of elapsed work time (e.g. 1:5 —
  30 minutes worked suggests a 6-minute break).
- Enters an `awaiting_break`-equivalent state showing the suggested break, same
  "Start break" affordance as Pomodoro; user can accept, adjust, or skip straight back
  to work.
- Mode-cycling UI (`cycleMode` in `bootstrap.js`) includes the new mode.

**Technical notes:** the largest story here — needs a parallel state-machine path in
`timer.rs` alongside the existing Pomodoro one, since it's triggered by a stop event
rather than a countdown expiring. Worth a short design pass (what ratio? configurable
per-user or fixed?) before writing code, not a straightforward extension of the existing
`Tick` enum.

---

## Suggested sequencing

Cheapest, highest-confidence wins first: **#3 (presets)** and **#6 (break copy)** are
both frontend-only and low-risk — good first PRs. **#1 (long break)** is the most
canonical gap and a contained backend change — natural second target. **#5 (streak)**
reuses existing data. **#2 (interruption tracking)** and **#7 (Flowtime)** are the two
that deserve a short design conversation before implementation — #2 because it's a
schema migration, #7 because it's a genuinely new state machine, not a variation on the
existing one. **#4 (distraction blocking)** is scoped separately on purpose — it's a
different class of feature (system-level enforcement, not just timer/data logic) and
probably shouldn't be sized alongside the others until there's a clearer answer on
website-only vs. app-blocking and what macOS APIs that actually requires.
