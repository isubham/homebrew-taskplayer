# Planner calendar specification

- Status: Implemented manual and automatic planning
- Date: 2026-07-19
- Related: [ADHD design principles](adhd-design-principles.md),
  [decision 0015](decisions/0015-planned-sessions-separate-from-history.md),
  [decision 0016](decisions/0016-automatic-planning-requires-preview.md)

## Goal

Make available time, commitments, deadlines, plans, and completed work visible on one bounded
timeline. The Planner is for deciding and starting the next work block, not for browsing an
open-ended productivity record.

## Scope

- Today and bounded seven-day period views only. Planner shows only the recent seven days of
  actual-session context; detailed historical analysis belongs in Insights.
- List availability appears as quiet candidate-time background.
- Repeating-task windows appear as fixed scheduled occurrences.
- One-time-task deadlines appear as date boundaries, never as scheduled work.
- Accepted one-time-task plans are stored as explicit planned sessions.
- Recorded work sessions appear as factual history and can be selected to edit their recorded
  date and times. Live work remains read-only; historical days can also add a completed session.
- Planned blocks can be created, edited, removed, and started directly.
- Automatic allocation returns a bounded preview and writes nothing until explicit acceptance.
- External calendar providers are not part of this slice.

## Calendar semantics

| Source | Meaning | Treatment |
|---|---|---|
| List availability | Work from this list may fit here | Background band; never called booked |
| Repeating window | A routine belongs at this time | Fixed block derived from task data |
| Deadline | Work must be finished by this date | Day marker; never given invented duration |
| Planned session | User intends to work on a one-time task | Persisted, editable future block |
| Recorded session | Work actually happened | Past block; select to edit its factual details |
| Active run | Work is happening now | Live block and current-time line |

Availability and repeating-time bands use the wider calendar lane. Planned, recorded, and live
sessions are offset within that lane so the allocation remains visible as background context: 30%
in Today and 20% in the narrower seven-day view. The live session retains stronger active styling.

Planned sessions use absolute epoch timestamps after local date/time entry is resolved. Weekly
availability and repeating windows remain local-wall-clock rules. Overnight occurrences retain
their selected start weekday and continue into the following day.

## Interaction rules

- `Plan session` opens a focused form with list, filtered task, date, start, and end. Existing plans
  and task-row launches preselect their owning list; new calendar plans prefer a non-empty list
  whose availability contains the selected range, then fall back to the first eligible list.
- Past days offer `Record session`; Today offers both Record and Plan because it contains elapsed
  and future time. Future days only offer Plan.
- Record Session asks for the factual list first, then limits the task selector to that list so
  large task libraries do not become one overwhelming menu.
- Its initial list is the first ordered, non-empty list whose saved availability fully contains
  the selected range; when none matches, it falls back calmly to the first non-empty list.
- Dragging across empty timeline space selects a 30-minute-snapped range and then opens the same
  confirmation form: a past range records actual work and a future range creates a plan. A range
  crossing the current-time line is clamped to that line based on where the drag began. Each drag
  creates a fresh form state; it never inherits list, task, or time choices from the prior drag.
- Dragging is an optional shortcut. Header actions and editable date/time fields remain available,
  and existing actual-history blocks are never moved by an accidental drag.
- Hovering an availability, repeating, recorded/live, or planned block shows a compact title link
  and exact start–end time. The link opens the owning list or task; background hover targets still
  allow range dragging through availability and repeating bands.
- Selecting a recorded-work block opens the existing Edit Session form with its current list and
  task preselected. The list-first selector can reassign the record without presenting every task
  at once. Active work remains read-only until it becomes a completed session.
- Recording or editing completed work blocks actual overlap with another recorded or active work
  session and names the conflicting task and time inline. Rust rechecks the current local database
  and active run immediately before saving, closing stale-modal races; sessions may meet at the
  same boundary. Cross-device reconciliation before both writes are locally visible remains the
  explicitly tracked follow-up in [`session-sync-design.md`](session-sync-design.md#9-upcoming-release-todo--recorded-session-collision-reconciliation).
- Editing uses the same form so planning is not dependent on drag precision.
- Starting a planned session removes that future plan and starts the normal task timer.
- Completing or deleting a task removes its future plans.
- A past unstarted plan is not shown as failure history or counted anywhere.
- Collisions and outside-availability placement are allowed but described factually at the point
  of editing; this slice does not block user intent.
- List availability remains candidate time: overlap with another list is named inline as factual
  context and does not block saving. Overlapping rows within one list are blocked as ambiguous.
- Repeating-task windows are fixed commitments: overlap within the same task or with another
  repeating task is shown inline with the task name and blocks saving until the time is changed.
- One-time-task rows surface the next plan and open the focused planner form at the point of
  performance; task detail provides the same action. Home/Daily Jam surfaces the nearest future
  block, while the calendar remains the source for editing and starting it.

## Automatic allocation

- Inputs are remaining estimates after actual and future planned time, list availability,
  deadlines, task minimum/maximum session sizes, repeating commitments, existing plans,
  life-area priority, current time, local IANA time zone, and the seven-day horizon.
- Weekly local-wall-clock availability expands into concrete intervals, including overnight and
  week-boundary ranges. DST gaps and repeated local times resolve deterministically.
- Repeating commitments and existing planned sessions are global occupied time. The allocator
  ranks eligible unfinished one-time tasks by deadline, life-area priority, task order, and stable
  task id, then fills the earliest opening in 30-minute-aligned, valid session-sized blocks.
- Suggestions and factual unscheduled remainders are transient. Preview displays a physical
  capacity bar and bounded session list. Existing plans count against the bar only where they
  intersect usable availability; acceptance atomically creates ordinary planned-session rows only
  when the underlying preview is still current.
- Completed or deleted tasks cannot receive suggestions and remove their future plans through the
  existing lifecycle path. Past plans never become a missed-work record.

## ADHD and gamification check

- The timeline externalizes working memory and makes time physical.
- Drag selection turns duration into a visible block before commitment while the confirmation
  form prevents imprecise pointer input from silently changing history.
- Direct Start actions keep help at the point of performance.
- The automatic preview externalizes scheduling decisions but keeps acceptance with the user.
- Seven days bounds the planning horizon and keeps deadlines near.
- There are no rewards, streaks, missed-block counts, scarcity, loss framing, or red failure
  states. This is not a gamification mechanic.

## Definition of done

- Existing availability, routines, deadlines, actual sessions, and the live run render correctly.
- Manual planned sessions survive restart and sync using additive, tombstoned storage.
- Old backups remain importable; new backups preserve planned sessions.
- Old SQLite schemas upgrade without losing data, and supported older clients cannot erase plans.
- Planner components preserve project size boundaries and all copy/layout constants are central.
- Pure planner tests cover overnight/week boundaries, local timezone and DST behavior, deadline
  cutoffs, collision subtraction, valid chunking, and deterministic ranking.
