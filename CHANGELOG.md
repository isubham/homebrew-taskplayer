# Changelog

All notable user-visible changes to TaskPlayer are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions use
[Semantic Versioning](https://semver.org/). Add new work under **Unreleased**; during a release,
move those entries into a dated version section.

## Unreleased

### Added

### Changed

### Fixed

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
