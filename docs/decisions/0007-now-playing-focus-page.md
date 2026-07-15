# 0007: Make Now Playing a temporary focus page

- Status: Accepted
- Date: 2026-07-15

## Context

The persistent Now Playing rail kept the current task visible but permanently reduced the task
workspace. Playback controls and live timing already exist in the bottom player. The remaining
high-value Now Playing information is the task's working context and physical progress. The list
panel remains useful as stable spatial orientation across every main page.

For an ADHD-focused tool, the active-task surface should reduce competing choices, externalize
where the user left off, and show time at the point of performance. It should not become a second
stats destination or duplicate controls.

## Decision

Now Playing is a dedicated page opened by clicking the current task identity in the persistent
bottom player. It retains the list sidebar and provides:

- a large, directly editable task-context field;
- current-session progress calculated from the active mode;
- overall task progress, limited to today for Daily tasks.

Open mode shows elapsed time without a fabricated target. Target mode compares the current work
segment with `targetMin`. Pomodoro compares work, short-break, and long-break segments with their
respective configured durations. The live session clock uses a static tabular readout alongside a
mode-appropriate progress bar or open-session ruler, making time visible without adding per-second motion. Playback
remains in the global player. Back navigation restores the previous route and scroll position.

## Consequences

- The familiar list hierarchy preserves orientation and navigation while the working surface stays
  scoped to the active task.
- Now Playing consumes no permanent horizontal space.
- Users explicitly enter and leave focus context instead of managing a rail's open state.
- The page stays a glanceable working surface: notes and two progress summaries, not session
  history or expandable analytics.

## Alternatives considered

- Keep the persistent rail and make it wider. Rejected because it permanently compresses the
  workspace and duplicates information already available in the player and focus page.
- Show Now Playing in a modal. Rejected because task context is a working surface, not a brief
  interruption, and modal behavior would compete with the persistent player.
- Duplicate playback controls on the page. Rejected because the bottom player already provides
  them at a stable point of performance.
