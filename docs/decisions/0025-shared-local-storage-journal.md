# 0025 — Share one local-files root and keep Journal independent of life areas

- Status: Accepted
- Date: 2026-07-29
- Owners: TaskPlayer
- Related: [`../journal-spec.md`](../journal-spec.md), [`0024-local-markdown-notes.md`](0024-local-markdown-notes.md)
- Amended by: [`0027-journal-entry-identity-and-context.md`](0027-journal-entry-identity-and-context.md)

## Context

Task Local Notes already use a user-selected filesystem root. A private journal needs the same
local-only and editor-portable guarantees, but journal entries can concern any part of life.
Placing them inside Health & Wellbeing would make users categorize general writing before they
can capture it and would make one life area appear to own unrelated entries.

The former Settings → Data placement also mixed filesystem privacy controls with account sync
repair and database-oriented actions.

## Decision

TaskPlayer uses one device-local root for Local Notes and Journal. The folder controls live under
Settings → Local Storage; the persisted configuration and existing task-note paths remain
compatible. Journal files live in a separate `Journal` directory and never enter a life-area
hierarchy.

Journal is a top-level destination. One ISO-date Markdown file represents each local calendar day.
Optional mood is descriptive frontmatter, not behavioral data: TaskPlayer does not aggregate,
score, trend, reward, or sync it. Pasted images use relative paths beneath the Journal directory.

## ADHD and gamification check

A top-level Journal avoids an artificial categorization decision and externalizes thoughts without
requiring a life-area choice. Mood is selected only at save time and has no streak, loss framing,
ranking, reward, or long-term negative summary.

## Alternatives considered

- Health & Wellbeing subsection — keeps navigation smaller, but falsely categorizes general
  writing and violates the factual-categorization rule.
- A second folder picker — isolates the feature but duplicates permissions and increases setup.
- SQLite journal records — easier to query, but opaque to external editors and easier to include
  in sync or backups accidentally.

## Consequences

- Local Notes and Journal share availability and disconnect behavior.
- Existing Local Notes configuration and files require no migration.
- The Journal namespace is stable and independent of future life-area changes.
- Selecting a cloud-synced folder can still upload files through that external provider; “No
  Cloud” describes TaskPlayer's behavior, not the chosen filesystem.
