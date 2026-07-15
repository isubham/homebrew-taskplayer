# 0005 — Fold Personal Growth into Health & Wellbeing

- Status: Accepted
- Date: 2026-07-15
- Owners: TaskPlayer
- Related: [`../features.md`](../features.md), [`../../CHANGELOG.md`](../../CHANGELOG.md),
  [`../compatibility-policy.md`](../compatibility-policy.md)

## Context

Personal Growth was presented as a separate life-area filing choice, but it does not provide a
clear enough boundary from Health & Wellbeing to remain a factual, low-deliberation category.
Keeping both asks the user to judge which area self-development belongs to, creating hesitation
at list creation and planning.

## Decision

Use five life areas. Retire Personal Growth from the current UI and fold existing `growth` lists
into `health`, preserving list direction and all task, session, estimate, and availability data.
Health & Wellbeing keeps its existing key and color.

Continue accepting `growth` from supported older clients and normalize it to `health` at local
storage and sync boundaries. Do not remove the remote string shape during the compatibility
window. Retired priority records are ignored by current clients.

## ADHD and gamification check

This directly supports the rule that categorization must be a fact rather than a decision by
removing an overlapping bucket. It adds no reward mechanic and does not alter jewels, streaks,
loss framing, or any permanent record.

## Alternatives considered

- Keep Personal Growth — rejected because its overlap with Health & Wellbeing creates avoidable
  filing deliberation.
- Move old lists to Unsorted — rejected because that discards a known relationship and makes the
  user re-file existing work.
- Reject the legacy `growth` value — rejected because supported older clients may still sync it.

## Consequences

- Sidebar, Daily Jam, list forms, Insights lanes, and Life Balance use five stable areas.
- Existing Personal Growth lists appear under Health & Wellbeing with the Health color.
- Older clients remain able to sync; the current client quietly normalizes their legacy value.
- Health & Wellbeing now covers both wellbeing and personal-development work.
