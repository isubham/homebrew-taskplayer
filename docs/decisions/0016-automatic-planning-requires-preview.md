# 0016 — Automatic planning requires explicit preview and acceptance

- Status: Accepted
- Date: 2026-07-19
- Owners: TaskPlayer
- Related: [Planner calendar specification](../planner-calendar-spec.md),
  [decision 0015](0015-planned-sessions-separate-from-history.md)

## Context

Automatic allocation can externalize the work of fitting tasks into time, but silently writing a
schedule would remove user control and make a deterministic suggestion feel like a command. The
same inputs must also produce the same output so users and tests can understand why a block was
suggested.

## Decision

A pure Rust allocator expands local weekly availability across a bounded seven-day horizon,
subtracts repeating commitments and existing plans, ranks eligible one-time tasks by deadline,
life-area priority, task order, and stable task id, then fills the earliest valid openings. It
returns transient suggestions and factual unscheduled remainders without writing storage.

The desktop shell persists a suggestion batch only after the user reviews a bounded preview and
chooses Accept. Acceptance creates ordinary `planned_sessions`; there is no separate automatic
plan state, reward, missed-plan record, or implicit rescheduling loop.

## ADHD and gamification check

The preview externalizes the proposed structure while keeping the final commitment at the point of
performance. Deterministic output avoids variable-reward behavior. Factual remainder copy names
work that still needs time without blame, urgency, or a permanent failure record.

## Alternatives considered

- Save immediately and offer Undo — rejected because the calendar would change before informed
  consent and Undo still relies on noticing and correcting an unwanted result.
- Run allocation only in React — rejected because timezone, collision, ranking, and chunking rules
  need one pure, unit-testable implementation.
- Persist suggestions as a third session state — rejected because transient advice does not need
  sync, tombstones, or another source of calendar truth.

## Consequences

- Suggestion generation is read-only and deterministic for identical inputs.
- Accepted suggestions reuse the existing planned-session storage and sync contract.
- Changes to ranking or chunking are product-rule changes that require focused tests and an update
  to the Planner specification.
