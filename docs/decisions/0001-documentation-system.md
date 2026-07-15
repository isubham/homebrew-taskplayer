# 0001 — Separate current features, release history, and durable decisions

- Status: Accepted
- Date: 2026-07-15
- Owners: TaskPlayer
- Related: [`../features.md`](../features.md), [`../../CHANGELOG.md`](../../CHANGELOG.md)

## Context

TaskPlayer’s README feature list and focused design specifications drifted away from the app.
Some implemented specifications still said “proposed,” while the README described retired
behavior and omitted newer features. One growing document would mix current behavior, history,
future ideas, and rationale, making all four harder to maintain.

## Decision

Use three records with distinct jobs:

- `docs/features.md` is the authoritative description of the current working product.
- `CHANGELOG.md` records notable user-visible changes by release, with new work under Unreleased.
- `docs/decisions/` records durable product and architecture decisions and their rationale.

README remains a concise entry point and links to the authoritative catalog. Proposed work stays
in focused specifications or a future roadmap and is never labeled as shipped in the catalog.

Every user-visible change must update both the feature catalog and Unreleased changelog before it
is considered complete.

## ADHD and gamification check

This is process documentation, not a user-facing mechanic. It makes the project’s ADHD and
gamification constraints easier to apply consistently and introduces no reward or pressure loop.

## Alternatives considered

- Keep expanding README — rejected because setup, maintenance, product behavior, and history
  would compete in one long entry document.
- Use only a changelog — rejected because history cannot reliably answer what the app does now.
- Use only feature specifications — rejected because proposals and shipped behavior drift over
  time and specifications preserve design context rather than release history.

## Consequences

- Contributors have an explicit documentation definition of done.
- Current behavior, change history, and rationale can evolve independently without duplication.
- Existing design specifications need their status headers reviewed when implementation ships.

