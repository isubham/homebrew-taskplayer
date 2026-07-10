# TaskPlayer for macOS

A Spotify-style **deep-work timer** as a native macOS app. One task plays at a time,
every play/stop logs a session to **SQLite**, and a **menu-bar status item** shows the
live minutes worked and toggles play/pause.

Built with **Tauri v2** — a Rust core (data + timing engine) wrapping the reused
Spotify-dark web UI. No login, no server; all data is local.

## Requirements (build on a Mac)

- macOS 11+
- [Rust](https://rustup.rs) (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- Node.js 18+ (only to run the Tauri CLI)
- Xcode Command Line Tools: `xcode-select --install`

## Run in development

```bash
cd taskplayer-mac
npm install
npm run dev
```

The first `npm run dev` compiles the Rust core + SQLite (a minute or two), then launches
the app and its menu-bar status item.

### Running dev alongside an installed release build

`npm run dev` uses `src-tauri/tauri.dev.conf.json` (merged in via `--config`) to run
under a separate bundle identifier, `com.taskplayer.desktop.dev` instead of
`com.taskplayer.desktop`. Since the SQLite DB and session file live under
`app_data_dir()`, which is derived from the identifier, this gives the dev instance its
own database (`~/Library/Application Support/com.taskplayer.desktop.dev/...`) instead of
sharing — and potentially corrupting — the real one used by a `brew install`'d release.
The dev window is also titled "TaskPlayer (Dev)", and the dev tray icon renders in full
color with a "(Dev)" tooltip (vs. the release build's monochrome template icon), so the
two menu-bar icons are easy to tell apart when both are running.

The Supabase OAuth deep-link is also split: dev builds (`cfg!(debug_assertions)`, see
`auth.rs`) use `taskplayer-dev://auth-callback` and register the `taskplayer-dev` scheme
via `tauri.dev.conf.json`, while release builds keep `taskplayer://auth-callback`. This
requires a one-time manual step in the Supabase dashboard:

1. Go to Authentication → URL Configuration → Redirect URLs.
2. Add `taskplayer-dev://auth-callback` alongside the existing
   `taskplayer://auth-callback`.

Without that, Google Sign-In in the dev build will fail (or a stale scheme registration
could route the callback to the wrong app) even though the code/config split is in
place. After adding it, sign-in, data, timer state, tray, and window are all fully
isolated between a `npm run dev` instance and an installed release build.

## Build a shareable .dmg

```bash
npm run build
```

Output lands in `src-tauri/target/release/bundle/`:

- `dmg/TaskPlayer_0.1.0_aarch64.dmg` — the installer you share
- `macos/TaskPlayer.app` — the app bundle

### Opening an unsigned app (what recipients do)

This build is **unsigned** (no Apple Developer account). macOS Gatekeeper will warn on
first launch. To open it:

- **Right-click the app → Open → Open** (only needed once), or
- clear the quarantine flag: `xattr -cr /Applications/TaskPlayer.app`

To ship with zero warnings later, sign + notarize with an Apple Developer ID and set
`bundle.macOS.signingIdentity` in `src-tauri/tauri.conf.json`.

## Features

- **Single active task** — starting one stops+logs the previous (Spotify model).
- **Menu-bar status item** — shows `▶ 25m` (or `☕ 4m` on break); click for Open / Play-Pause / Quit.
- **Task detail** — total time + full session history.
- **Row ⋯ menu** — history, rename, start/stop, deep/shallow tag, delete. Lists rename via ✎ or double-click.
- **Session modes** — Open, Target (progress bar to a goal), Pomodoro (work blocks
  auto-log; the next phase always waits for a click rather than starting on its own).
  Both phase transitions fire a notification + sound with a "Start break"/"Start work"
  button, but window-surfacing is **asymmetric on purpose**: break→work forces the main
  window to the front (restarting after a stop is the harder self-initiated transition,
  and a missed passive notification just means a longer break); work→break does *not*
  steal focus (you may be mid-hyperfocus, which is the state this app exists to protect
  — the notification + updated tray title are enough to notice without yanking you out
  of it). Alert sounds are configurable per-phase in Settings. Music pauses on breaks.
- **Focus music** — piano/guitar/lo-fi/ambient/classical via the free Radio Browser API, tied to the timer.
- **Self-updating** — checks for a newer signed build a few seconds after launch (silently — a no-op stays quiet), and any time via Settings → About → "Check for updates". Finding one always asks first; confirming downloads, installs, and restarts the app. No Homebrew re-install needed after the first `brew install --cask`.
- Closing the main window keeps the app alive in the menu bar.

## Releasing a new version (maintainers)

One-time setup, before the very first release with self-updates:

```bash
scripts/generate-update-key.sh
# paste the printed public key into src-tauri/tauri.conf.json -> plugins.updater.pubkey, commit it
```

Then add the private key as two repo secrets (Settings → Secrets and variables → Actions →
New repository secret) — this is what lets CI sign builds without the key ever touching disk
outside your own machine:

- `TAURI_SIGNING_PRIVATE_KEY` = `$(cat ~/.tauri/taskplayer-updater.key)`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = blank, unless the generator asked you for one above

### Releasing (recommended: GitHub Actions)

```bash
gh workflow run release.yml -f version=0.4.0
```

Or trigger it from the Actions tab. `.github/workflows/release.yml` runs on a macOS runner,
builds and signs the app, and calls `scripts/release.sh` for you — same script, same logic,
just running on CI instead of your Mac.

### Releasing locally instead

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/taskplayer-updater.key)"
scripts/release.sh 0.4.0 --publish
```

`scripts/release.sh` bumps the version everywhere it's recorded (`package.json`,
`tauri.conf.json`, `Cargo.toml`), builds, packages the signed `.app.tar.gz` + `latest.json`
the in-app updater reads, updates `Casks/taskplayer.rb`'s version/sha256, commits, tags,
and (with `--publish`) pushes + creates the GitHub release with all three files attached.
Run `scripts/release.sh --help` for the flags (`--skip-build`, `--yes`, `--force`).

## Where data lives

`~/Library/Application Support/com.taskplayer.desktop/taskplayer.sqlite3`

Delete that file to reset. First launch seeds demo lists/tasks.

## Project layout

```
taskplayer-mac/
  package.json              # Tauri CLI + scripts
  src/                      # frontend (static, no bundler): index.html, main.js, music.js, styles.css
  src-tauri/
    tauri.conf.json         # main window, bundle targets, identifier
    capabilities/           # IPC/window permissions
    icons/                  # generated app icons (regenerate: npm run icons)
    src/main.rs             # app shell: state, commands, menu-bar tray, 1s tick loop
    core/                   # ← standalone, fully unit-tested
      src/models.rs         #   domain model
      src/db.rs             #   rusqlite persistence (bundled SQLite)
      src/timer.rs          #   pure timing engine (play/stop/pomodoro)
      src/lib.rs            #   totals + re-exports
```

## Regenerate icons (optional)

Icons are pre-generated. To change the artwork, replace `src-tauri/icons/app-icon.png`
and run `npm run icons`.

## Verification status

- **`taskplayer-core`**: `cargo test` — **10/10 tests pass** (timing transitions, single-active-task,
  Pomodoro work/break, SQLite CRUD, cascade delete, task totals). Run with `cd src-tauri/core && cargo test`.
- **Frontend JS**: parses clean.
- **`src-tauri/src/main.rs`**: syntactically validated (no `cargo`/Rust toolchain available in this
  environment — braces/parens balance-checked by hand, and the two new updater commands were
  cross-checked line-by-line against the current `tauri-plugin-updater` docs/docs.rs, since that's
  exactly the kind of API detail that drifts between versions). The full Tauri app must be
  **compiled on macOS** (needs the macOS WebKit toolchain) — this is the part that most needs a
  close look on the first real build.
- **Self-update JS flow** (`checkForUpdates`/`promptInstallUpdate` in `commands.js`, the Settings
  page's About section, the `main.js` launch-delay check): exercised end-to-end with jsdom + faked
  `invoke`/dialog calls — found-update, up-to-date (silent and not), and install-failure paths all
  render and transition state correctly. Not exercised: an actual signed download over the network,
  which needs the real `tauri.conf.json` pubkey (see "Releasing a new version" above) and a real
  build.
- It targets Tauri **2.x**; if a specific 2.x point release renamed a tray/menu/updater API, adjust the import.
- **Impact tiers** (task-level `impact_tier`/`impact_sign`, distilled down from a much bigger
  first-pass "gamification layer" that also had per-task multi-area weighted splits, a daily mana
  cap, decaying per-area vitality rings, and a rolling-window rank ladder — all of that was cut as
  more machinery than the underlying idea was worth; see `utils.js`'s comment on `jewelPayout()`).
  What's left: a task's impact tier + for/against sign (`migration 006`, kept; `007_drop_task_areas`
  drops the now-unused weighted-split table), the `set_task_impact` command, a plain jewel-dot on
  the task row and in the task-edit panel's Impact section, and the Home page's life-balance radar
  now weighting a completed, impact-tagged task by its tier instead of raw tracked time. The
  frontend math (`jewelPayout` in `utils.js`, and `lifeBalanceScores` in `render.js`) was executed
  directly under Node against hand-built scenarios and matched hand-calculated expectations. The
  Rust side (`db.rs`/`models.rs`/`migrations.rs`/`main.rs`) is syntactically validated the same way
  as the updater work above (no `cargo` in this environment — braces/parens balance-checked, types
  traced by hand against existing call sites), but has **not been compiled** — run
  `cd src-tauri/core && cargo test` first after pulling this down. `impact_tier`/`impact_sign` are
  local-only for now (same as `life_area`/`life_direction`) — no Supabase schema changes were made,
  so neither syncs across devices yet.
```
