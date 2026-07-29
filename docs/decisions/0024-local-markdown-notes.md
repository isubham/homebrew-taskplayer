# 0024 — Keep private task notes as local Markdown files

- Status: Accepted
- Date: 2026-07-28
- Owners: TaskPlayer
- Related: [`../local-notes-spec.md`](../local-notes-spec.md), [`../features.md`](../features.md)

## Context

Some task context is too private or device-specific for account sync, but users still need to
read and edit it with ordinary tools. Adding another nullable task field would make the content
part of TaskPlayer's SQLite, backup, snapshot, and Supabase-oriented model boundaries and would
create a recurring risk of accidental upload.

Human-readable paths are useful, but task titles and list locations change and can collide.
External editors can also modify a file while TaskPlayer is open.

## Decision

Local Notes is a device-local filesystem subsystem, not a `Task` model field. One user-selected
root contains Markdown files organized as life area → list → task title. A stable task ID in
frontmatter owns the association; readable paths are presentation and are reconciled after task
or list changes.

TaskPlayer stores only the selected root in a device-local configuration file. Note contents and
paths are absent from SQLite task records, Supabase wire models, diagnostics, and TaskPlayer
backup exports.

Writes are atomic and revision checked. Deletion archives notes before deleting task data.
Symbolic-link traversal and writes outside the selected root are rejected. On Unix, newly managed
files and hierarchy directories default to owner-only permissions.

## ADHD and gamification check

The note editor appears directly on task detail, where the context is needed, and maximize mode
temporarily removes competing task controls. The feature externalizes memory without introducing
rewards, streaks, urgency, punishment, or an open-ended progress destination.

## Alternatives considered

- Synced task text field — simpler CRUD, but contradicts the privacy contract and can be uploaded
  by existing sync and backup paths.
- Local SQLite text column — avoids Supabase only by convention, remains opaque to other editors,
  and is easier to include accidentally in backups or future sync work.
- WYSIWYG document state — friendlier formatting, but may normalize or discard Markdown authored
  by external tools.
- Title-only identity — readable but breaks on rename, movement, and duplicate titles.

## Consequences

- Privacy is enforced by architecture rather than a sync flag.
- Users retain ordinary Markdown files and editor portability.
- Filesystem lifecycle and conflict handling add more complexity than a database text field.
- “No Cloud” cannot control external sync providers chosen by the user and is not an encryption
  claim.
