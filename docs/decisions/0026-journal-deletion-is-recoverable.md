# 0026 — Make Journal deletion recoverable

- Status: Accepted
- Date: 2026-07-29
- Owners: TaskPlayer
- Related: [`../journal-spec.md`](../journal-spec.md), [`0025-shared-local-storage-journal.md`](0025-shared-local-storage-journal.md)

## Context

Saved Journal entries need an in-app delete action, but direct filesystem deletion would be hard
to undo and could separate Markdown from pasted images. External editors can also change an entry
while TaskPlayer's edit view remains open.

## Decision

Deleting a saved entry requires explicit confirmation and its starting revision. TaskPlayer
removes the entry from the Journal list by moving its Markdown file and date-scoped image folder
together beneath `_Archived/Journal`. A revision mismatch rejects deletion.

## ADHD and gamification check

Deletion is a factual content-management action with neutral copy. It adds no tally, penalty,
loss-framed engagement pressure, reward, or permanent negative record.

## Alternatives considered

- Permanent deletion — matches a literal delete but creates avoidable data loss.
- Leave pasted images in place — simpler, but creates orphaned storage and an incomplete recovery.
- Soft-delete metadata in SQLite — recoverable, but would put local-only Journal state into the
  account-data store and make external Markdown less authoritative.

## Consequences

- Deleted entries disappear immediately from Journal but remain manually recoverable.
- Markdown-relative image links continue to work inside each archived entry package.
- Repeated deletion of entries for the same date creates separate timestamped archive packages.
