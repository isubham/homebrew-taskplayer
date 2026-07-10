# ADHD design north stars

Source: Russell A. Barkley, *Taking Charge of Adult ADHD* (Guilford Press, 2011) — specifically
Chapters 7–10 (the self-control/executive-function model) and Chapters 16–23 (the "8 Rules for
Everyday Success"). Extracted and distilled for TaskPlayer's design, not a general summary of the
book.

These aren't feature requests. They're the underlying reasons some of TaskPlayer's design
decisions have held up (and a check against the ones we haven't made yet).

---

## The core diagnosis, in one line

> "ADHD is a disorder of performance — of doing what you know rather than knowing what to do."
> (Ch. 10)

Barkley is explicit that adults with ADHD are rarely missing information or intelligence. What's
missing is the bridge between knowing and doing, at the exact moment doing is required. This is
the single idea everything below traces back to. It's also the reason an app in this category
should never drift toward being an *education* tool (explainers, insight dashboards, "here's what
you should do") — that targets the wrong gap. The gap is at the point of performance, not at the
point of knowledge.

---

## 1. Help only counts if it shows up at the point of performance

> "Assistance with the time, timing, and timeliness of behavior is critical... The farther away
> in space and time a treatment is from this point, the less likely it is to help you." (Ch. 10)

A reminder in a journal you don't open, a rule you memorized last week, a stats page you'd have to
go looking for — none of these work, because the deficit isn't a lack of knowing, it's a lack of
*doing, right then*. Anything meant to change behavior has to be physically present at the exact
place and moment the behavior happens.

**For TaskPlayer:** this is the argument for keeping signal on the task row itself (the jewel dot,
the capacity bar, the depth tag) rather than in a separate report. It's also a reason to be
suspicious of any feature that requires a deliberate detour — a settings toggle, a second page —
to see something that should influence a decision happening right now.

## 2. Externalize working memory — this is not a nice-to-have, it's the whole mechanism

> "Externalize information that is usually held in the mind... Stop trying to use mental
> information so much." (Rule 4 / Ch. 10)
>
> "A journal is invaluable: it's your external working memory." (Rule 4)

Weak working memory (both the "mind's eye" and the "mind's voice") is named as one of the four
core executive-function deficits. Barkley's fix isn't "try to remember better" — it's "stop
relying on memory at all; put it outside yourself instead."

**For TaskPlayer:** this is the actual justification for the app existing at all, not just a
feature among features. Session history, the estimate/capacity bar, task notes ("Lyrics") — every
one of these is doing real cognitive work by moving something out of the user's head and onto the
screen, permanently and reliably.

## 3. Make time physical

> "ADHD makes you concentrate mainly on the moment, taking your focus away from the signals and
> internal sense that time is passing. Use kitchen timers, clocks... that can break time down by
> the hour and issue alarms." (Ch. 10)

Time blindness means the passage of time has to be made *visible*, not just implied by a deadline
sitting somewhere in the future.

**For TaskPlayer:** validates the live timer, the capacity bar (fill level, not just a number), and
Pomodoro-style forced breaks. Any future feature that only shows a deadline as text, with no
visual sense of time actually elapsing, is weaker than one that shows a bar filling up.

## 4. Small, frequent, immediate rewards — never a single big one at the end

> "Self-control depends on a preference for larger delayed rewards over smaller, immediate ones...
> ADHD... leaves even adults picking the smaller immediate outcomes." (Ch. 8)
>
> "Give yourself brief little rewards for getting your small quotas done... brick by brick." (Rule 6)

This is delay-discounting stated plainly: waiting for one large reward doesn't work, so the
reward structure has to be redesigned around many small ones, paid immediately per chunk of work,
not saved up for the end.

**For TaskPlayer:** directly validates the jewel payout being tied to *each task's* completion,
shown before the user commits, rather than some larger end-of-week total. It also means we were
right to resist a design where impact only "pays out" once a bigger goal is hit.

## 5. Don't let the reward become its own distraction

> "Caution: Going on the Internet to check one thing like a sports score can lead to looking up 67
> things. This is why knowing your own ADHD is so important: this reward may not be the right one
> for you!" (Ch. 10)

Barkley flags this explicitly — a self-chosen reward-check can itself spiral into the very
distraction the system was trying to prevent.

**For TaskPlayer:** this is a real argument for keeping any "check your progress" surface (the
Home page, the life-balance radar) a quick glance, not a destination with its own tabs and stats
to get lost in. It's part of why the earlier mana/vitality/rank layer was cut — not just because
it was complex to build, but because a rich stats dashboard is exactly the kind of rewarding,
open-ended thing this caution is about.

## 6. Break work into chunks small enough that the deadline never feels distant

> "If a project has to be done before the end of the day, break it into one-hour or, better yet,
> half-hour chunks... Five at a time is not overwhelming, even for someone with ADHD, but 30 can
> be." (Rule 6)

A goal that's far away in time might as well not exist, motivationally. The fix isn't willpower,
it's shrinking the unit of work until its deadline is close enough to feel real.

**For TaskPlayer:** validates session-based tracking over big undifferentiated task blocks, and
the existing estimate/capacity-bar pattern of showing progress against a nearby, visible target
rather than a distant one.

## 7. Feel the future, don't just plan it

> "Ask yourself point blank, 'What will it feel like when I get this done?'... Visualize it →
> Verbalize it → Feel it." (Rule 5)

Barkley is specific that logical, "it's the right thing to do" motivation is weak for ADHD — the
thing that actually pulls someone through boring, effortful work is imagining the *feeling* of
having finished, not the abstract merit of finishing.

**For TaskPlayer:** the task notes field ("Lyrics") is currently framed as "the goal, a few notes,
links" — worth treating it as a legitimate place to prompt for how completion will feel, not just
what the task is. A small copy nudge, not a new feature.

## 8. No shame, no permanent record of failure

> "You've owned the mistake... apologized and made no excuses... promised to try to do better next
> time. Do those things and you will keep your self-esteem." (Rule 8)

The whole tone of the book treats ADHD conduct as neurological, not a character flaw — and Rule 8
exists specifically to head off the self-blame spiral that comes from dwelling on past failures.

**For TaskPlayer:** validates the earlier decision against any permanent negative tally ("dark
jewels") in favor of something that fades rather than accumulates. It's also a standing check on
copy and visuals anywhere in the app that touches a missed estimate, an incomplete task, or a
"negative" tagged action — none of it should read as a scoreboard of shame.

## 9. Filing something away should be a fact, not a decision

Implicit throughout Ch. 9's account of the planning/problem-solving deficit — Barkley's own
example is someone who re-does her filing system every couple of years and "gets lost in all the
paper" trying to invent categories. Ambiguous categorization is exactly the kind of small,
effortful decision that stalls out when the planning/problem-solving executive function is weak.

**For TaskPlayer:** this is the strongest argument for the context-over-domain reframe we've been
discussing (lists as who/where instead of abstract life-areas) — "which context am I in right now"
is a fact you already know, while "which life domain does this belong to" is a judgment call. Every
place the app currently asks the user to classify something is worth asking whether it's asking a
fact or demanding a decision.

## 10. Accountability to another person is a legitimate, doubled motivator

> "Making yourself accountable brings in the internal motivator of emotions too... This strategy
> doubles your external motivators." (Rule 6)

Not just a nice social feature — Barkley treats telling someone else your goal and reporting back
as a distinct, additive lever on top of self-directed rewards.

**For TaskPlayer:** nothing to build today, but worth keeping in mind if the app ever grows a
sharing/accountability surface (a shared list, a "tell someone" prompt) — the book treats this as
mechanistically different from (and additive to) solo tracking, not just a social nice-to-have.

---

## The one-sentence versions, for a sticky note

1. Help has to appear at the moment and place the behavior happens, or it doesn't count.
2. Externalize everything — memory, rules, time — rather than expecting it to be held in the head.
3. Make time visible, not just implied.
4. Reward small and often, immediately, never a single delayed payout.
5. Keep the reward-check itself short — don't let it become its own rabbit hole.
6. Chunk work until the next deadline is always close.
7. Prompt for the *feeling* of finishing, not just the plan.
8. Never let the app keep a permanent scoreboard of failure.
9. Never make the user deliberate over which bucket something goes in.
10. Accountability to another person is a real, separate lever — not just decoration.
