# 0004 — Use one lit-html module per UI component

- Status: Accepted
- Date: 2026-07-15
- Owners: TaskPlayer
- Related: [`../ui-architecture-assessment.md`](../ui-architecture-assessment.md), [`../features.md`](../features.md)

## Context

TaskPlayer's frontend had a sound state/command loop but concentrated most markup in
`src/app/render.js`. Large `innerHTML` replacements destroyed DOM identity, made focus and scroll
fragile, required manual escaping, and kept reusable UI surfaces from being tested or changed in
isolation. The app already ships `lit-html`, so adopting a second view framework would duplicate
capability and force a wholesale rewrite.

## Decision

- Reusable UI surfaces live in `src/app/components/`, with one component module per file.
- Components are plain functions that return `lit-html` templates. They receive state-derived data
  and callbacks/action attributes; they do not own application state.
- `render.js` remains the temporary orchestration boundary: it prepares data, chooses a page, and
  mounts components with `litRender`.
- New component markup must use lit template interpolation rather than constructing HTML strings.
- Use custom elements or `LitElement` only when a component genuinely needs an isolated lifecycle,
  shadow DOM, or local state that cannot remain in the existing application state loop.
- Existing legacy renderers may be migrated incrementally, but new UI must not add another
  `innerHTML` rendering surface.

## ADHD and gamification check

This is an internal architecture decision. It does not add rewards, urgency, loss framing, stats,
or user decisions. Preserving DOM identity supports point-of-performance controls by making focus
and in-place interaction more reliable.

## Alternatives considered

- React — provides components and diffing, but would replace the existing view layer and add a
  build/runtime ecosystem where the app already has the needed renderer.
- `LitElement` everywhere — stronger lifecycle encapsulation, but unnecessary ceremony for mostly
  stateless templates and incompatible with an incremental migration.
- Keep string render helpers — retains manual escaping and whole-surface DOM replacement.

## Consequences

- Component templates are independently located and composed while the state/command model stays
  unchanged.
- Core list surfaces patch DOM nodes in place and escape interpolated content automatically.
- Home, Insights, Settings, dialogs, and some secondary surfaces remain explicit migration work;
  the renderer includes a safe boundary while lit and legacy roots coexist.
