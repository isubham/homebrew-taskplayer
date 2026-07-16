# 0009 — Keep the Rust shell in small responsibility-focused modules

- Status: Accepted
- Date: 2026-07-16
- Owners: Jarvis
- Related: [`../rust-module-map.md`](../rust-module-map.md), [`../compatibility-policy.md`](../compatibility-policy.md)

## Context

The Tauri shell accumulated unrelated commands, lifecycle hooks, authentication, synchronization,
tray behavior, and timer work in a few large files. Editing those files required loading excessive
context and made ownership boundaries difficult for people and AI tools to identify.

## Decision

- Every Rust file under `src-tauri/src` stays below 200 lines after `rustfmt`.
- Files have one primary reason to change and use small facade modules for public composition.
- `main.rs` remains a minimal binary entry point; `lib.rs` remains composition-oriented.
- Tauri command handlers are grouped by user action while domain, persistence, migration, and pure
  timer logic remain in `src-tauri/core`.
- `docs/rust-module-map.md` is the current routing guide and must change when module ownership moves.

## Alternatives considered

- Keep a large `lib.rs` with section comments: fewer files, but high context cost and weak boundaries.
- Split only command handlers: leaves authentication, sync, and lifecycle code oversized.
- Generate the map automatically: line ownership and architectural intent still require explanation.

## Consequences

- Changes can begin with a small, predictable file set.
- Cross-module state must use explicit facade exports and narrow visibility.
- Refactors may create more files, but each remains cheap to inspect, review, and test.
- This structural rule does not change user-visible behavior, storage, or sync formats.
