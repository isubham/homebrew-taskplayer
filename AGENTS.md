# TaskPlayer — project notes for Codex

## Working memory (assistant + preferences)

- Address me as **Jarvis** — the user prefers this name for the assistant.
- Responses: concise and direct; minimal formatting; cut words that don't change the meaning.
- **Never use hardcoded strings/values** — always store them centrally (in `src/app/constants.tsx` or similar constants file) and import/use them across the codebase.
- Full/growing record: `memory/preferences.md`.

## Documentation definition of done

- Every shipped user-visible feature or behavior change must update both
  `docs/features.md` (current truth) and the `Unreleased` section of `CHANGELOG.md`.
- Proposed work belongs in a focused specification or roadmap, never in the shipped feature
  catalog. Mark incomplete foundations and known gaps explicitly.
- Create or supersede a record in `docs/decisions/` when a change establishes a durable product
  or architecture rule, is expensive to reverse, or would otherwise be repeatedly debated.
- Keep README concise and link to the feature catalog instead of maintaining a second feature
  list.
- During a release, move `CHANGELOG.md` entries from `Unreleased` into the new dated version;
  leave an empty `Unreleased` section ready for subsequent work.

## Architecture guidelines

- **Component boundaries & size constraint**: Aim to strictly limit React component files to around **150 lines**. Extract massive `useEffect` blocks into custom hooks (e.g., `useTauriSubscriptions`), separate state logic from UI markup, and maintain single responsibility. This reduces cognitive overload, minimizes AI token usage, and drastically improves maintainability.
- **Rules of Hooks**: NEVER call React hooks (`useState`, `useEffect`, `useContext`, custom hooks like `useSessionNow`, etc.) conditionally or after an early return guard (e.g. `if (!data) return null;`). All hooks must be declared unconditionally at the very top level of the component body. Failing to do this causes hard crashes ("Rendered fewer hooks than expected") when state changes.
- **Derived State (Minimize `useState`)**: Never put data in `useState` if it can be calculated from existing state or props during render. For example, if you have an array in state, do not keep a separate state for its length or a filtered version. Compute it locally (using `useMemo` only if it's computationally expensive).
- **Avoid Stale Closures**: Whenever the next state depends on the previous state, always use the updater function form: `setCount(prev => prev + 1)` instead of `setCount(count + 1)`.
- **Event Handlers over Effects**: Prefer placing logic in event handlers (e.g., `onClick`, `onSubmit`) rather than reacting to state changes inside a `useEffect`. Only use `useEffect` for synchronization with external systems (network, DOM APIs, subscriptions) or component lifecycle events.
- **Avoid Barrel Files**: Do not use "barrel files" (e.g., `index.ts` files that re-export everything in a folder). Always use direct, explicit file imports (e.g., `import { Button } from './components/Button'`). This prevents AI agents from accidentally loading massive dependency chains into context, saving thousands of tokens per prompt.
- **Rust shell boundaries**: Read [`docs/rust-module-map.md`](docs/rust-module-map.md) before editing `src-tauri/src`. Keep every Rust shell file below **200 lines after `rustfmt`**, preserve facade modules, and update the map whenever responsibility moves.
- **Icons**: Never use inline SVG strings in React components. Use the `lucide-react` icon library to reduce visual noise.


## Backward compatibility — release constraint

- Follow [`docs/compatibility-policy.md`](docs/compatibility-policy.md) for every SQLite,
  Supabase, sync-wire, RPC, or serialized-model change.
- Supabase supports the current and previous two minor clients. Deploy additive backend
  migrations before releasing a client that needs them.
- Append local migrations and preserve upgrades from every released SQLite schema.
- Do not drop/rename columns or tables, change column types, tighten nullability, remove
  enum-like values, or replace RPC shapes during the support window.
- Add `#[serde(default)]` or an optional/fallback representation for fields absent from old
  payloads. Older writes must preserve fields the older client does not know.
- Run `npm run test:compatibility` for storage or sync changes. A destructive migration requires
  an explicit compatibility review and override marker; the marker alone is not approval.

## ADHD design rules — do not break these

These are hard constraints on this app's design, derived from Russell A. Barkley's *Taking Charge
of Adult ADHD*. Full rationale and book citations: `docs/adhd-design-principles.md`. Check new
features against this list before building them, not after.

1. **Point of performance.** Every reminder, cue, or signal has to live where the behavior actually
   happens — on the task row, in the moment of starting/finishing a session — never only in a
   settings page, a separate report, or anywhere else the user has to go looking for it.

2. **Externalize, don't rely on memory.** Never design a feature that assumes the user will
   remember something (a rule, a past session, an estimate) instead of the app holding and
   surfacing it automatically.

3. **Make time physical.** Time has to be shown, not just implied by a deadline in text — a
   running clock, a filling bar, a countdown. No feature should represent elapsed or remaining
   time as a bare number alone.

4. **Reward small, immediate, and per unit of work.** Never save a reward for a big finish. Jewels
   (or any future reward) pay out per completed task/session, deterministically, shown before the
   user commits — not accumulated toward one large delayed payout.

5. **Keep the reward-check itself short.** A progress or stats surface (Home page, radar, etc.)
   must stay a quick glance. Never let it grow into its own destination with open-ended stats to
   browse — that risks becoming the very distraction the system exists to prevent.

6. **Chunk work, keep deadlines near.** Don't design around large, distant goals with no
   intermediate structure. Prefer session-sized units with a visible, nearby target over big
   undifferentiated blocks of time.

7. **No permanent negative record.** Never build a shame tally — a running scoreboard of missed
   estimates, "against" actions, or failures that accumulates and persists. Impact should fade or
   reset, never stack up as a permanent record held against the user.

8. **Categorization must be a fact, not a decision.** Never make the user deliberate over which
   bucket something belongs to. Filing something away (which list, which context) should be
   something they already know, not a judgment call that stalls them.

9. **No punitive tone.** Copy and visuals must never read as guilt-inducing or judgmental, even
   around a missed estimate, an incomplete task, or a "negative"-tagged action.

## Gamification guidelines — Octalysis / 8 Core Drives

Reference framework: Yu-kai Chou, *Actionable Gamification*. Use this whenever proposing or
evaluating a gamification mechanic (rewards, streaks, badges, progress visuals, social features).
It sits on top of the ADHD design rules above — nothing here should override rule 4, 5, or 7.

**White Hat vs. Black Hat.** Every mechanic falls into one of two buckets:

- **White Hat drives** (Meaning, Accomplishment, Creativity) — feel good, intrinsically
  motivating, no anxiety or urgency involved. Prefer these as the foundation of any feature.
- **Black Hat drives** (Scarcity, Unpredictability, Loss) — highly effective at spiking short-term
  engagement, but operate through anxiety, compulsion, or fear of missing out. Treat these as
  off-limits by default for this app — they conflict directly with ADHD rules 7 and 9 (no shame
  tally, no punitive tone) and risk building compulsive rather than healthy usage patterns.
- Ownership and Social sit in between — usable, but check them against the ADHD rules before
  shipping (e.g., social comparison features must not create a public "failure" record).

**The 8 Core Drives, and how to apply/avoid each here:**

1. **Epic Meaning & Calling** (White Hat) — frame the work as mattering, not just as a checklist.
   E.g., copy that ties a task back to the user's own stated goal, not generic "task completed!"
   messaging.

2. **Development & Accomplishment** (White Hat) — visible skill/progress growth from real effort.
   E.g., jewels or session counts that reflect genuine completed work (ties to ADHD rule 4) —
   never inflate this with participation-only rewards, which cheapens it.

3. **Empowerment of Creativity & Feedback** (White Hat) — let the user act and see immediate
   results. E.g., letting a user customize a session or task view and seeing that choice reflected
   right away, rather than a fixed, non-interactive layout.

4. **Ownership & Possession** (middle) — a personal collection (jewels, streak history) the user
   wants to maintain. Fine to use, but the collection view must stay a quick glance, not a
   browsable destination (ADHD rule 5).

5. **Social Influence & Relatedness** (middle) — mentorship/comparison features. Only use if they
   cannot produce a visible "you're behind/failing" state for any user — that would violate ADHD
   rule 7 (no permanent negative record).

6. **Scarcity & Impatience** (Black Hat — avoid) — e.g., limited-time rewards or "act now or lose
   this" messaging. Do not use; creates urgency/anxiety incompatible with this app's purpose.

7. **Unpredictability & Curiosity** (Black Hat — avoid) — e.g., randomized/variable reward sizes
   (loot-box style). Do not use; jewels must be deterministic per ADHD rule 4, and variable
   rewards are the mechanism behind compulsive, addictive engagement loops.

8. **Loss & Avoidance** (Black Hat — avoid) — e.g., streak-break shaming, "don't lose your
   progress" pressure. Do not use; directly conflicts with ADHD rules 7 and 9.

**Rule of thumb when introducing any new gamification concept:** name which Core Drive(s) it
uses, confirm it's White Hat (or justify the middle-tier exception), and check it against the ADHD
design rules before proposing it.

## ADHD × gamification — hard constraints (non-negotiable)

Why these are stricter than generic Octalysis advice: ADHD brains are more reward-sensitive and
more delay-averse than neurotypical brains (Barkley; Sonuga-Barke), and ADHD is a known risk
factor for problematic/compulsive engagement with games and apps. That means Black Hat mechanics
don't just work on this population the same as anyone else — they work *harder*. A mechanic that's
merely "engaging" for a neurotypical user can be compulsive for an ADHD user. So the bar here is
higher than "is this good gamification," it's "does this exploit reward-sensitivity that this
specific user already struggles to regulate." Any new gamification feature must pass all of these
before it ships:

1. **No variable or randomized rewards, ever.** Reward size/type must be fixed and disclosed
   before the user commits to the task. Variable-ratio reinforcement (loot-box style) is the
   mechanism behind compulsive engagement loops, and ADHD's reward-sensitivity makes it more
   compulsive here, not less. (Reinforces ADHD rule 4 and Core Drive 7 ban.)

2. **No loss-framing, streak-break shaming, or "don't lose your progress" pressure.** ADHD
   frequently co-occurs with rejection-sensitive dysphoria — a broken streak or lost progress can
   land as disproportionate shame, not mild disappointment. (Reinforces ADHD rule 7 and Core
   Drive 8 ban.)

3. **No urgency or scarcity language** — countdown-to-expire rewards, "act now," limited-time
   bonuses. Manufactured urgency compounds with ADHD impulsivity rather than motivating
   healthily. (Core Drive 6 ban.)

4. **Reward surfaces must resolve in a glance, not invite browsing.** If a progress/stats view
   could plausibly hold a user's attention past a few seconds, it has become a new distraction
   loop, not a reward check. (Reinforces ADHD rule 5.)

5. **Every reward must trace to a real completed unit of work** — never to opening the app,
   viewing a screen, or other engagement-only actions. Rewarding engagement instead of output
   trains app-checking, not task-doing. (Reinforces ADHD rule 4 and Core Drive 2's "don't inflate
   with participation-only rewards.")

6. **Litmus test for any new mechanic:** does it work by the user *not knowing* what they'll get,
   or by the user *fearing* what they'll lose? If yes to either, reject or redesign it — regardless
   of how effective it would be at driving engagement. Effective-but-exploitative is a reason to
   reject, not a reason to ship.
