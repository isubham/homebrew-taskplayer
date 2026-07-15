# Changelog

All notable user-visible changes to TaskPlayer are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions use
[Semantic Versioning](https://semver.org/). Add new work under **Unreleased**; during a release,
move those entries into a dated version section.

## Unreleased

### Added

- App-wide zoom controls using `⌘+` and `⌘−`, limited to 80–130%, with `⌘0` resetting to 100%.
- Insights now starts with quick-glance totals for today and all-time tracked time, completed
  tasks, lists, today's jewels, and lifetime net jewels.

### Changed

- The bottom player's workflow icon now changes timer mode in place instead of opening the
  Settings workflow panel; detailed timing controls remain in Settings.
- The desktop window now opens at 1280×840 with a 1280×800 minimum, keeping the full workspace
  layout intact instead of compressing it into unsupported small-window states.
- One-time and Daily choices now use a smaller, compact selector in task detail.
- Personal Growth has been folded into Health & Wellbeing, leaving five clearer life areas.
  Existing and legacy-synced Personal Growth lists are normalized to Health without losing their
  tasks, sessions, direction, or planning data.
- List detail now uses a playlist-style header that brings list identity, life-area direction,
  availability, recorded progress, and a top-right Edit List icon together at the point of
  planning, with Add Task on a dedicated row directly below.
  Redundant list-wide Play controls and sidebar edit pencils have been removed.
- The six-metric aggregate summary now lives on Insights only and has been removed from Home,
  keeping Home focused on immediate task selection.
- Recent lists have been removed from Home because the sidebar already provides list navigation.
- Needs Attention has moved out of Home: qualifying lists now receive one calm, unnumbered
  muted-blue dot at the far right of their sidebar row, and the corresponding task rows show the
  same factual deadline cue in place without warning colors or urgency-based color changes.
- The active list's playing equalizer now moves with a subtle staggered rhythm, and the active task
  row uses the same animation instead of a static musical note. Both remain static when reduced
  motion is enabled.
- Now Playing is now a dedicated focus page opened from the current task identity in the bottom
  player. It keeps the familiar list panel for orientation, gives editable task context the
  primary workspace, shows separate mode-accurate current-session and overall-task progress, and
  returns to the exact prior page and scroll position. Playback stays in the global player instead
  of being duplicated on the page. Its current-session clock uses a calm tabular readout alongside
  the physical progress bar, avoiding attention-grabbing per-second animation. The task title is
  quieter and task editing remains in task detail instead of being duplicated on the focus page.
- Daily Jam now uses a responsive two-column life-area card grid ordered by planning priority,
  matching the app's existing flat list, folder, row, and hover-play styling while adding per-area
  progress, today's fixed-time cues, and compact inline expansion after four tasks.
- Core navigation and task-list surfaces now update in place through isolated `lit-html`
  components, reducing focus/interaction resets during timer and state refreshes.
- Daily Jam cards now reuse the same task-row component as list pages, keeping playback, session
  status, progress, jewels, active state, and row actions consistent across both surfaces.

### Fixed

- Lit task pages now render inside a dedicated component host, preventing Home, Insights, or
  Settings markup from surviving or replacing a sidebar navigation result.

## 0.8.1 - 2026-07-15

### Changed

- GitHub release pages now publish structured Added, Changed, and Fixed notes directly from the
  matching `CHANGELOG.md` version section.

### Fixed

- Upgrading from a client that ignored newer planner columns now performs a one-time remote-first
  field backfill before pushing, restoring list availability, task type, daily windows, session
  limits, and life-area priority without replacing unrelated local edits.

## 0.8.0 - 2026-07-15

### Added

- Daily and one-time task types with separate list sections and appropriate task fields.
- Multiple weekly availability windows for lists.
- Multiple fixed-time windows for daily tasks.
- Overnight time windows with an automatic “Next day” cue.
- Minimum and maximum session-size fields for one-time tasks.
- Draggable life-area planning priority stored locally and synced through Supabase.
- Reactive life-area reorder feedback through the central toast.
- Schedule notifications for approaching/ending daily and list windows.
- Five recently played incomplete tasks in the tray menu.
- Note/check tray artwork with white idle, green work, and yellow break states.
- Backward-compatibility release gates for historical SQLite upgrades, old sync payloads,
  Supabase capability checks, fresh backend migrations, and destructive-schema detection.

### Changed

- Jump Back In now appears immediately after Home summary stats and before all other sections.
- Pomodoro now starts breaks and subsequent work blocks automatically at their boundaries;
  notifications report each transition without requiring manual Start Break/Start Work clicks.
- Create Task now uses the same two-column detail layout as Edit Task.
- Task terminology now uses “Effort” and “Repeat.”
- Daily tasks no longer show estimates or deadlines.
- Daily rows show today’s session information instead of lifetime progress.
- Task lists group Daily tasks above One-time tasks with larger blue labels.
- List/life-area expand and collapse motion is slower and more Finder-like.
- List delete now aligns with Save and Cancel in the dialog footer.

### Fixed

- Concurrent timer, sync, and UI refresh work no longer risks deadlocking and freezing the app.
- Cross-device session state recovers from transient access-token failures without discarding a
  valid refresh token.
- Overnight daily routines no longer require splitting one occurrence into two artificial rows.

## Historical releases

- Release history through app version 0.7.4 has not been reconstructed. Git tags and GitHub
  Releases remain the source for older release details.
- Maintained version sections begin with the next release cut from **Unreleased**.
