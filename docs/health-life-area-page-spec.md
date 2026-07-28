# Health life-area page

Status: Increment 2 shipped.

## Purpose

Give Health & Wellbeing one point-of-performance page for supportive actions, today's routines,
nearby commitments, and its existing collections. The page reduces navigation without replacing
the task, list, planner, or session models.

## Information architecture

The page uses the shared adaptive-area spatial grammar:

1. Top-left spotlight: Current focus — one explicitly chosen active Goal and its next linked task.
2. Top-right structure: Goals — active and completed outcomes with derived linked-action progress.
3. Main left: Next actions — supportive, unfinished one-time tasks.
4. Below actions: Routines — supportive repeating tasks scheduled today, including calm “Done
   today” feedback.
5. Right context: Upcoming — planned sessions and deadlines within the next seven days, followed
   by Plans & collections — every Health-tagged list, with its next action and physical one-time-task
   completion bar when applicable.

The first three actions/routines are visible initially. A factual count and Show all control reveal
larger sets without adding another page.

## Selection rules

- Health membership comes from the owning list's `lifeArea`.
- A task is supportive when neither its own impact nor its owning list is tagged against Health.
- Against-tagged tasks remain visible in their normal list and are never deleted or reclassified.
- Next actions rank an active task first, then the earliest planned block, deadline, and stored
  task order.
- Routines include only occurrences scheduled for the current local day. Incomplete occurrences
  precede completed ones; no missed occurrence is stored.
- Upcoming items include future planned sessions and deadlines during the next seven days.

## Actions

- Add Goal opens a compact outcome editor. A Goal may link existing Health tasks and routines,
  choose one linked task as its next action, become the area's sole current focus, complete, or
  archive.
- Goal progress is derived from terminally completed linked one-time tasks. Repeating work is
  shown as a factual linked-routine count and never becomes a streak or missed-day history.
- Task rows retain direct start/pause, completion, planning, progress, reward preview, and detail.
- An unfinished routine scheduled today offers **Done today** beside its physical time status.
  This opens the normal session form with the applicable routine window prefilled; confirming
  saves factual history without starting playback.
- Add Task opens the existing task form with the first Health list preselected.
- Add Routine also preselects repeating cadence.
- Add Collection opens the existing list form with Health preselected.
- If Health has neither collections nor Goals, the page offers Add Goal and Add Collection. Goals
  can exist before work is linked; tasks still require an owning list.

## Navigation

- Selecting a fixed life-area name/icon opens its page.
- Selecting its chevron only expands or collapses sidebar lists.
- Selecting a collection opens its existing list-detail page.
- Back and forward history preserve the active life-area key.
- Other fixed areas use a generic collection overview until they gain a tailored composition.

## Responsive behavior

- Wide windows align spotlight/structure and execution/context in two columns.
- Medium and narrow windows preserve point-of-performance order: spotlight, actions/routines,
  structure, then upcoming/collections.
- Narrow layouts become one column and progressively hide the Sessions and then Progress table
  columns while preserving task names and direct actions.

## ADHD and gamification constraints

- Immediate actions remain above organizational material.
- Time and completion use existing physical progress surfaces.
- No health score, streak, missed-day history, overdue shame, or automatic “neglected” judgment.
- Goal creation, focus, progress, completion, and archive never pay rewards. Only completed real
  tasks and qualifying routine sessions retain their existing deterministic reward. A manually
  confirmed routine session is the same real daily unit and cannot pay twice that day.

## Deferred work

- Standalone appointments distinct from planned focus sessions.
- Standalone reference notes.
- Tailored layouts for Finances and Recreation.
