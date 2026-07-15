# 0006 — Keep the desktop workspace at or above 1280×800

- Status: Accepted
- Date: 2026-07-15
- Owners: TaskPlayer
- Related: [`../features.md`](../features.md), [`../../CHANGELOG.md`](../../CHANGELOG.md)

## Context

TaskPlayer’s working surface combines a fixed sidebar, central task workspace, optional Now
Playing rail, and persistent bottom player. Below roughly 1,240px, these regions compete for
space and force compact responsive behavior that the desktop product does not intend to support.

## Decision

Set the production and development main windows to a minimum of 1280×800. New windows open at
1280×840, giving the workspace a taller, more Mac-like proportion without requiring the 960px
height of a strict 4:3 window. The width aligns with the existing breakpoint where Now Playing
uses 30% of the workspace, keeping one predictable desktop composition.

## ADHD and gamification check

This is a layout constraint, not a gamification mechanic. Preserving space keeps task context,
physical time cues, and point-of-performance controls legible without hiding or reordering them
in compact modes.

## Alternatives considered

- Maintain layouts below 1280px — rejected because it adds responsive states without improving
  the intended desktop workflow.
- Automatically hide the sidebar or Now Playing rail — rejected because controls and context
  would move or disappear based on window size.

## Consequences

- Smaller displays cannot resize TaskPlayer below 1280×800.
- The primary three-column workspace has one supported minimum composition.
- Responsive CSS may still exist defensively, but it is not a supported desktop window state.
