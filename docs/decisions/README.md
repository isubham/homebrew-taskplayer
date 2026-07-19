# Decision records

Decision records preserve the reason behind durable product and architecture choices. They
complement the current-state feature catalog and changelog:

- [`../features.md`](../features.md) says what exists now.
- [`../../CHANGELOG.md`](../../CHANGELOG.md) says what changed and when.
- This directory says why an important choice was made.

Create a record when a decision is expensive to reverse, establishes a cross-feature rule, or
would otherwise be repeatedly debated. Do not create one for routine implementation details.

## Index

| Record | Status | Decision |
|---|---|---|
| [0001](0001-documentation-system.md) | Accepted | Separate current features, release history, and durable decisions |
| [0002](0002-automatic-pomodoro-transitions.md) | Accepted | Start Pomodoro break/work phases automatically at boundaries |
| [0003](0003-backward-compatible-storage-and-sync.md) | Accepted | Preserve compatibility across SQLite, Supabase, and client versions |
| [0004](0004-lit-html-component-model.md) | Superseded | Use one lit-html module per UI component |
| [0005](0005-fold-personal-growth-into-health.md) | Accepted | Fold Personal Growth into Health & Wellbeing |
| [0006](0006-desktop-window-minimum.md) | Accepted | Keep the desktop workspace at or above 1280×800 |
| [0007](0007-now-playing-focus-page.md) | Accepted | Make Now Playing a temporary focus page instead of a persistent rail |
| [0008](0008-react-and-vite-migration.md) | Accepted | Migrate frontend to React and Vite |
| [0009](0009-rust-shell-module-boundaries.md) | Accepted | Keep the Rust shell in small responsibility-focused modules |
| [0010](0010-hybrid-focus-audio-sourcing.md) | Accepted | Use hybrid local and Audius sourcing for focus vibes |
| [0011](0011-local-audio-interruption-detection.md) | Superseded | Detect competing audio locally without capturing it |
| [0012](0012-synced-user-settings.md) | Accepted | Store account preferences in a synced singleton separate from timer config |
| [0013](0013-exact-media-takeover.md) | Superseded | Control only explicitly supported media apps through a local ownership lease |
| [0014](0014-no-external-audio-coordination.md) | Accepted | Keep focus music independent of external audio and media players |
| [0015](0015-planned-sessions-separate-from-history.md) | Accepted | Keep future plans separate from recorded work sessions |
| [0016](0016-automatic-planning-requires-preview.md) | Accepted | Require preview and acceptance for deterministic automatic planning |
| [0017](0017-confirmed-system-sleep-events.md) | Accepted | Pause timers only for confirmed macOS system sleep |

## Creating a record

1. Copy [`0000-template.md`](0000-template.md).
2. Use the next four-digit number and a short kebab-case name.
3. Keep context factual and list alternatives actually considered.
4. Mark it Proposed, Accepted, Superseded, or Rejected.
5. Add it to the index above.
6. Never rewrite an accepted decision to hide history; supersede it with a new record.
