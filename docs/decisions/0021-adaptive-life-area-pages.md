# 0021 — Use adaptive life-area pages

- Status: Accepted
- Date: 2026-07-28
- Owners: TaskPlayer
- Related: [`../health-life-area-page-spec.md`](../health-life-area-page-spec.md),
  [`../relationships-work-life-area-pages-spec.md`](../relationships-work-life-area-pages-spec.md),
  [`../features.md`](../features.md), [`../../CHANGELOG.md`](../../CHANGELOG.md)

## Context

The sidebar previously treated every life area as the same expandable list hierarchy. That depth
fits project-heavy Career / Work, but it makes action-and-routine areas such as Health harder to
scan and forces users to open several lists before seeing what they can do.

Completely unrelated page designs would remove that rigidity but make navigation and actions
unpredictable. The system needs stable interaction rules without forcing every area to contain the
same kinds of content.

## Decision

- Selecting any fixed life area opens a dedicated page; its sidebar chevron remains a separate
  list-disclosure control.
- Every area page uses the same navigation, task rows, playback, task detail, and creation flows.
- Each area may compose and order different modules from existing primitives.
- Tailored pages share one spatial grammar: top-left spotlight, top-right structure, left-column
  execution, and right-column schedule/context. Area-specific labels and modules may differ
  without reversing this scan direction.
- Health prioritizes supportive next actions and today's routines, then upcoming commitments and
  collection navigation.
- Relationships prioritizes reach-out actions and today's recurring care before people/circle
  collection navigation.
- Career / Work keeps project and album hierarchy prominent while also exposing current work,
  next actions, routines, and nearby schedule items.
- Task lists remain the persisted collection/project container. A visual module does not require a
  new storage primitive unless it has a genuinely different lifecycle.
- Outcome primitives may be added independently when their lifecycle differs from tasks; Goal is
  now governed by decision 0022.

## ADHD and gamification check

Actions and routines live at their point of performance and can be started without entering
another list. Area pages externalize today's schedule and upcoming commitments, while bounded
sections reduce overload. They keep existing deterministic task/session rewards and add no reward
for navigation, no streak, no missed-day record, no urgency, and no shame language.

## Alternatives considered

- Keep life areas as expandable sidebar folders only — preserves consistency but retains hidden
  actions and repeated navigation.
- Give every area a completely independent interaction model — flexible but makes the app harder
  to learn and predict.
- Add goals, appointments, and references before building the page — creates storage and sync
  machinery before the simpler page composition has been validated.

## Consequences

- Area pages can evolve independently while task execution stays consistent.
- Users can move between tailored pages without relearning where current work, structure,
  executable actions, routines, and time context live.
- Health's execution modules continue to use existing lists, tasks, sessions, and planned sessions;
  Goal is a separate additive organizing primitive.
- Finances and Recreation continue to show a generic collection page until their tailored
  compositions are built.
- A future Goal primitive requires its own compatibility-reviewed additive change.
