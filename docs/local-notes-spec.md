# Local Notes (No Cloud)

Status: Implemented  
Last reviewed: 2026-07-28  
Related decision: [`0024-local-markdown-notes.md`](decisions/0024-local-markdown-notes.md)

## Product promise

Local Notes gives each task an optional Markdown document stored beneath one directory selected
by the user. TaskPlayer reads and writes the files locally and never places their contents,
absolute paths, previews, or filenames in SQLite task records, account sync payloads, telemetry,
diagnostics, or TaskPlayer backup exports.

“No Cloud” describes TaskPlayer's behavior. A user-selected directory may still be uploaded by
iCloud Drive, Dropbox, OneDrive, a backup tool, or another program. The Settings copy states this
explicitly. The files are not encrypted by TaskPlayer and inherit the device and filesystem's
security.

## User workflow

1. Settings → Local Storage opens the native directory picker shared by Local Notes and Journal.
   The same section can enable device-local Vim keybindings for the Markdown editor.
2. Task detail and the compact Now Playing page show Local Notes separately from synced Task
   content.
3. Typing creates the task's file lazily and autosaves it atomically.
4. Write and Preview modes operate on the Markdown body; TaskPlayer metadata stays hidden. The
   editor intentionally has no formatting toolbar.
5. The maximize control hides the task header, other fields, sessions, and footer until restored.
6. Open externally creates an empty managed file when necessary and opens it in the default editor.
7. The editor footer shows the complete local filesystem path for use in another editor or shell.

Disabling Local Notes only disconnects the root. It never removes or relocates Markdown files.
Changing the root starts using the newly selected directory and leaves the previous root untouched.

## Directory and document format

```text
Selected root/
  Career - Work/
    Quarterly Planning/
      Prepare quarterly review.md
```

Untagged lists use `_Unsorted`. Deleted task and list notes move beneath `_Archived` while
retaining their previous life-area and list hierarchy. Duplicate filenames receive a stable
task-ID suffix. Components are sanitized for macOS and Windows filename restrictions.

Each managed file begins with:

```md
---
taskplayer_task_id: "stable-task-id"
taskplayer_format: 1
---
```

The task ID, rather than the path, owns the association. TaskPlayer preserves the complete
frontmatter block, including keys added in another editor, and presents only the Markdown body.

## Filesystem safety

- The configured root is canonicalized and stored in an owner-readable device-local config file.
- Managed paths must remain beneath that root.
- Symbolic links are ignored during discovery and rejected in managed parent directories.
- Writes use a temporary file in the destination directory, flush it, and rename it atomically.
- On Unix, TaskPlayer creates managed note files as owner-readable/writable and new hierarchy
  directories as owner-only. Existing directory permissions remain under the user's control.
- Unrelated files are never overwritten. Filename collisions receive a stable suffix.
- Task/list renames, list-life-area changes, and task moves reconcile paths by stable task ID.
- Deleting a task or list must archive its note first. An unavailable root blocks deletion rather
  than risking loss of private writing.

## Concurrent editing

Every read returns a SHA-256 revision of the complete file. Saves include the revision they
started from and fail when the file changed. TaskPlayer then offers the latest external version
or an explicit overwrite; it never silently replaces another editor's work.

The open editor checks again whenever the application window regains focus. Continuous filesystem
watching is not part of the first version.

## Rendering and privacy

Preview supports GitHub-flavored Markdown and ignores raw HTML. Remote images render as blocked
labels rather than making background requests. HTTP, HTTPS, and email links open only after the
user selects them.

The optional Vim mode supports normal, insert, visual, and command modes through the CodeMirror 6
Vim extension. It is disabled by default and persisted beside the selected root in the local-only
configuration file. Synced task descriptions in Task Detail and Now Playing inherit the same
preference; Journal intentionally retains its plain writing field.

## Known gaps

- Changing roots does not migrate files automatically.
- External changes are detected on focus and save, not through a continuous filesystem watcher.
- Attachments, embedded local assets, full-text search, and note encryption are not included.
- Security-scoped bookmarks would be required if TaskPlayer later ships in the macOS App Sandbox.

## ADHD and gamification check

The editor lives on the task detail surface, satisfying point of performance and externalizing
context where work begins. Maximize mode reduces competing controls without creating a new
browsable destination. Local Notes has no rewards, streaks, loss framing, urgency, or engagement
mechanics.
