# Rust shell module map

Use this map before loading Rust files. It identifies the smallest file set needed for a change
and keeps AI context focused. This covers the Tauri shell in `src-tauri/src`; pure domain and
persistence logic remains in `src-tauri/core`.

## Entry and composition

| File | Responsibility |
|---|---|
| `main.rs` | Binary entry point; calls `taskplayer::run()` only. |
| `lib.rs` | Crate composition, Tauri plugins, window events, and command registration. |
| `startup.rs` | Startup coordinator: state, OAuth hooks, tray, timers, and background jobs. |
| `bindings.rs` | Specta command list, TypeScript binding export, and binding test. |
| `state.rs` | Process-wide `AppState` and its synchronization/deduplication state. |
| `constants.rs` | Shared shell constants and stable user-facing backend messages. |
| `config.rs` | Compile-time Supabase configuration. |

## Runtime services

| File | Responsibility |
|---|---|
| `device.rs` | Device identity, run ownership, and post-sync reconciliation. |
| `playback_service.rs` | Internal play/stop mutations and session persistence. |
| `snapshot.rs` | Builds frontend `Snapshot`/`Status` values and display helpers. |
| `diagnostics.rs` | Log paths, panic logging, and guarded background execution. |
| `tick_loop.rs` | One-second timer progression, sleep detection, and tray refresh. |
| `tick_notifications.rs` | Target, hourly, and scheduled reminder dispatch. |
| `background_jobs.rs` | Periodic sync, full-sync, and update-check loops. |
| `audio_interruption.rs` | Debounced external audio/meeting activity monitor and frontend event emission. |
| `audio_interruption/core_audio.rs` | Shared macOS Core Audio process-property FFI primitives. |
| `audio_interruption/platform.rs` | Core Audio activity classification and own-audio exclusion heuristic. |
| `audio_interruption/takeover.rs` | Guarded Apple Music/Spotify pause-resume ownership leases. |
| `audio_interruption/tests.rs` | Interruption debounce policy tests. |
| `audio_interruption/platform_tests.rs` | Live macOS Core Audio capability probe. |
| `auth_session.rs` | Applies/refreshed sessions and maintains in-memory credentials. |
| `sync_service.rs` | App-level sync orchestration, retries, and frontend refresh. |

## Authentication

`auth.rs` is the facade.

| File | Responsibility |
|---|---|
| `auth/oauth.rs` | PKCE generation, authorization URL, and callback parsing. |
| `auth/token.rs` | Supabase token exchange/refresh and session conversion. |
| `auth/storage.rs` | Owner-only refresh-token file persistence. |
| `auth/tests.rs` | Authentication compatibility and error-classification tests. |

## Sync

`sync.rs` is the facade and public `sync_once`/`sync_login` coordinator.

| File | Responsibility |
|---|---|
| `sync/compatibility.rs` | Backend capability/version contract validation. |
| `sync/backfill.rs` | Durable field backfills after schema-aware client upgrades. |
| `sync/content_models.rs` | List, task, priority, and session wire models. |
| `sync/music_models.rs` | Focus-music favorite wire model. |
| `sync/runtime_models.rs` | Run-state and configuration wire models. |
| `sync/transport.rs` | Generic Supabase REST fetch/upsert helpers. |
| `sync/push.rs` | Local-to-remote serialization and cursor advancement. |
| `sync/pull.rs` | Remote-to-local collection and singleton application. |
| `sync/compatibility_tests.rs` | Old-client payload and backend-window tests. |

## Tray

`tray.rs` is the facade.

| File | Responsibility |
|---|---|
| `tray/status.rs` | Tray/window refresh, status title, icon, and menu hash. |
| `tray/menu.rs` | Tray menu construction and recent-task entries. |

## Tauri commands

`commands.rs` is the facade and contains only module exports plus shared orphan cleanup.

| File | Responsibility |
|---|---|
| `commands/lists.rs` | List CRUD, style, availability, and snapshot command. |
| `commands/tasks/details.rs` | Task creation, metadata, scheduling, and movement. |
| `commands/tasks/lifecycle.rs` | Ordering, completion, impact, estimates, and deletion. |
| `commands/sessions.rs` | Session editing plus backup import/export and logs. |
| `commands/playback.rs` | Timer play, stop, break, and resume commands. |
| `commands/settings.rs` | Timer settings, auth, sync, zoom, and sound commands. |
| `commands/schedule.rs` | Computes deduplicated daily/list schedule notices. |
| `commands/music.rs` | Saves and imports synced focus-music favorites. |
| `commands/system.rs` | Music state, URL opening, and updater commands. |
| `commands/audio.rs` | Audio-interruption capability, monitoring lifecycle, and synced preference. |

## Boundaries

- Keep every `src-tauri/src/**/*.rs` file below 200 lines after `rustfmt`.
- Give each file one reason to change; split by behavior before adding another responsibility.
- Keep `main.rs`, `lib.rs`, and facade modules declarative.
- Put business models, SQLite, migrations, and pure timer rules in `src-tauri/core`.
- Preserve Tauri command names and the command lists in `lib.rs` and `bindings.rs`.
- For storage, Supabase, wire-model, or serialized-shape changes, follow
  [`compatibility-policy.md`](compatibility-policy.md) and run `npm run test:compatibility`.
