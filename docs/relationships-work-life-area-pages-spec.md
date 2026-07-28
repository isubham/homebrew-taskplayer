# Relationships and Work life-area pages

Status: Shipped.

## Purpose

Apply the adaptive life-area rule without forcing Health's composition onto areas with different
handling needs. Both pages reuse lists, albums, tasks, repeating schedules, planned sessions, and
recorded sessions.

## Relationships

Relationships uses the shared positions:

1. Top-left **Next connection** shows the active relationship task, otherwise the nearest planned
   one. It is removed from the sections below to avoid duplication.
2. Top-right **People & circles** keeps collection navigation visible without requiring it before
   action.
3. Main-left **Reach out** shows the remaining supportive unfinished one-time actions.
4. Below it, **Regular care** shows remaining repeating touchpoints scheduled for today, including factual
   **Done today** session logging.
5. Right-side **Coming up** externalizes planned sessions and deadlines within the next seven days.

Lists remain flexible collections rather than becoming a new Person primitive. A list may represent
one person, a household, a friend group, or another relationship context the user already knows.
Against-tagged tasks remain in their lists but are not promoted on the page.

## Career / Work

Work uses the same positions while keeping hierarchy prominent:

1. Top-left **Current work** shows the active task, otherwise the nearest planned task.
2. Top-right **Projects & responsibilities** shows Work lists, open-action count, album/group count,
   up to two group names, and derived one-time-action progress.
3. Main-left **Next actions** exposes remaining supportive unfinished work without flattening or
   replacing projects.
4. Below it, **Work routines** shows remaining repeating work scheduled today.
5. Right-side **Schedule** shows planned sessions and deadlines within the next seven days.

Lists remain the project/responsibility level and albums remain their internal grouping level.
The page summarizes that hierarchy; selecting a project opens the existing full list page.

## Shared behavior

- Task rows preserve playback, planning, completion, progress, session counts, and disclosed
  deterministic rewards.
- Add actions choose the first list in the selected area; Add Routine also preselects repeating
  cadence.
- Sections show bounded initial sets with a factual count and Show all control.
- Every tailored page follows the same scan rule: top-left is what matters now, top-right is
  structure, the left column is executable work, and the right column is time/context.
- When columns stack, executable actions and routines remain above organizational structure:
  spotlight, execution, structure, then schedule/context.
- No relationship score, contact-neglect warning, work productivity score, streak, missed-day
  record, urgency copy, or navigation reward is introduced.

## Deferred

- A distinct Contact primitive, pending evidence that lists cannot support real relationship
  workflows.
- Work-specific portfolio dependencies or project states beyond existing lists and albums.
