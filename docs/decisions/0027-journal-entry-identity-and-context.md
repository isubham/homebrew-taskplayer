# 0027 — Give Journal entries stable identity and optional factual context

- Status: Accepted
- Date: 2026-07-29
- Owners: TaskPlayer
- Related: [`../journal-spec.md`](../journal-spec.md), [`0025-shared-local-storage-journal.md`](0025-shared-local-storage-journal.md)

## Context

One date-named file permits only one entry per day and cannot retain identity when its readable
title changes. A separate required category field would add friction before writing and conflict
with the rule that categorization must be a fact rather than a deliberative decision.

## Decision

Each entry receives a stable device-local ID and creation timestamp. Any number of entries can
share a date. The first non-empty body line is the title and participates in a readable filename;
the short stable ID prevents collisions and keeps title edits safe.

The save dialog contains optional mood and optional **Related to** references. References point
to existing lists, albums, or tasks by stable ID and retain a readable label in local frontmatter.
Neither context is required to save. This supersedes only the one-file-per-day identity rule in
decision 0025; its shared-root, top-level navigation, privacy, and life-area-independence decisions
remain accepted.

## ADHD and gamification check

Writing remains free of mandatory filing decisions. Context is requested only after writing,
skippable in one action, and selected from facts that already exist. The feature adds no rewards,
streaks, urgency, loss framing, scoring, or permanent negative record.

## Alternatives considered

- Timestamp-only filenames — allow multiple entries but remain unreadable outside TaskPlayer.
- Title-only filenames — readable but collide and make identity depend on mutable text.
- Required life-area selection — easier to aggregate but introduces a categorization decision and
  cannot represent concrete projects or tasks.
- Automatic text classification — removes a click but guesses sensitive meaning and makes local
  Journal behavior opaque.

## Consequences

- Existing date-only version-one files remain readable and upgrade on their next save.
- Title edits reconcile filenames without moving or orphaning entry-scoped pasted images.
- Relationships remain device-local and do not place Journal content or metadata in account sync.
- Showing related reflections directly on linked work surfaces remains a separate future behavior.
