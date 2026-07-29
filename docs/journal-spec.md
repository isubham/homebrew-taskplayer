# Local Journal

Status: Implemented  
Last reviewed: 2026-07-29  
Related decision: [`0025-shared-local-storage-journal.md`](decisions/0025-shared-local-storage-journal.md)

## Product promise

Journal stores ordinary Markdown and pasted images beneath the same user-selected root as Local
Notes. TaskPlayer does not put entry text, mood, paths, filenames, or image bytes in SQLite,
account sync, diagnostics, telemetry, or TaskPlayer backup exports.

## Workflow

1. Journal appears as a top-level destination beside Planner.
2. Without an available root, the shared setup/reconnect state opens Settings → Local Storage.
3. The list shows newest entries first with mood, date, creation time, first-line title, and
   excerpt. Multiple entries can share one local date.
4. New Entry uses the current local date and opens a blank text field. The first non-empty line
   becomes the title without adding a separate title field.
5. Pasted supported images appear in the draft but are not written until the entry is saved.
6. Save opens one compact dialog with optional sad/okay/happy mood and optional **Related to**
   references. The picker searches existing lists, albums, and tasks; neither choice is required.
7. The read view renders local assets, displays the full path, supports editing, and opens the
   Markdown file in its default external editor.
8. Editing a saved entry offers a confirmed delete action. Deletion removes it from Journal and
   moves the Markdown file and its pasted images together beneath `_Archived/Journal`.

## Format and hierarchy

```text
Selected root/
  Journal/
    2026-07-29 - Website launch concern - a1b2c3.md
    _assets/
      a1b2c3d4e5/
        5bd1c4a6f719.png
```

```md
---
taskplayer_journal_format: 2
taskplayer_journal_id: a1b2c3d4e5
taskplayer_journal_date: 2026-07-29
taskplayer_journal_created_at: 1785322200000
taskplayer_journal_mood: okay
taskplayer_journal_related: [{"kind":"list","id":"f09e8d","label":"Website launch"}]
---

Website launch concern

Today felt steady.
```

Mood and relationships are optional. Relationship references stay in local frontmatter and keep
the linked entity's stable ID plus a readable label. Unknown mood values degrade to no mood.
Empty new drafts do not create files. Version-one date-only entries remain readable and gain a
stable ID and title-based filename when next saved.

## Filesystem and rendering safety

- Dates must be valid ISO calendar dates.
- Journal paths remain beneath the canonical configured root and managed parents cannot be
  symbolic links.
- Text and image writes use owner-readable temporary files, flush, and rename atomically.
- Saves include the SHA-256 revision they started from and reject stale writes.
- Deletes require the same starting revision and preserve the entry and its images together in a
  recovery archive rather than erasing them permanently.
- Images are entry-scoped, limited to 10 MB, and validated as PNG, JPEG, GIF, or WebP by MIME type
  and signature.
- Only referenced assets beneath `Journal/_assets` are loaded. Raw HTML and remote images are
  ignored.

## Deliberate exclusions

Journal has no separate title field, date picker, formatting toolbar, media column, mood
analytics, streaks, rewards, prompts, or permanent negative record. The shared device-local Vim
preference applies without adding editor chrome. Continuous filesystem watching and automatic
migration between selected roots are not included.
