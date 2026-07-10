# TaskPlayer — project notes for Claude

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
