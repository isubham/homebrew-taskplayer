# 0008 — Migrate frontend to React and Vite

- Status: Accepted
- Date: 2026-07-16
- Owners: Jarvis, Antigravity
- Related: [`0004-lit-html-component-model.md`](0004-lit-html-component-model.md), [`../features.md`](../features.md), [`../../CHANGELOG.md`](../../CHANGELOG.md)

## Context

TaskPlayer was built with a custom routing and template rendering setup using `lit-html` and manual DOM manipulations. As the feature set expanded (especially with the addition of the Daily Jam, custom albums, complex detail overlays, and detailed analytics screens), component lifecycle management and state synchronization became increasingly verbose and error-prone. We wanted to migrate the application view layer to React and bundle using Vite to improve component modularity, readability, maintainability, and compilation speeds.

## Decision

- The frontend view layer will be built using React (v18) and bundled using Vite.
- Every major UI section is a modular React component under `src/app/components/` (e.g. `sidebar.jsx`, `task-list-page.jsx`, `Player.jsx`, `MainContent.jsx`, `Overlays.jsx`, etc.).
- The entry script is migrated from `main.js` to `index.jsx`, which boots React and renders `<App />`.
- Local UI state (expanded session list states, selected against-details, search fields, active overlay selections) is managed natively by React states rather than direct DOM query selectors or manual class injection.
- Application-wide event handlers and drag-and-drop mechanics route through the existing command loop in `src/app/commands.js` using data attributes (`data-action`, `data-id`), maintaining backward compatibility with the existing Tauri backend API and local SQLite schemas.
- The previous `0004` decision to use `lit-html` components is superseded.

## ADHD and gamification check

This is an internal structural migration. It does not introduce any new gamification loops, loss-framing, variable rewards, or punitive feedback. It preserves all ADHD design principles from `docs/adhd-design-principles.md` (e.g., maintaining point of performance, immediate deterministic jewel payouts, clean visual timers, and neutral tone overlays).

## Alternatives considered

- Incrementally port individual pages using lit-html — this would require writing verbose lifecycle sync logic between custom templates, which is hard to test and maintain.
- Svelte / Vue — Svelte or Vue would provide reactive state but would add custom syntax where React has a highly standardized, well-documented ecosystem.

## Consequences

- The app features a highly modular React component tree, making future UI additions and debugging extremely simple.
- State updates from Tauri backend push events (`state-changed`, `tick`) reactively update the UI without manual element-swapping.
- Frontend builds transpile faster using Vite.
