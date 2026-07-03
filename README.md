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
- **Session modes** — Open, Target (progress bar to a goal), Pomodoro (auto work/break, work blocks auto-log, music pauses on breaks).
- **Focus music** — piano/guitar/lo-fi/ambient/classical via the free Radio Browser API, tied to the timer.
- Closing the main window keeps the app alive in the menu bar.

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
- **`src-tauri/src/main.rs`**: syntactically validated. The full Tauri app must be
  **compiled on macOS** (needs the macOS WebKit toolchain), so build it there with the steps above.
  It targets Tauri **2.x**; if a specific 2.x point release renamed a tray/menu API, adjust the import.
```
