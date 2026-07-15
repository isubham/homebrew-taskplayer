// TaskPlayer — macOS menu-bar deep-work timer (Tauri v2 shell around taskplayer-core).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;
mod config;
mod sync;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use chrono::{Days, Local, NaiveDate, TimeZone, Timelike};
use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;

use taskplayer_core::models::now_ms;
use taskplayer_core::schedule::{due_schedule_events, ScheduleEvent, ScheduleEventKind};
use taskplayer_core::{
    task_total_ms, timer, AccountInfo, Db, RunState, Session, SessionConfig, Snapshot, Status,
    Task, TaskList,
};

struct AppState {
    db: Mutex<Db>,
    run: Mutex<RunState>,
    config: Mutex<SessionConfig>,
    /// This device's stable id (`Db::get_device_id()`) and best-effort
    /// display name — loaded/computed once at startup (see `device_name()`).
    /// Drives cross-device session sync (docs/session-sync-design.md);
    /// immutable for the process lifetime, so no `Mutex` needed.
    device_id: String,
    device_name: String,
    /// PKCE verifier for the in-flight sign-in attempt, if any. Only one
    /// sign-in flow happens at a time, so a single slot is enough.
    pending_pkce: Mutex<Option<auth::Pkce>>,
    /// Current Supabase session access token, if signed in, plus when it
    /// expires — so the sync loop can refresh it proactively instead of
    /// only reacting once a request comes back 401. The refresh token
    /// itself lives in `data_dir/session.json` (see auth.rs), never here.
    access_token: Mutex<Option<AccessToken>>,
    sync_status: Mutex<SyncStatus>,
    /// Whether the focus-music widget is currently playing. Mirrored from
    /// the frontend (music.js's `<audio>` element lives entirely in the
    /// webview, Rust has no direct visibility into it) via the
    /// `set_music_playing` command, purely so the tray menu's music toggle
    /// label can read "Pause music" vs. "Play music" correctly.
    music_playing: Mutex<bool>,
    /// The update `check_for_update` last found, if any and not yet consumed
    /// by `install_update`. A single slot is enough — only one "is there an
    /// update" round-trip is ever in flight from the Settings page at a time.
    pending_update: Mutex<Option<tauri_plugin_updater::Update>>,
    /// Version string of the last update the background checker already
    /// notified about, so the 4-hourly poll doesn't re-notify for the same
    /// release every cycle until the user actually installs it.
    last_notified_update_version: Mutex<Option<String>>,
    /// OS app-data directory — also where the SQLite file and session.json live.
    data_dir: PathBuf,
    /// Dedupe state for the tick loop's non-pomodoro notifications (target
    /// reached, open-mode hourly check-in). Keyed on `running_start`, so a
    /// new work segment automatically re-arms both. Purely in-memory: after
    /// an app restart the worst case is one repeated notification, not a
    /// missed one, so it isn't worth persisting.
    session_notify: Mutex<SessionNotify>,
}

/// See `AppState::session_notify`.
#[derive(Default)]
struct SessionNotify {
    /// `running_start` of the work segment whose target-reached notification
    /// already fired (target mode).
    target_fired_for: Option<i64>,
    /// `running_start` of the segment the hourly check-in last fired for,
    /// plus how many full hours had elapsed when it did (open mode).
    nudge_fired_for: Option<i64>,
    nudge_hours: i64,
    /// Schedule reminders are evaluated once per ten-second bucket and
    /// deduped per concrete weekday occurrence. The ledger is intentionally
    /// device-local and short-lived; it prevents notification spam without
    /// becoming a user-visible history of missed routines.
    schedule_checked_bucket: Option<i64>,
    schedule_fired: HashMap<String, i64>,
}

#[derive(Clone, Default)]
struct SyncStatus {
    syncing: bool,
    last_synced_at: Option<i64>,
    last_sync_error: Option<String>,
}

#[derive(Clone)]
struct AccessToken {
    token: String,
    /// Wall-clock ms (same epoch as `now_ms()`) at which Supabase considers
    /// this token expired.
    expires_at_ms: i64,
}

/// How long before actual expiry to proactively refresh — gives the refresh
/// request itself, plus any clock drift, enough headroom that a sync never
/// has to fall back to the reactive 401-retry path in the common case.
const REFRESH_SKEW_MS: i64 = 5 * 60 * 1000;

/// Shown whenever we discover the session can't be used and the user will
/// need to re-authenticate — kept as one constant so `sync_now`, the
/// proactive-refresh path, and the startup silent refresh all say the same
/// thing.
const SESSION_EXPIRED_MSG: &str =
    "Not signed in (your session expired) — sign out and sign back in.";
const SYNC_RETRY_MSG: &str = "Sync paused by a connection issue — retrying automatically.";

// ---- snapshot / status builders ----
fn build_snapshot(state: &AppState) -> Snapshot {
    // Snapshot reads must never hold the database mutex while acquiring one
    // of the smaller state mutexes. Timer/config mutations use the opposite
    // order when they persist a change, so overlapping the guards here can
    // deadlock two Tauri command threads (and freeze the main thread behind
    // the resulting push). Copy the database-backed fields first, then drop
    // that guard before reading the remaining state.
    let (lists, life_area_priorities, tasks, sessions, account) = {
        let db = state.db.lock().unwrap();
        (
            db.lists().unwrap_or_default(),
            db.life_area_priorities().unwrap_or_default(),
            db.tasks().unwrap_or_default(),
            db.sessions().unwrap_or_default(),
            db.get_account(),
        )
    };
    let sync_status = state.sync_status.lock().unwrap().clone();
    let config = state.config.lock().unwrap().clone();
    let run = state.run.lock().unwrap().clone();
    Snapshot {
        lists,
        life_area_priorities,
        tasks,
        sessions,
        config,
        run,
        device_id: state.device_id.clone(),
        account,
        syncing: sync_status.syncing,
        last_synced_at: sync_status.last_synced_at,
        last_sync_error: sync_status.last_sync_error,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

fn build_status(state: &AppState, now: i64) -> Status {
    let run = state.run.lock().unwrap().clone();
    let config = state.config.lock().unwrap().clone();
    let db = state.db.lock().unwrap();

    let mut st = Status {
        active: false,
        phase: run.phase.clone(),
        task_id: run.active_task_id.clone(),
        task_name: None,
        list_name: None,
        list_color: None,
        elapsed_ms: 0,
        minutes: 0,
        task_total_ms: 0,
    };

    if let Some(tid) = run.active_task_id.clone() {
        st.active = true;
        if let Ok(tasks) = db.tasks() {
            if let Some(t) = tasks.iter().find(|x| x.id == tid) {
                st.task_name = Some(t.name.clone());
                if let Ok(lists) = db.lists() {
                    if let Some(l) = lists.iter().find(|x| x.id == t.list_id) {
                        st.list_name = Some(l.name.clone());
                        st.list_color = Some(l.color.clone());
                    }
                }
            }
        }
        if let Ok(sessions) = db.sessions() {
            st.task_total_ms = task_total_ms(&sessions, &run, &tid, now);
        }
        st.elapsed_ms = if run.phase.as_deref() == Some("break") {
            timer::break_remaining(&run, &config, now)
        } else {
            timer::work_elapsed(&run, now)
        };
        st.minutes = st.elapsed_ms / 60_000;
    }
    st
}

/// Format milliseconds as "1h 05m" / "1h" / "45m", matching the frontend's fmtHM.
fn format_hm(ms: i64) -> String {
    let minutes = ms / 60_000;
    let hours = minutes / 60;
    let remainder = minutes % 60;
    if hours > 0 {
        if remainder > 0 {
            format!("{}h {}m", hours, remainder)
        } else {
            format!("{}h", hours)
        }
    } else {
        format!("{}m", minutes)
    }
}

/// Trim a title to `n` characters (char-safe), adding an ellipsis if cut.
fn truncate(s: &str, n: usize) -> String {
    if s.chars().count() > n {
        format!(
            "{}…",
            s.chars().take(n.saturating_sub(1)).collect::<String>()
        )
    } else {
        s.to_string()
    }
}

/// Task name to show in a pomodoro transition notification, truncated the
/// same way the tray title is — a 90-character task name would otherwise
/// blow out the notification body.
fn task_name_for_notification(db: &Db, task_id: &str) -> String {
    db.tasks()
        .unwrap_or_default()
        .into_iter()
        .find(|t| t.id == task_id)
        .map(|t| truncate(&t.name, 60))
        .unwrap_or_else(|| "your task".to_string())
}

// ---- logging ----
//
// Hand-rolled append-only text log rather than pulling in `log` +
// `tauri-plugin-log` — matches this codebase's existing preference (see
// auth.rs/sync.rs) for a small hand-rolled thing over a generic crate when
// the need is this simple: one file, append-only, human-readable lines.
//
// Lives at the standard macOS location (`~/Library/Logs/TaskPlayer/`, same
// place Console.app already knows to look) rather than inside the Tauri
// app-data dir, and is computed with a plain `$HOME` lookup instead of
// `app.path().app_log_dir()` so `install_panic_hook()` can be wired up
// before a Tauri `App` even exists — a panic during `setup()` itself should
// still end up in the log.
fn log_dir() -> PathBuf {
    let home = std::env::var("HOME")
        .ok()
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    home.join("Library/Logs/TaskPlayer")
}

fn log_file_path() -> PathBuf {
    log_dir().join("taskplayer.log")
}

/// Appends one line to `taskplayer.log` (and still prints to stderr, so
/// `tauri dev` in a terminal keeps working exactly as before). Every error
/// path in this file should call this instead of `eprintln!` directly —
/// stderr is invisible once the app is launched normally (double-click,
/// login item), which is the only place a real user ever hits these paths.
fn log_line(msg: impl AsRef<str>) {
    let msg = msg.as_ref();
    eprintln!("{msg}");
    let _ = std::fs::create_dir_all(log_dir());
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_file_path())
    {
        use std::io::Write;
        let _ = writeln!(f, "[{}] {msg}", now_ms());
    }
}

/// Catches a panic on the *current* thread's `f`, logging it instead of
/// letting it silently kill a background thread forever. Rust panics
/// default to `panic = "unwind"` (this crate never sets `panic = "abort"`),
/// so a panic inside one of the `thread::spawn` loops below already doesn't
/// bring down the whole app — but it does permanently stop that one loop
/// (the pomodoro tick, or sync) with zero visible sign anything went wrong.
/// This turns "the timer silently stopped advancing forever" into "one tick
/// was skipped, logged, and the loop kept going."
fn guard<F: FnOnce()>(where_: &str, f: F) {
    if let Err(e) = std::panic::catch_unwind(std::panic::AssertUnwindSafe(f)) {
        let msg = e
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| e.downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "<non-string panic payload>".to_string());
        log_line(format!("PANIC in {where_}: {msg}"));
    }
}

/// Installs a panic hook that also records panics to `taskplayer.log`, on
/// top of the default hook's usual stderr output. Installed at the very top
/// of `main()`, before the Tauri builder even starts, so nothing — not even
/// a panic during plugin setup — goes unrecorded.
fn install_panic_hook() {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        default_hook(info);
        log_line(format!("PANIC: {info}"));
    }));
}

// ---- push updates to windows + tray ----
fn refresh(app: &AppHandle) {
    let state = app.state::<AppState>();
    let status = build_status(state.inner(), now_ms());

    // Touching the tray item — even just *reading* it via tray_by_id, let
    // alone set_title — has to happen on the main thread. AppKit's status-item
    // machinery asserts on this internally and traps (EXC_BREAKPOINT/SIGTRAP)
    // if violated: a hard native abort that no amount of Rust-side
    // catch_unwind or panic-hooking can intercept or log (see `guard` and
    // `install_panic_hook` above — neither one is reachable from here,
    // because this was never a Rust panic to begin with).
    //
    // `refresh` runs on the 1s background tick thread on every single tick
    // that *isn't* a pomodoro transition (see the tick loop in `main()`) —
    // so this was crashing unpredictably on essentially any tick, not just
    // pomodoro boundaries. Wrapping in run_on_main_thread, same as the tray
    // menu rebuild in push() below and the notification calls in the tick
    // loop, is the actual fix.
    let app2 = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(tray) = app2.tray_by_id("tray") {
            // Icon color is the point-of-performance signal for run state —
            // green while a focus session is actually running, yellow for
            // break/awaiting states (paused, but not stopped), white once
            // fully idle. Kept as three flat colors rather than more states:
            // anything finer-grained would ask the user to interpret a color
            // instead of glancing at it.
            let icon = match (status.active, status.phase.as_deref()) {
                (true, Some("work")) => tauri::include_image!("icons/menubar-work.png"),
                (true, _) => tauri::include_image!("icons/menubar-break.png"),
                (false, _) => tauri::include_image!("icons/menubar-idle.png"),
            };
            let _ = tray.set_icon(Some(icon));

            // The icon already carries run state, so the title is just
            // the time (a coffee cup keeps the break state explicit in text too).
            // show the task being worked on next to the icon (truncated), then time
            let title = if status.active {
                let name = truncate(status.task_name.as_deref().unwrap_or("Focus"), 26);
                match status.phase.as_deref() {
                    Some("break") => {
                        Some(format!(" {} · ☕ {}", name, format_hm(status.elapsed_ms)))
                    }
                    _ => Some(format!(" {} · {}", name, format_hm(status.elapsed_ms))),
                }
            } else {
                None
            };
            let _ = tray.set_title(title);
        }
        let _ = app2.emit("tick", &status);
    });
}

fn push(app: &AppHandle) {
    let state = app.state::<AppState>();
    let snap = build_snapshot(state.inner());
    let _ = app.emit("state-changed", &snap);
    refresh(app);
    // rebuild the tray menu (recents/current change) — menu ops must run on the main thread
    let app2 = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(tray) = app2.tray_by_id("tray") {
            if let Ok(menu) = build_tray_menu(&app2) {
                let _ = tray.set_menu(Some(menu));
            }
        }
    });
}

// ---- cross-device session ownership (see docs/session-sync-design.md) ----

/// Best-effort human-readable device name ("Subham's MacBook Pro") for the
/// "Playing on ..." UI. `scutil --get ComputerName` is the same friendly
/// name shown in System Settings > Sharing — nicer than a raw hostname, and
/// needs no new dependency (matches this codebase's stated preference for a
/// small hand-rolled thing over a generic crate — see the top of sync.rs).
/// Never blocks the feature: falls back to a generic label if the command
/// fails or returns nothing for any reason.
fn device_name() -> String {
    std::process::Command::new("scutil")
        .args(["--get", "ComputerName"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "Mac".to_string())
}

/// Whether `run`'s live session belongs to this device. `None` covers a
/// pre-migration or freshly-reset `RunState` (e.g. right after
/// `import_data`) — treated as "ours", never as a foreign session, per
/// `RunState::device_id`'s doc comment in models.rs.
fn is_own(run: &RunState, device_id: &str) -> bool {
    run.device_id
        .as_deref()
        .map(|d| d == device_id)
        .unwrap_or(true)
}

/// Marks `run` as this device's own live session — stamps `device_id`/
/// `device_name` and bumps `updated_at` to now. Called after every LOCAL
/// play/stop/phase-transition (never inside `timer.rs`, which stays pure and
/// I/O-free) so the next push cycle picks the change up and other devices
/// can tell this session apart from their own. Deliberately unconditional
/// (not "only if it wasn't already ours") — every local mutation reasserts
/// ownership, which is also exactly how "press play here" takes a session
/// over from whichever device previously owned it.
fn stamp_own(run: &mut RunState, device_id: &str, device_name: &str) {
    run.device_id = Some(device_id.to_string());
    run.device_name = Some(device_name.to_string());
    run.updated_at = now_ms();
}

/// If `run` is currently mirroring another device's session, returns a
/// sanitized clone with the active/phase/timing fields cleared (but
/// `cycles_completed`/`last_task_id` preserved) — safe to feed into
/// `timer::play`/`timer::stop` so a local action never fabricates a bogus
/// completed `Session` for work that happened (or is mid-flight) on someone
/// else's device. Returns `run` unchanged if it's already this device's own.
fn as_local_baseline(run: &RunState, device_id: &str) -> RunState {
    if is_own(run, device_id) {
        run.clone()
    } else {
        RunState {
            active_task_id: None,
            running_start: None,
            phase: None,
            break_start: None,
            last_task_id: run.last_task_id.clone(),
            cycles_completed: run.cycles_completed,
            long_break: false,
            device_id: run.device_id.clone(),
            device_name: run.device_name.clone(),
            updated_at: run.updated_at,
        }
    }
}

/// Called after every sync cycle. `sync::pull` (inside `sync::sync_once`)
/// writes a newer remote `run_state` row straight to `Db` — bypassing
/// `AppState.run`, the in-memory copy every command handler and the tick
/// loop actually read/write — so without this, a session taken over
/// remotely would never show up in the frontend until the next app restart.
/// This reconciles the two: adopts whatever `Db` now has as the in-memory
/// truth, and — only if the takeover wasn't a same-segment continuation (see
/// `do_play`) — logs whatever work segment was running here first, ending
/// "now" (discovery time — necessarily approximate, bounded by the sync
/// cadence), so the time isn't silently lost. See docs/session-sync-design.md §4.4.
fn reconcile_run_after_sync(state: &AppState) {
    let mut run = state.run.lock().unwrap();
    let db_run = state.db.lock().unwrap().get_run();

    if db_run == *run {
        return;
    }

    let we_owned_locally = is_own(&run, &state.device_id) && run.active_task_id.is_some();
    let still_ours_remotely = is_own(&db_run, &state.device_id);
    // A clean handoff-in-place — another device took over this exact
    // segment (`do_play`'s continuation branch: same task, same phase, same
    // running_start/break_start, just a new owner) — means THAT device is
    // now responsible for eventually logging the whole thing, start to
    // finish. Logging our own partial segment here too would double-count
    // the overlap between "our" logged portion and its eventual full one.
    let same_segment_continues = db_run.active_task_id == run.active_task_id
        && db_run.phase == run.phase
        && db_run.running_start == run.running_start
        && db_run.break_start == run.break_start;

    if we_owned_locally
        && !still_ours_remotely
        && !same_segment_continues
        && run.phase.as_deref() == Some("work")
    {
        if let (Some(task_id), Some(start)) = (run.active_task_id.clone(), run.running_start) {
            let db = state.db.lock().unwrap();
            let _ = db.add_session(&taskplayer_core::SessionLog {
                task_id,
                start,
                end: now_ms(),
            });
        }
    }

    *run = db_run;
}

/// Same in-memory/`Db` reconciliation problem as `reconcile_run_after_sync`,
/// for `SessionConfig` — `sync::pull` can write a newer `config` row straight
/// to `Db`, bypassing `AppState.config`. Much simpler than the run-state
/// case: settings aren't "owned" by a device the way a live session is, so
/// there's no ownership/takeover logic here, just adopt whatever's newer.
fn reconcile_config_after_sync(state: &AppState) {
    let mut config = state.config.lock().unwrap();
    let db_config = state.db.lock().unwrap().get_config();
    if db_config != *config {
        *config = db_config;
    }
}

// ---- timer mutations (lock order: run -> db) ----
fn do_play(state: &AppState, task_id: &str) {
    let now = now_ms();
    let mut run = state.run.lock().unwrap();

    // Taking over a session another device is actively mid-flight on, for
    // the SAME task — continue in place (keep running_start/break_start)
    // rather than restarting the clock at 0:00. Spotify-style "play here"
    // resumes the same position; it doesn't replay the track from the top.
    // Only applies to "work"/"break" (a real countdown in progress) — an
    // "awaiting_break"/"awaiting_work" mirror falls through to the normal
    // fresh-start path below, since there's no live countdown to preserve.
    // See docs/session-sync-design.md §4.4.
    if !is_own(&run, &state.device_id)
        && run.active_task_id.as_deref() == Some(task_id)
        && matches!(run.phase.as_deref(), Some("work") | Some("break"))
    {
        let mut nr = run.clone();
        stamp_own(&mut nr, &state.device_id, &state.device_name);
        *run = nr;
        let _ = state.db.lock().unwrap().set_run(&run);
        return;
    }

    let baseline = as_local_baseline(&run, &state.device_id);
    let (mut nr, log) = timer::play(&baseline, task_id, now);
    stamp_own(&mut nr, &state.device_id, &state.device_name);
    *run = nr;
    let db = state.db.lock().unwrap();
    if let Some(l) = log {
        let _ = db.add_session(&l);
    }
    let _ = db.set_run(&run);
}

fn do_stop(state: &AppState) {
    do_stop_at(state, now_ms());
}

/// Same as `do_stop`, but logs the work segment as ending at `at_ms` instead
/// of "right now". Used when we detect the machine was asleep: the session
/// gets closed out at the last moment we know it was actually awake, so the
/// time spent asleep never gets counted as tracked work.
fn do_stop_at(state: &AppState, at_ms: i64) {
    let mut run = state.run.lock().unwrap();
    let baseline = as_local_baseline(&run, &state.device_id);
    let (mut nr, log) = timer::stop(&baseline, at_ms);
    stamp_own(&mut nr, &state.device_id, &state.device_name);
    *run = nr;
    let db = state.db.lock().unwrap();
    if let Some(l) = log {
        let _ = db.add_session(&l);
    }
    let _ = db.set_run(&run);
}

/// Persists the refresh token, remembers the access token (+ its expiry) in
/// memory, and caches the profile. Shared by the sign-in callback, the
/// startup silent refresh, and every later proactive/reactive re-refresh —
/// none of those besides sign-in should also trigger a sync themselves (see
/// `apply_session` for the one that does).
fn store_session(app: &AppHandle, session: auth::Session) {
    let state = app.state::<AppState>();
    if let Err(e) = auth::save_refresh_token(&state.data_dir, &session.refresh_token) {
        // Not fatal — this run stays signed in via the in-memory access
        // token; the user will just be prompted to sign in again next
        // launch if the write never succeeds (e.g. a full disk).
        log_line(format!("failed to save the refresh token: {e}"));
    }
    let expires_at_ms = now_ms() + session.expires_in.max(0) * 1000;
    *state.access_token.lock().unwrap() = Some(AccessToken {
        token: session.access_token,
        expires_at_ms,
    });
    let db = state.db.lock().unwrap();
    let _ = db.set_account(Some(&session.account));
}

/// Tail of the startup silent refresh (and any later proactive/reactive
/// re-refresh that also wants an immediate sync): store the new session,
/// then run the normal push+pull cycle. Deliberately plain last-write-wins
/// here — a silent refresh means the app was never actually signed out in
/// the interim, so there's no "local edits made while disconnected from the
/// account" scenario to guard against; it's just resuming the same session,
/// same as any other periodic sync tick. See `apply_session_login` for the
/// one case that needs different treatment.
fn apply_session(app: &AppHandle, session: auth::Session) {
    store_session(app, session);
    push(app);
    run_sync(app);
}

/// Tail of the explicit sign-in callback specifically (Google OAuth deep
/// link) — store the new session, then run the one-time authoritative,
/// pull-only login sync instead of the normal push+pull cycle.
///
/// Why this needs to differ from `apply_session`: signing out only clears
/// the auth session, never local SQLite, so any edits made while signed out
/// — including deletes — are real, newer-than-remote local writes sitting
/// there waiting. A plain `run_sync` (push-then-pull, LWW) would treat those
/// as "the latest truth" and push them straight to the server the moment you
/// sign back in, silently overwriting/tombstoning whatever's actually there.
/// `run_login_sync` skips the push and forces remote to win for this one
/// cycle, so signing in always shows you what's actually in your account.
fn apply_session_login(app: &AppHandle, session: auth::Session) {
    store_session(app, session);
    push(app);
    run_login_sync(app);
}

/// Loads the stored refresh token and exchanges it for a new session,
/// storing the result. Used both proactively (token nearing expiry) and
/// reactively (a request already came back 401). Returns the fresh access
/// token so the caller doesn't have to re-lock state to read it back.
fn do_refresh(app: &AppHandle) -> Result<String, auth::TokenRequestError> {
    let state = app.state::<AppState>();
    let refresh_token = auth::load_refresh_token(&state.data_dir)
        .ok_or_else(auth::TokenRequestError::missing_refresh_token)?;
    let session = auth::refresh_session(&refresh_token)?;
    let token = session.access_token.clone();
    store_session(app, session);
    Ok(token)
}

fn record_refresh_failure(app: &AppHandle, context: &str, error: &auth::TokenRequestError) {
    let state = app.state::<AppState>();
    if error.invalid_session() {
        log_line(format!("{context} failed; session is invalid: {error}"));
        auth::clear_refresh_token(&state.data_dir);
        *state.access_token.lock().unwrap() = None;
        state.sync_status.lock().unwrap().last_sync_error = Some(SESSION_EXPIRED_MSG.to_string());
    } else {
        log_line(format!(
            "{context} failed; will retry automatically: {error}"
        ));
        state.sync_status.lock().unwrap().last_sync_error = Some(SYNC_RETRY_MSG.to_string());
    }
    push(app);
}

/// Returns a usable access token, refreshing first if the current one is
/// missing or nearing expiry. A missing in-memory token is recoverable when
/// session.json still contains a refresh token (startup/network failures),
/// so every later sync tick retries instead of becoming a permanent no-op.
fn ensure_fresh_token(app: &AppHandle) -> Option<String> {
    let state = app.state::<AppState>();
    let current = state.access_token.lock().unwrap().clone();
    let now = now_ms();
    if let Some(current) = &current {
        if now < current.expires_at_ms - REFRESH_SKEW_MS {
            return Some(current.token.clone());
        }
    } else if auth::load_refresh_token(&state.data_dir).is_none() {
        if state.db.lock().unwrap().get_account().is_some() {
            state.sync_status.lock().unwrap().last_sync_error =
                Some(SESSION_EXPIRED_MSG.to_string());
            push(app);
        }
        return None;
    }
    match do_refresh(app) {
        Ok(token) => Some(token),
        Err(e) => {
            let can_use_current = !e.invalid_session()
                && current
                    .as_ref()
                    .is_some_and(|token| now < token.expires_at_ms);
            record_refresh_failure(app, "proactive token refresh", &e);
            can_use_current.then(|| current.unwrap().token)
        }
    }
}

/// Runs one push+pull cycle if signed in; no-ops silently otherwise. Safe to
/// call from a background thread (it blocks on network I/O) — every caller
/// here already runs on one, never the main/event thread.
fn run_sync(app: &AppHandle) {
    let state = app.state::<AppState>();
    let Some(mut access_token) = ensure_fresh_token(app) else {
        return;
    };
    let Some(user_id) = state.db.lock().unwrap().get_account().map(|a| a.id) else {
        return;
    };

    state.sync_status.lock().unwrap().syncing = true;
    push(app);

    let mut result = {
        let db = state.db.lock().unwrap();
        sync::sync_once(&db, &access_token, &user_id)
    };

    // The proactive refresh above covers the common case, but if the token
    // was revoked, clock-skewed, or expired mid-request anyway, treat a 401
    // as one last chance: refresh and retry once before giving up.
    if matches!(&result, Err(e) if e.contains("HTTP 401")) {
        match do_refresh(app) {
            Ok(new_token) => {
                access_token = new_token;
                let db = state.db.lock().unwrap();
                result = sync::sync_once(&db, &access_token, &user_id);
            }
            Err(e) => {
                // The server already rejected this access token. On a
                // transient refresh failure, drop only the access token;
                // the saved refresh token remains and the next sync retries.
                let invalid_session = e.invalid_session();
                if !invalid_session {
                    *state.access_token.lock().unwrap() = None;
                }
                record_refresh_failure(app, "token refresh after 401", &e);
                result = Err(if invalid_session {
                    SESSION_EXPIRED_MSG
                } else {
                    SYNC_RETRY_MSG
                }
                .to_string());
            }
        }
    }

    {
        let mut status = state.sync_status.lock().unwrap();
        status.syncing = false;
        match &result {
            // Only a real success moves "last synced" forward and clears any
            // prior error — this used to run unconditionally, so the UI's
            // "Synced just now" looked identical whether sync was working or
            // silently failing every single cycle.
            Ok(_) => {
                status.last_synced_at = Some(now_ms());
                status.last_sync_error = None;
            }
            Err(e) => {
                status.last_sync_error = Some(e.clone());
            }
        }
    }

    if let Err(e) = &result {
        log_line(format!("sync failed: {e}"));
    }
    // Regardless of push/pull outcome above: `sync::pull` (inside
    // `sync_once`) writes a newer remote `run_state` row straight to `Db`,
    // bypassing the in-memory `state.run` every command handler and the tick
    // loop actually use — reconcile the two now so a session taken over on
    // another device shows up here without needing an app restart. See
    // `reconcile_run_after_sync`'s doc comment.
    reconcile_run_after_sync(state.inner());
    reconcile_config_after_sync(state.inner());
    push(app);
}

/// Companion to `run_sync`, used exactly once — right after a fresh explicit
/// sign-in (see `apply_session_login`). Same shape (token refresh, 401 retry,
/// sync_status bookkeeping, reconcile calls), but calls `sync::sync_login`
/// instead of `sync::sync_once`: no push, and the pull applies remote
/// unconditionally rather than only-if-newer. See `sync::sync_login`'s doc
/// comment for the full rationale.
fn run_login_sync(app: &AppHandle) {
    let state = app.state::<AppState>();
    let Some(mut access_token) = ensure_fresh_token(app) else {
        return;
    };
    // `sync_login` doesn't push, so it has no need for `user_id` — but a
    // missing local account here would still mean "not really signed in
    // yet," so keep the same guard `run_sync` uses before doing any network
    // work.
    if state.db.lock().unwrap().get_account().is_none() {
        return;
    }

    state.sync_status.lock().unwrap().syncing = true;
    push(app);

    let mut result = {
        let db = state.db.lock().unwrap();
        sync::sync_login(&db, &access_token)
    };

    // Same 401-retry-once safety net as `run_sync`.
    if matches!(&result, Err(e) if e.contains("HTTP 401")) {
        match do_refresh(app) {
            Ok(new_token) => {
                access_token = new_token;
                let db = state.db.lock().unwrap();
                result = sync::sync_login(&db, &access_token);
            }
            Err(e) => {
                let invalid_session = e.invalid_session();
                if !invalid_session {
                    *state.access_token.lock().unwrap() = None;
                }
                record_refresh_failure(app, "token refresh after 401", &e);
                result = Err(if invalid_session {
                    SESSION_EXPIRED_MSG
                } else {
                    SYNC_RETRY_MSG
                }
                .to_string());
            }
        }
    }

    {
        let mut status = state.sync_status.lock().unwrap();
        status.syncing = false;
        match &result {
            Ok(_) => {
                status.last_synced_at = Some(now_ms());
                status.last_sync_error = None;
            }
            Err(e) => {
                status.last_sync_error = Some(e.clone());
            }
        }
    }

    if let Err(e) = &result {
        log_line(format!("login sync failed: {e}"));
    }
    reconcile_run_after_sync(state.inner());
    reconcile_config_after_sync(state.inner());
    push(app);
}

// ---- commands ----
#[tauri::command]
fn get_snapshot(state: State<AppState>) -> Snapshot {
    build_snapshot(state.inner())
}

#[tauri::command]
fn add_list(app: AppHandle, state: State<AppState>, name: String) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.add_list(&name);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn rename_list(app: AppHandle, state: State<AppState>, id: String, name: String) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.rename_list(&id, &name);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn set_list_style(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    emoji: String,
    color: String,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.set_list_style(&id, &emoji, &color);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn set_list_life_tag(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    area: Option<String>,
    direction: Option<String>,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.set_list_life_tag(&id, area.as_deref(), direction.as_deref());
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn set_list_availability(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    windows: Vec<taskplayer_core::WeeklyTimeWindow>,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.set_list_availability(&id, &windows);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn delete_list(app: AppHandle, state: State<AppState>, id: String) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.delete_list(&id);
    }
    reset_run_if_orphaned(state.inner());
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn add_task(
    app: AppHandle,
    state: State<AppState>,
    list_id: String,
    name: String,
    estimate_min: Option<i64>,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.add_task(&list_id, &name, estimate_min.filter(|m| *m > 0));
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn rename_task(app: AppHandle, state: State<AppState>, id: String, name: String) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.rename_task(&id, &name);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn set_depth(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    depth: Option<String>,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.set_depth(&id, depth.as_deref());
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn set_cadence(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    cadence: Option<String>,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.set_cadence(&id, cadence.as_deref());
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn set_daily_windows(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    windows: Vec<taskplayer_core::WeeklyTimeWindow>,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.set_daily_windows(&id, &windows);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn set_session_range(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    min_minutes: Option<i64>,
    max_minutes: Option<i64>,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.set_session_range(
            &id,
            min_minutes.filter(|minutes| *minutes > 0),
            max_minutes.filter(|minutes| *minutes > 0),
        );
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn set_description(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    text: Option<String>,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let trimmed = text.as_deref().map(str::trim).filter(|s| !s.is_empty());
        let _ = db.set_description(&id, trimmed);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn set_album(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    album: Option<String>,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.set_album(&id, album.as_deref());
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn move_task(app: AppHandle, state: State<AppState>, id: String, list_id: String) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.move_task(&id, &list_id);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn reorder_tasks(
    app: AppHandle,
    state: State<AppState>,
    list_id: String,
    ordered_ids: Vec<String>,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.reorder_tasks(&list_id, &ordered_ids);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn reorder_lists(app: AppHandle, state: State<AppState>, ordered_ids: Vec<String>) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.reorder_lists(&ordered_ids);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn reorder_life_areas(
    app: AppHandle,
    state: State<AppState>,
    ordered_area_keys: Vec<String>,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.reorder_life_areas(&ordered_area_keys);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn set_done(app: AppHandle, state: State<AppState>, id: String) -> Snapshot {
    // completing the active task stops its timer first (logs the segment).
    // The `is_active` bool must be computed in its own `let` statement —
    // binding it here drops the `state.run` MutexGuard immediately. Inlining
    // the lock directly into the `if` condition would keep that temporary
    // guard alive for the whole if-body (Rust extends a temporary's scope to
    // the enclosing statement, which for `if cond { block }` used as a
    // statement is the entire construct), so `do_stop`'s own `state.run.lock()`
    // below would deadlock against itself whenever the task being completed
    // is the one currently running.
    let is_active = state.run.lock().unwrap().active_task_id.as_deref() == Some(id.as_str());
    if is_active {
        do_stop(state.inner());
    }
    {
        let db = state.db.lock().unwrap();
        let already = db
            .tasks()
            .unwrap_or_default()
            .into_iter()
            .find(|t| t.id == id)
            .and_then(|t| t.completed_at)
            .is_some();
        let _ = db.set_completed(&id, if already { None } else { Some(now_ms()) });
    }
    // don't leave a completed task lingering as the "remembered" one
    {
        let mut run = state.run.lock().unwrap();
        if run.last_task_id.as_deref() == Some(id.as_str()) {
            run.last_task_id = None;
            let db = state.db.lock().unwrap();
            let _ = db.set_run(&run);
        }
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn set_estimate(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    minutes: Option<i64>,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.set_estimate(&id, minutes.filter(|m| *m > 0));
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn set_deadline(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    deadline_at: Option<i64>,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.set_deadline(&id, deadline_at);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn set_task_impact(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    tier: Option<String>,
    sign: i64,
) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        // Sign only ever comes from the frontend's own 2-button toggle
        // (for/against — see the Impact & areas editor in render.js), so
        // clamping here rather than trusting it verbatim keeps a stray
        // value (0, a typo'd payload, etc.) from silently zeroing out every
        // jewel computation downstream instead of just doing nothing.
        let sign = if sign < 0 { -1 } else { 1 };
        let _ = db.set_task_impact(&id, tier.as_deref(), sign);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn add_session(
    app: AppHandle,
    state: State<AppState>,
    task_id: String,
    start: i64,
    end: i64,
) -> Snapshot {
    if end > start {
        let db = state.db.lock().unwrap();
        let _ = db.add_session(&taskplayer_core::SessionLog {
            task_id,
            start,
            end,
        });
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn delete_session(app: AppHandle, state: State<AppState>, id: String) -> Snapshot {
    {
        let db = state.db.lock().unwrap();
        let _ = db.delete_session(&id);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn update_session(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    start: i64,
    end: i64,
) -> Snapshot {
    if end > start {
        let db = state.db.lock().unwrap();
        let _ = db.update_session(&id, start, end);
    }
    push(&app);
    build_snapshot(state.inner())
}

// ---- data export / import ----
#[derive(serde::Serialize)]
struct Backup {
    app: &'static str,
    version: u32,
    #[serde(rename = "exportedAt")]
    exported_at: i64,
    lists: Vec<TaskList>,
    tasks: Vec<Task>,
    sessions: Vec<Session>,
    config: SessionConfig,
}

#[derive(serde::Deserialize)]
struct RestorePayload {
    lists: Vec<TaskList>,
    tasks: Vec<Task>,
    sessions: Vec<Session>,
    config: Option<SessionConfig>,
}

/// Serialize all data to a JSON backup in ~/Downloads and reveal it in Finder.
/// Returns the written file path.
#[tauri::command]
fn export_data(state: State<AppState>) -> Result<String, String> {
    let backup = {
        let db = state.db.lock().unwrap();
        Backup {
            app: "TaskPlayer",
            version: 1,
            exported_at: now_ms(),
            lists: db.lists().map_err(|e| e.to_string())?,
            tasks: db.tasks().map_err(|e| e.to_string())?,
            sessions: db.sessions().map_err(|e| e.to_string())?,
            config: db.get_config(),
        }
    };
    let json = serde_json::to_string_pretty(&backup).map_err(|e| e.to_string())?;

    let home = std::env::var("HOME").ok().map(PathBuf::from);
    let dir = home
        .as_ref()
        .map(|h| h.join("Downloads"))
        .filter(|d| d.exists())
        .or(home)
        .unwrap_or_else(std::env::temp_dir);
    let path = dir.join(format!("TaskPlayer-backup-{}.json", now_ms()));
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    let _ = std::process::Command::new("open")
        .arg("-R")
        .arg(&path)
        .status();
    Ok(path.to_string_lossy().into_owned())
}

/// Reveals `taskplayer.log` in Finder (creating an empty one first if
/// nothing's been logged yet), the same "open -R" pattern export_data uses —
/// so "attach your logs to a bug report" is a single click in Settings
/// instead of "go find ~/Library/Logs yourself." Returns the path so the
/// frontend can show it, in case Finder itself doesn't grab focus.
#[tauri::command]
fn reveal_logs() -> Result<String, String> {
    std::fs::create_dir_all(log_dir()).map_err(|e| e.to_string())?;
    let path = log_file_path();
    if !path.exists() {
        std::fs::write(&path, "").map_err(|e| e.to_string())?;
    }
    let _ = std::process::Command::new("open")
        .arg("-R")
        .arg(&path)
        .status();
    Ok(path.to_string_lossy().into_owned())
}

/// Replace all data from a backup JSON string. Clears the run state so nothing
/// is left "playing" against tasks that may no longer exist.
#[tauri::command]
fn import_data(
    app: AppHandle,
    state: State<AppState>,
    payload: String,
) -> Result<Snapshot, String> {
    let data: RestorePayload = serde_json::from_str(&payload)
        .map_err(|_| "That doesn't look like a TaskPlayer backup file.".to_string())?;
    {
        let db = state.db.lock().unwrap();
        db.import_replace(
            &data.lists,
            &data.tasks,
            &data.sessions,
            data.config.as_ref(),
        )
        .map_err(|e| e.to_string())?;
    }
    {
        let mut run = state.run.lock().unwrap();
        *run = RunState::default();
        let db = state.db.lock().unwrap();
        let _ = db.set_run(&run);
    }
    {
        // As in `build_snapshot`, do not hold `db` while taking `config`:
        // settings commands persist in config -> db order.
        let imported_config = state.db.lock().unwrap().get_config();
        *state.config.lock().unwrap() = imported_config;
    }
    push(&app);
    Ok(build_snapshot(state.inner()))
}

#[tauri::command]
fn delete_task(app: AppHandle, state: State<AppState>, id: String) -> Snapshot {
    // see the comment in `set_done` — this bool must be its own `let`
    // statement so the `state.run` guard drops before `do_stop` re-locks it.
    let is_active = state.run.lock().unwrap().active_task_id.as_deref() == Some(id.as_str());
    if is_active {
        do_stop(state.inner());
    }
    {
        let db = state.db.lock().unwrap();
        let _ = db.delete_task(&id);
    }
    reset_run_if_orphaned(state.inner());
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn play(app: AppHandle, state: State<AppState>, task_id: String) -> Snapshot {
    do_play(state.inner(), &task_id);
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn stop(app: AppHandle, state: State<AppState>) -> Snapshot {
    do_stop(state.inner());
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn skip_break(app: AppHandle, state: State<AppState>) -> Snapshot {
    {
        let now = now_ms();
        let mut run = state.run.lock().unwrap();
        let baseline = as_local_baseline(&run, &state.device_id);
        let mut nr = timer::skip_break(&baseline, now);
        stamp_own(&mut nr, &state.device_id, &state.device_name);
        *run = nr;
        let db = state.db.lock().unwrap();
        let _ = db.set_run(&run);
    }
    push(&app);
    build_snapshot(state.inner())
}

/// Backward-compatible recovery for an `awaiting_break` state written by app
/// versions that paused at Pomodoro boundaries. New cycles start breaks in
/// `timer::tick` and never need this command.
#[tauri::command]
fn start_break(app: AppHandle, state: State<AppState>) -> Snapshot {
    {
        let now = now_ms();
        let mut run = state.run.lock().unwrap();
        let baseline = as_local_baseline(&run, &state.device_id);
        let mut nr = timer::start_break(&baseline, now);
        stamp_own(&mut nr, &state.device_id, &state.device_name);
        *run = nr;
        let db = state.db.lock().unwrap();
        let _ = db.set_run(&run);
    }
    push(&app);
    build_snapshot(state.inner())
}

/// Backward-compatible recovery for an `awaiting_work` state written by app
/// versions that paused at Pomodoro boundaries. New cycles resume work in
/// `timer::tick`; `skip_break` remains the normal early-break action.
#[tauri::command]
fn resume_work(app: AppHandle, state: State<AppState>) -> Snapshot {
    {
        let now = now_ms();
        let mut run = state.run.lock().unwrap();
        let baseline = as_local_baseline(&run, &state.device_id);
        let mut nr = timer::skip_break(&baseline, now);
        stamp_own(&mut nr, &state.device_id, &state.device_name);
        *run = nr;
        let db = state.db.lock().unwrap();
        let _ = db.set_run(&run);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn set_mode(app: AppHandle, state: State<AppState>, mode: String) -> Snapshot {
    {
        let mut c = state.config.lock().unwrap();
        c.mode = mode;
        c.updated_at = now_ms();
        let db = state.db.lock().unwrap();
        let _ = db.set_config(&c);
    }
    push(&app);
    build_snapshot(state.inner())
}

#[tauri::command]
fn set_config_field(app: AppHandle, state: State<AppState>, key: String, value: i64) -> Snapshot {
    {
        let mut c = state.config.lock().unwrap();
        match key.as_str() {
            "targetMin" => c.target_min = value.clamp(1, 240),
            "workMin" => c.work_min = value.clamp(1, 120),
            "breakMin" => c.break_min = value.clamp(1, 60),
            "cyclesBeforeLongBreak" => c.cycles_before_long_break = value.clamp(1, 12),
            "longBreakMin" => c.long_break_min = value.clamp(1, 60),
            // Checkbox-valued: the frontend sends 1/0. Device-local (never
            // pushed to the remote config row — see models.rs), but stored
            // in the same config blob; the updated_at bump below is harmless.
            "hourlyNudge" => c.hourly_nudge = value != 0,
            _ => {}
        }
        // Cross-device settings sync (see docs/session-sync-design.md's
        // singleton-row pattern, reused here for `config`) — bump this on
        // every actual change so the next push cycle picks it up. Harmless
        // to bump even on the `_ => {}` no-op-key case; not worth a second
        // branch just to skip a timestamp write for a key that was already
        // rejected before touching any real field.
        c.updated_at = now_ms();
        let db = state.db.lock().unwrap();
        let _ = db.set_config(&c);
    }
    push(&app);
    build_snapshot(state.inner())
}

/// Same shape as `set_config_field`, split out because the two sound pickers
/// are string-valued (a system sound name) rather than the clamped integers
/// every other pomodoro setting uses. Falls back silently to the existing
/// value for anything not in `SOUND_OPTIONS` — the picker only ever sends one
/// of those, so this only guards against a stale/tampered frontend value.
#[tauri::command]
fn set_config_sound(
    app: AppHandle,
    state: State<AppState>,
    key: String,
    value: String,
) -> Snapshot {
    {
        let mut c = state.config.lock().unwrap();
        if SOUND_OPTIONS.contains(&value.as_str()) {
            match key.as_str() {
                "breakSound" => c.break_sound = value,
                "workSound" => c.work_sound = value,
                _ => {}
            }
            c.updated_at = now_ms();
        }
        let db = state.db.lock().unwrap();
        let _ = db.set_config(&c);
    }
    push(&app);
    build_snapshot(state.inner())
}

/// Opens the system browser to Google's consent screen and returns
/// immediately — the deep-link callback (registered in `setup()`) drives
/// the rest of the flow asynchronously and calls `push()` once signed in.
#[tauri::command]
fn sign_in_google(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    let pkce = auth::generate_pkce();
    let url = auth::authorize_url(&pkce);
    *state.pending_pkce.lock().unwrap() = Some(pkce);
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn sign_out(app: AppHandle, state: State<AppState>) -> Snapshot {
    auth::clear_refresh_token(&state.data_dir);
    *state.access_token.lock().unwrap() = None;
    *state.sync_status.lock().unwrap() = SyncStatus::default();
    {
        let db = state.db.lock().unwrap();
        let _ = db.set_account(None::<&AccountInfo>);
    }
    push(&app);
    build_snapshot(state.inner())
}

/// Fire-and-forget, like `sign_in_google` — the eventual `push()`/`refresh()`
/// inside `run_sync` notifies the frontend once the sync finishes.
#[tauri::command]
fn sync_now(app: AppHandle) {
    // Always enter run_sync: an absent in-memory access token may only mean
    // startup refresh happened while offline. `ensure_fresh_token` retries
    // the saved refresh token and distinguishes that from an expired login.
    std::thread::spawn(move || run_sync(&app));
}

/// Resets both cursors to the epoch so the next `run_sync` re-pulls (and
/// re-pushes) everything from scratch, instead of trusting the incremental
/// `updated_at > cursor` watermarks. Safe to run any time — every apply on
/// either side is an idempotent upsert (`ON CONFLICT ... WHERE
/// excluded.updated_at > x.updated_at`), so re-sending rows that are already
/// in sync is just wasted bandwidth, never a correctness problem. Shared by
/// the manual "Full sync" button and the hourly automatic safety net.
fn reset_sync_cursors(state: &AppState) {
    let db = state.db.lock().unwrap();
    let _ = db.set_push_cursor(0);
    let _ = db.set_pull_cursor(0);
}

/// Escape hatch for exactly the "other device's row never showed up" case —
/// see `reset_sync_cursors`.
#[tauri::command]
fn full_sync(app: AppHandle) {
    let state = app.state::<AppState>();
    reset_sync_cursors(state.inner());
    std::thread::spawn(move || run_sync(&app));
}

#[tauri::command]
fn open_main(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Curated set of classic macOS system sound names — these ship with every
/// Mac (`/System/Library/Sounds/*.aiff`) and are what `NotificationBuilder::sound`
/// resolves by name, so there's nothing to bundle. Shared with the frontend via
/// `sound_options()` so the Settings picker can never drift out of sync with
/// what the backend actually accepts.
const SOUND_OPTIONS: &[&str] = &[
    "Basso",
    "Blow",
    "Bottle",
    "Frog",
    "Funk",
    "Glass",
    "Hero",
    "Morse",
    "Ping",
    "Pop",
    "Purr",
    "Sosumi",
    "Submarine",
    "Tink",
];

#[tauri::command]
fn sound_options() -> Vec<&'static str> {
    SOUND_OPTIONS.to_vec()
}

#[derive(Debug)]
struct ScheduleNotice {
    key: String,
    title: String,
    body: String,
}

fn local_time_ms(date: NaiveDate, minute: i64) -> Option<i64> {
    let hour = u32::try_from(minute.div_euclid(60)).ok()?;
    let minute = u32::try_from(minute.rem_euclid(60)).ok()?;
    let local = date.and_hms_opt(hour, minute, 0)?;
    Local
        .from_local_datetime(&local)
        .earliest()
        .map(|value| value.timestamp_millis())
}

fn daily_occurrence_is_done(task: &Task, sessions: &[Session], event: &ScheduleEvent) -> bool {
    // `completed_at` is still what the current checkbox command writes. A
    // daily session is the newer per-day completion signal. Accepting either
    // keeps reminders consistent with both existing UI paths.
    if task.completed_at.is_some() {
        return true;
    }
    let Some(day_start) = local_time_ms(event.occurrence_date, 0) else {
        return false;
    };
    let end_date = if event.end_minute < event.start_minute {
        event.occurrence_date.checked_add_days(Days::new(1))
    } else {
        Some(event.occurrence_date)
    };
    let Some(end) = end_date.and_then(|date| local_time_ms(date, event.end_minute)) else {
        return false;
    };
    sessions.iter().any(|session| {
        session.task_id == task.id && session.start >= day_start && session.start <= end
    })
}

fn collect_schedule_notices(state: &AppState, now: i64) -> Vec<ScheduleNotice> {
    // The one-second timer does not need to read SQLite every second for
    // minute-granularity reminders. Ten seconds still gives six chances to
    // observe each boundary (including shortly after a sync completes).
    {
        let mut notify = state.session_notify.lock().unwrap();
        let bucket = now.div_euclid(10_000);
        if notify.schedule_checked_bucket == Some(bucket) {
            return Vec::new();
        }
        notify.schedule_checked_bucket = Some(bucket);
        notify
            .schedule_fired
            .retain(|_, fired_at| now - *fired_at < 8 * 24 * 60 * 60 * 1000);
    }

    let run = state.run.lock().unwrap().clone();
    let (lists, tasks, sessions, signed_in) = {
        let db = state.db.lock().unwrap();
        (
            db.lists().unwrap_or_default(),
            db.tasks().unwrap_or_default(),
            db.sessions().unwrap_or_default(),
            db.get_account().is_some(),
        )
    };

    // For signed-in accounts, the most recent session-owning device is the
    // notification leader. This reuses the already-synced run ownership and
    // avoids the same reminder appearing on every signed-in Mac.
    if signed_in && run.device_id.as_deref() != Some(state.device_id.as_str()) {
        return Vec::new();
    }

    let Some(local_now) = Local.timestamp_millis_opt(now).single() else {
        return Vec::new();
    };
    let minute = i64::from(local_now.hour()) * 60 + i64::from(local_now.minute());
    let events = due_schedule_events(local_now.date_naive(), minute, &lists, &tasks);
    let mut notices = Vec::new();

    for event in events {
        match event.kind {
            ScheduleEventKind::DailyStarting | ScheduleEventKind::DailyEnding => {
                let Some(task) = tasks.iter().find(|task| task.id == event.entity_id) else {
                    continue;
                };
                if daily_occurrence_is_done(task, &sessions, &event) {
                    continue;
                }
                let (title, body) = match event.kind {
                    ScheduleEventKind::DailyStarting => (
                        format!("{} starts in 5 minutes", task.name),
                        "Open TaskPlayer when you're ready.".to_string(),
                    ),
                    ScheduleEventKind::DailyEnding => (
                        format!("{} time has ended", task.name),
                        "Open TaskPlayer to mark it complete.".to_string(),
                    ),
                    _ => unreachable!(),
                };
                notices.push(ScheduleNotice {
                    key: event.key,
                    title,
                    body,
                });
            }
            ScheduleEventKind::ListStarting => {
                let Some(list) = lists.iter().find(|list| list.id == event.entity_id) else {
                    continue;
                };
                let Some(task) = tasks
                    .iter()
                    .filter(|task| {
                        task.list_id == list.id
                            && task.cadence.as_deref() != Some("daily")
                            && task.completed_at.is_none()
                    })
                    .min_by_key(|task| task.order)
                else {
                    continue;
                };
                notices.push(ScheduleNotice {
                    key: event.key,
                    title: format!("{} time starts in 5 minutes", list.name),
                    body: format!("{} is ready.", task.name),
                });
            }
            ScheduleEventKind::ListEnding => {
                if run.phase.as_deref() != Some("work") {
                    continue;
                }
                let Some(task) = run
                    .active_task_id
                    .as_deref()
                    .and_then(|id| tasks.iter().find(|task| task.id == id))
                else {
                    continue;
                };
                if task.list_id != event.entity_id {
                    continue;
                }
                let list_name = lists
                    .iter()
                    .find(|list| list.id == event.entity_id)
                    .map(|list| list.name.as_str())
                    .unwrap_or("This list");
                notices.push(ScheduleNotice {
                    key: event.key,
                    title: format!("{list_name} time ends in 5 minutes"),
                    body: format!("Wrap up {}.", task.name),
                });
            }
        }
    }

    let mut notify = state.session_notify.lock().unwrap();
    notices.retain(|notice| {
        if notify.schedule_fired.contains_key(&notice.key) {
            false
        } else {
            notify.schedule_fired.insert(notice.key.clone(), now);
            true
        }
    });
    notices
}

/// Mirrors the focus-music widget's play/pause state into Rust purely so the
/// tray's music toggle can show the right label — the actual `<audio>`
/// element lives in the webview (music.js), Rust never touches it directly.
/// The frontend calls this every time window.Music's own state changes.
#[tauri::command]
fn set_music_playing(app: AppHandle, state: State<AppState>, playing: bool) -> Snapshot {
    *state.music_playing.lock().unwrap() = playing;
    push(&app);
    build_snapshot(state.inner())
}

/// Opens a URL in the system's default browser — used by the in-app "View on
/// Audius" button (a plain `<a href>` would just navigate the app's own
/// webview away instead).
#[tauri::command]
fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateInfo {
    version: String,
    notes: Option<String>,
}

/// Asks the configured endpoint (Casks/taskplayer.rb's own GitHub Releases —
/// see `scripts/release.sh`) whether a newer signed build exists. Stashes the
/// `Update` handle (it carries the download URL + signature) in `AppState`
/// so `install_update` doesn't have to re-check; the frontend only ever
/// sees the plain version/notes, never the handle itself.
#[tauri::command]
async fn check_for_update(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<UpdateInfo>, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    match updater.check().await.map_err(|e| e.to_string())? {
        Some(update) => {
            let info = UpdateInfo {
                version: update.version.clone(),
                notes: update.body.clone(),
            };
            *state.pending_update.lock().unwrap() = Some(update);
            Ok(Some(info))
        }
        None => {
            *state.pending_update.lock().unwrap() = None;
            Ok(None)
        }
    }
}

/// Same check as `check_for_update`, but run unattended from the 4-hourly
/// background loop (see the timer setup below) instead of the Settings page.
/// Stashes the handle exactly like the manual path (so "Install" from a
/// notification's follow-up Settings visit works without re-checking), but
/// additionally fires a system notification — gated on
/// `last_notified_update_version` so the same release doesn't re-notify
/// every cycle until the user updates or a newer version ships.
async fn check_for_update_background(app: &AppHandle) {
    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => {
            log_line(format!("background update check: updater() failed: {e}"));
            return;
        }
    };
    let update = match updater.check().await {
        Ok(u) => u,
        Err(e) => {
            log_line(format!("background update check failed: {e}"));
            return;
        }
    };
    let state = app.state::<AppState>();
    let Some(update) = update else {
        *state.pending_update.lock().unwrap() = None;
        return;
    };
    let version = update.version.clone();
    let already_notified = state
        .last_notified_update_version
        .lock()
        .unwrap()
        .as_deref()
        == Some(version.as_str());
    *state.pending_update.lock().unwrap() = Some(update.clone());
    if already_notified {
        return;
    }
    *state.last_notified_update_version.lock().unwrap() = Some(version.clone());
    let notif_app = app.clone();
    let _ = app.run_on_main_thread(move || {
        match notif_app
            .notification()
            .builder()
            .title("TaskPlayer update available")
            .body(format!(
                "Version {version} is ready — open Settings to install."
            ))
            .show()
        {
            Ok(()) => {}
            Err(e) => log_line(format!(
                "notification show() failed (update available): {e}"
            )),
        }
    });
}

/// Downloads + installs whatever `check_for_update` last found, then
/// restarts. Errors (network drop mid-download, signature mismatch, disk
/// full) surface to the Settings page instead of leaving the app in a half
/// -updated state; nothing here touches the user's data — `AppState`'s SQLite
/// handle is untouched by the app-bundle swap, which is the whole point of
/// updating the .app rather than reinstalling.
#[tauri::command]
async fn install_update(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let update = state
        .pending_update
        .lock()
        .unwrap()
        .take()
        .ok_or_else(|| "No update ready to install — check for updates again.".to_string())?;
    update
        .download_and_install(|_chunk_len, _total_len| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    app.restart();
}

/// After a delete, drop any run-state references to tasks that no longer exist:
/// reset entirely if the active task is gone, and forget the remembered task if
/// it's gone (so the paused player doesn't point at a ghost).
fn reset_run_if_orphaned(state: &AppState) {
    let ids: Vec<String> = state
        .db
        .lock()
        .unwrap()
        .tasks()
        .map(|t| t.into_iter().map(|x| x.id).collect())
        .unwrap_or_default();
    let mut run = state.run.lock().unwrap();
    let mut changed = false;
    if let Some(id) = run.active_task_id.clone() {
        if !ids.contains(&id) {
            *run = RunState::default();
            changed = true;
        }
    }
    if let Some(id) = run.last_task_id.clone() {
        if !ids.contains(&id) {
            run.last_task_id = None;
            changed = true;
        }
    }
    if changed {
        // Stamp + push this cleanup like any other local mutation — without
        // it, deleting a task that was the *account's* active session (e.g.
        // one another device started) would clear it here but never tell
        // the owning device to stop, since an unstamped RunState never
        // looks dirty to the sync loop (see `RunState::updated_at`'s doc
        // comment in models.rs).
        stamp_own(&mut run, &state.device_id, &state.device_name);
        let _ = state.db.lock().unwrap().set_run(&run);
    }
}

/// Build the tray dropdown: current task, Play/Pause, the last 3 recently-played
/// tasks (click to switch), then Open / Quit. Rebuilt on every state change.
fn build_tray_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let state = app.state::<AppState>();
    let active = state.run.lock().unwrap().active_task_id.clone();
    let tasks = state.db.lock().unwrap().tasks().unwrap_or_default();
    let lists = state.db.lock().unwrap().lists().unwrap_or_default();
    let recent = state.db.lock().unwrap().recent_task_ids(12);

    let mut owned: Vec<Box<dyn IsMenuItem<tauri::Wry>>> = Vec::new();

    if let Some(id) = &active {
        if let Some(t) = tasks.iter().find(|x| &x.id == id) {
            owned.push(Box::new(MenuItem::with_id(
                app,
                "current",
                format!("♪  {}", t.name),
                false,
                None::<&str>,
            )?));
        }
    }
    owned.push(Box::new(MenuItem::with_id(
        app,
        "toggle",
        if active.is_some() { "Pause" } else { "Play" },
        true,
        None::<&str>,
    )?));

    // Focus-music controls — separate from the task Play/Pause above, since
    // the ambient music and the work timer are two different things a
    // person might want to control independently from the tray.
    owned.push(Box::new(PredefinedMenuItem::separator(app)?));
    let music_on = *state.music_playing.lock().unwrap();
    owned.push(Box::new(MenuItem::with_id(
        app,
        "music_toggle",
        if music_on {
            "⏸  Pause music"
        } else {
            "▶  Play music"
        },
        true,
        None::<&str>,
    )?));
    owned.push(Box::new(MenuItem::with_id(
        app,
        "music_next",
        "⏭  Next track",
        true,
        None::<&str>,
    )?));

    // up to 5 recently played, skipping the current and completed tasks
    let mut recents: Vec<&Task> = Vec::new();
    for id in &recent {
        if Some(id) == active.as_ref() {
            continue;
        }
        if let Some(t) = tasks.iter().find(|x| &x.id == id) {
            if t.completed_at.is_none() {
                recents.push(t);
            }
        }
        if recents.len() >= 5 {
            break;
        }
    }
    if !recents.is_empty() {
        owned.push(Box::new(PredefinedMenuItem::separator(app)?));
        owned.push(Box::new(MenuItem::with_id(
            app,
            "rec_hd",
            "Recently played",
            false,
            None::<&str>,
        )?));
        for t in &recents {
            let emoji = lists
                .iter()
                .find(|l| l.id == t.list_id)
                .map(|l| l.emoji.as_str())
                .unwrap_or("");
            owned.push(Box::new(MenuItem::with_id(
                app,
                format!("recent:{}", t.id),
                format!("{}  {}", emoji, t.name),
                true,
                None::<&str>,
            )?));
        }
    }

    owned.push(Box::new(PredefinedMenuItem::separator(app)?));
    owned.push(Box::new(MenuItem::with_id(
        app,
        "open",
        "Open TaskPlayer",
        true,
        None::<&str>,
    )?));
    owned.push(Box::new(PredefinedMenuItem::separator(app)?));
    owned.push(Box::new(PredefinedMenuItem::quit(
        app,
        Some("Quit TaskPlayer"),
    )?));

    let refs: Vec<&dyn IsMenuItem<tauri::Wry>> = owned.iter().map(|b| b.as_ref()).collect();
    Menu::with_items(app, &refs)
}

fn main() {
    install_panic_hook();
    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // Ask for notification permission once, up front, rather than
            // waiting for the first pomodoro transition to trigger the OS
            // prompt — that would eat the very first "break time" ping
            // while the user is mid-dialog. Logged (not discarded) because
            // a denied/unsupported result is the single most likely reason
            // a user sees no banner at all, and this is otherwise invisible
            // outside a debugger.
            match app.notification().request_permission() {
                Ok(state) => log_line(format!("notification permission state: {state:?}")),
                Err(e) => log_line(format!("notification permission request failed: {e}")),
            }

            // --- open the SQLite database in the OS app-data dir ---
            let dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir());
            std::fs::create_dir_all(&dir).ok();
            let db_path = dir.join("taskplayer.sqlite3");
            let db = Db::open(db_path.to_str().unwrap()).expect("failed to open database");
            let run = db.get_run();
            let config = db.get_config();
            let device_id = db.get_device_id();
            app.manage(AppState {
                db: Mutex::new(db),
                run: Mutex::new(run),
                config: Mutex::new(config),
                device_id,
                device_name: device_name(),
                pending_pkce: Mutex::new(None),
                access_token: Mutex::new(None),
                sync_status: Mutex::new(SyncStatus::default()),
                music_playing: Mutex::new(false),
                pending_update: Mutex::new(None),
                last_notified_update_version: Mutex::new(None),
                data_dir: dir.clone(),
                session_notify: Mutex::new(SessionNotify::default()),
            });

            // --- Google Sign-In: deep-link callback + silent refresh on startup ---
            {
                let handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    let Some(url) = event.urls().first().cloned() else { return };
                    let Some(code) = auth::extract_code(url.as_str()) else { return };
                    let pkce = {
                        let state = handle.state::<AppState>();
                        let taken = state.pending_pkce.lock().unwrap().take();
                        taken
                    };
                    let Some(pkce) = pkce else {
                        log_line("received an OAuth callback with no sign-in in progress — ignoring");
                        return;
                    };
                    let handle2 = handle.clone();
                    std::thread::spawn(move || match auth::exchange_code(&code, &pkce.verifier) {
                        Ok(session) => apply_session_login(&handle2, session),
                        Err(e) => log_line(format!("Google sign-in failed: {e}")),
                    });
                });
            }
            {
                let handle = app.handle().clone();
                let dir = dir.clone();
                std::thread::spawn(move || {
                    let Some(refresh_token) = auth::load_refresh_token(&dir) else { return };
                    match auth::refresh_session(&refresh_token) {
                        Ok(session) => apply_session(&handle, session),
                        Err(e) => {
                            // Invalid sessions need a new sign-in; transport
                            // failures keep the refresh token and recover on
                            // the next 60s/focus/manual sync attempt.
                            record_refresh_failure(&handle, "silent session refresh", &e);
                        }
                    }
                });
            }

            // --- menu-bar tray ---
            let menu = build_tray_menu(app.handle())?;

            // The icon is colored by run state (green = focus session running,
            // yellow = on break/awaiting, white = stopped — see refresh() below),
            // so it cannot be a macOS template image: template mode forces every
            // non-transparent pixel to the system monochrome foreground color.
            // The "(Dev)" tooltip remains the dev/release distinction.
            let tray = TrayIconBuilder::with_id("tray")
                .icon(tauri::include_image!("icons/menubar-idle.png"))
                .icon_as_template(false)
                .tooltip(if cfg!(debug_assertions) { "TaskPlayer (Dev)" } else { "TaskPlayer" })
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| {
                    let id = event.id().as_ref();
                    if let Some(task_id) = id.strip_prefix("recent:") {
                        let state = app.state::<AppState>();
                        do_play(state.inner(), task_id);
                        push(app);
                        return;
                    }
                    match id {
                    "open" => open_main(app.clone()),
                    "toggle" => {
                        let state = app.state::<AppState>();
                        let active = state.run.lock().unwrap().active_task_id.is_some();
                        if active {
                            do_stop(state.inner());
                        } else {
                            // resume the remembered task if it still exists, else the first task
                            let last = state.run.lock().unwrap().last_task_id.clone();
                            let target = {
                                let db = state.db.lock().unwrap();
                                let tasks = db.tasks().unwrap_or_default();
                                last.filter(|id| tasks.iter().any(|t| &t.id == id && t.completed_at.is_none()))
                                    .or_else(|| tasks.iter().find(|t| t.completed_at.is_none()).map(|t| t.id.clone()))
                            };
                            if let Some(id) = target {
                                do_play(state.inner(), &id);
                            }
                        }
                        push(app);
                    }
                    // The actual <audio> element lives in the webview (music.js), so
                    // Rust can't play/pause/skip it directly — just forward the
                    // intent as an event and let the frontend act on it.
                    "music_toggle" => { let _ = app.emit("music-toggle", ()); }
                    "music_next" => { let _ = app.emit("music-next", ()); }
                    _ => {}
                    }
                });
            tray.build(app)?;

            // --- 1s background loop: pomodoro transitions + tray refresh ---
            // Also doubles as sleep/wake detection: this thread is suspended
            // along with the rest of the process while the Mac is asleep, so
            // a `sleep(1000)` that comes back having taken much longer than
            // 1s means the system was actually asleep (there's no reliable,
            // dependency-free "sleep" notification otherwise). When that
            // happens, and a task was running, we stop the clock as of the
            // last tick we know was real — so the nap never gets logged as
            // work — rather than at the (much later) wake-up time.
            const SLEEP_GAP_MS: i64 = 5_000;
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut last_seen = now_ms();
                loop {
                std::thread::sleep(Duration::from_millis(1000));
                // The whole per-tick body is panic-guarded: this thread runs
                // for the entire lifetime of the app, so an unhandled panic
                // here (a bug we didn't anticipate) would otherwise silently
                // kill the loop forever — the pomodoro timer and tray would
                // just stop advancing, with nothing visible to say why. This
                // way the worst case is "one tick got skipped and logged",
                // not "the timer is now permanently broken until restart".
                guard("pomodoro tick", || {
                let state = handle.state::<AppState>();
                let now = now_ms();
                let woke_from_sleep_at = last_seen;
                let gap = now - last_seen;
                last_seen = now;

                let owned = is_own(&state.run.lock().unwrap(), &state.device_id);

                // Mirroring another device's session: never drive its FSM
                // from here — that machinery (phase transitions, session
                // logging, break/work notifications) belongs solely to the
                // device actually running it. Driving it locally too would
                // double-log completed sessions and double-fire
                // notifications. Just keep the tray/window elapsed-time
                // display live (`refresh` recomputes it straight off
                // `run.running_start`/`break_start`, which is harmless to
                // read from any device) and skip the rest of this tick.
                if !owned {
                    refresh(&handle);
                    return;
                }

                if gap > SLEEP_GAP_MS {
                    let was_working = state.run.lock().unwrap().phase.as_deref() == Some("work");
                    if was_working {
                        do_stop_at(state.inner(), woke_from_sleep_at);
                        push(&handle);
                    }
                }
                let (run, config) = {
                    (
                        state.run.lock().unwrap().clone(),
                        state.config.lock().unwrap().clone(),
                    )
                };
                let (nr, t) = timer::tick(&run, &config, now);
                let mut transitioned = false;
                match t {
                    timer::Tick::None => {}
                    timer::Tick::ToBreak(log) => {
                        // lock order run -> db (matches command handlers) to avoid deadlock
                        let run_clone = {
                            let mut r = state.run.lock().unwrap();
                            let mut nr = nr;
                            stamp_own(&mut nr, &state.device_id, &state.device_name);
                            *r = nr;
                            r.clone()
                        };
                        let name = {
                            let db = state.db.lock().unwrap();
                            let _ = db.add_session(&log);
                            let _ = db.set_run(&run_clone);
                            task_name_for_notification(&db, &log.task_id)
                        };
                        // Proactive feedback for the thing the tray/menu-bar title
                        // alone can't give you: you have to be looking at the menu
                        // bar to notice it changed. A real OS notification is the
                        // only way to find out a pomodoro phase ended while you
                        // were away from the screen.
                        //
                        // The break is already running in `run_clone`; the
                        // notification is information, not a prompt requiring
                        // another action. Never surface the main window here —
                        // the user may still be finishing a thought in
                        // hyperfocus even though break time has begun.
                        //
                        // Dispatched via run_on_main_thread — like the tray menu
                        // rebuild in push() below, macOS's notification center
                        // isn't safe to touch from a background thread, and doing
                        // so from here (a std::thread::spawn loop) was crashing
                        // the whole app the instant a pomodoro segment ended.
                        let notif_handle = handle.clone();
                        // `run_clone.long_break` was set by `timer::tick` the moment
                        // the cycle threshold was hit — substitute the long-break
                        // length/title here so the notification matches the
                        // break that just started.
                        let is_long = run_clone.long_break;
                        let break_min = if is_long { config.long_break_min } else { config.break_min };
                        let break_title = if is_long { "Long break ☕☕" } else { "Break time ☕" };
                        let break_sound = config.break_sound.clone();
                        let _ = handle.run_on_main_thread(move || {
                            match notif_handle
                                .notification()
                                .builder()
                                .title(break_title)
                                .body(format!(
                                    "Nice work on \"{name}\" — your {break_min}-minute break has started."
                                ))
                                .sound(break_sound)
                                .show()
                            {
                                Ok(()) => {}
                                Err(e) => log_line(format!("notification show() failed (ToBreak): {e}")),
                            }
                        });
                        transitioned = true;
                    }
                    timer::Tick::ToWork => {
                        let run_clone = {
                            let mut r = state.run.lock().unwrap();
                            let mut nr = nr;
                            stamp_own(&mut nr, &state.device_id, &state.device_name);
                            *r = nr;
                            r.clone()
                        };
                        let name = {
                            let db = state.db.lock().unwrap();
                            let _ = db.set_run(&run_clone);
                            run_clone
                                .active_task_id
                                .as_deref()
                                .map(|id| task_name_for_notification(&db, id))
                                .unwrap_or_else(|| "your task".to_string())
                        };
                        // Work is already running again in `run_clone`; notify
                        // without forcing the app window forward or asking for
                        // a second confirmation.
                        let notif_handle = handle.clone();
                        let work_sound = config.work_sound.clone();
                        let _ = handle.run_on_main_thread(move || {
                            match notif_handle
                                .notification()
                                .builder()
                                .title("Back to work ▶")
                                .body(format!("Break's over — \"{name}\" is running again."))
                                .sound(work_sound)
                                .show()
                            {
                                Ok(()) => {}
                                Err(e) => log_line(format!("notification show() failed (ToWork): {e}")),
                            }
                        });
                        transitioned = true;
                    }
                }
                // --- Non-pomodoro notifications: target reached + hourly check-in ---
                // Unlike the pomodoro transitions above, neither of these
                // changes the run state — target mode deliberately keeps
                // counting past the target, and open mode has no boundary at
                // all. They're pure notifications, deduped per work segment
                // via `session_notify` (keyed on `running_start`, so a new
                // session re-arms them). Both fire only while actually in
                // the "work" phase, and both go through run_on_main_thread
                // for the same macOS notification-center thread-safety
                // reason as ToBreak/ToWork above.
                if run.phase.as_deref() == Some("work") {
                    if let (Some(start), Some(task_id)) = (run.running_start, run.active_task_id.clone()) {
                        let elapsed = now - start;
                        if config.mode == "target" {
                            let already = state.session_notify.lock().unwrap().target_fired_for == Some(start);
                            if !already && elapsed >= config.target_min * 60_000 {
                                state.session_notify.lock().unwrap().target_fired_for = Some(start);
                                let name = {
                                    let db = state.db.lock().unwrap();
                                    task_name_for_notification(&db, &task_id)
                                };
                                // The bar in the UI pulses at this same moment,
                                // but only if you're looking at it — this is
                                // the away-from-screen counterpart, same
                                // rationale as the pomodoro ToBreak above.
                                // Reuses `break_sound`: it's the same "a work
                                // block just completed" moment.
                                let notif_handle = handle.clone();
                                let target_min = config.target_min;
                                let sound = config.break_sound.clone();
                                let _ = handle.run_on_main_thread(move || {
                                    match notif_handle
                                        .notification()
                                        .builder()
                                        .title("Target reached 🎯")
                                        .body(format!(
                                            "Session complete — {target_min} minutes on \"{name}\". Wrap up, or keep going: the clock's still counting."
                                        ))
                                        .sound(sound)
                                        .show()
                                    {
                                        Ok(()) => {}
                                        Err(e) => log_line(format!("notification show() failed (target reached): {e}")),
                                    }
                                });
                            }
                        } else if config.mode == "open" && config.hourly_nudge {
                            let hours = elapsed / 3_600_000;
                            let due = {
                                let sn = state.session_notify.lock().unwrap();
                                hours >= 1 && (sn.nudge_fired_for != Some(start) || sn.nudge_hours < hours)
                            };
                            if due {
                                {
                                    let mut sn = state.session_notify.lock().unwrap();
                                    sn.nudge_fired_for = Some(start);
                                    sn.nudge_hours = hours;
                                }
                                let name = {
                                    let db = state.db.lock().unwrap();
                                    task_name_for_notification(&db, &task_id)
                                };
                                // Encouragement, not an alarm: no sound, and
                                // deliberately no "you should stop" framing —
                                // just makes the elapsed time visible (open
                                // mode otherwise never says how long it's
                                // been) with a low-key care nudge.
                                let notif_handle = handle.clone();
                                let hrs = if hours == 1 { "1 hour".to_string() } else { format!("{hours} hours") };
                                let _ = handle.run_on_main_thread(move || {
                                    match notif_handle
                                        .notification()
                                        .builder()
                                        .title("Still going 💪")
                                        .body(format!(
                                            "{hrs} on \"{name}\" — you're doing great. Good moment to stand up, stretch, or grab some water."
                                        ))
                                        .show()
                                    {
                                        Ok(()) => {}
                                        Err(e) => log_line(format!("notification show() failed (hourly check-in): {e}")),
                                    }
                                });
                            }
                        }
                    }
                }
                // --- Fixed daily/list window reminders ---
                // The pure schedule engine handles local weekday boundaries
                // (including overnight windows); this shell adds mutable
                // completion/session filters and displays the resulting cues.
                for notice in collect_schedule_notices(state.inner(), now) {
                    let notif_handle = handle.clone();
                    let _ = handle.run_on_main_thread(move || {
                        match notif_handle
                            .notification()
                            .builder()
                            .title(notice.title)
                            .body(notice.body)
                            .show()
                        {
                            Ok(()) => {}
                            Err(e) => log_line(format!(
                                "notification show() failed (schedule reminder): {e}"
                            )),
                        }
                    });
                }
                if transitioned {
                    push(&handle);
                } else {
                    refresh(&handle);
                }
                });
                }
            });

            // --- 60s background loop: push/pull sync when signed in ---
            // Separate from the 1s loop above on purpose — that one is
            // tuned for a snappy pomodoro/tray refresh; this one does
            // blocking network I/O and would be wasteful (and rate-limit-y)
            // to run every second.
            let sync_handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_secs(60));
                guard("60s sync loop", || run_sync(&sync_handle));
            });

            // --- hourly background loop: full resync safety net ---
            // The 60s loop above is incremental (`updated_at > cursor`) —
            // fast, but with one known edge case: a row created on another
            // device can be pushed *after* this device already advanced its
            // pull_cursor past that row's timestamp (see `PULL_REWIND_MS` in
            // sync.rs). The 5-minute rewind window there closes the common
            // case; this is the broader safety net for anything that still
            // slips through, without requiring the user to remember the
            // manual "Full sync" button exists. Silent no-op while signed
            // out, same as the regular 60s sync — this runs unattended, so
            // it shouldn't surface anything the user didn't ask for.
            let full_sync_handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_secs(60 * 60));
                guard("hourly full-resync loop", || {
                    let state = full_sync_handle.state::<AppState>();
                    if state.access_token.lock().unwrap().is_some()
                        || auth::load_refresh_token(&state.data_dir).is_some()
                    {
                        reset_sync_cursors(state.inner());
                    }
                    run_sync(&full_sync_handle);
                });
            });

            // --- 4-hourly background loop: check for app updates ---
            // The launch-time check (main.js, 4s after boot) covers "did I
            // relaunch after you shipped a release" but nothing else — most
            // users leave the app running for days at a stretch (it's a
            // menu-bar timer). This is the same cadence Chrome/VS Code use
            // for background update polling: frequent enough that a release
            // reaches everyone within a few hours, far below GitHub's
            // unauthenticated rate limit (60 req/hr/IP) even accounting for
            // the launch check and any manual Settings clicks.
            let update_handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_secs(60 * 60 * 4));
                guard("4h update-check loop", || {
                    tauri::async_runtime::block_on(check_for_update_background(&update_handle));
                });
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            // keep the app alive in the menu bar when the main window is closed
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
            // Catches "I switched to my other laptop and back" without
            // shortening the 60s baseline interval for everyone else.
            if let WindowEvent::Focused(true) = event {
                let handle = window.app_handle().clone();
                std::thread::spawn(move || run_sync(&handle));
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_snapshot,
            add_list,
            rename_list,
            set_list_style,
            set_list_life_tag,
            set_list_availability,
            reorder_lists,
            reorder_life_areas,
            delete_list,
            add_task,
            rename_task,
            set_depth,
            set_cadence,
            set_daily_windows,
            set_session_range,
            set_estimate,
            set_deadline,
            set_task_impact,
            set_done,
            set_description,
            set_album,
            move_task,
            reorder_tasks,
            delete_task,
            add_session,
            update_session,
            delete_session,
            export_data,
            reveal_logs,
            import_data,
            play,
            stop,
            skip_break,
            start_break,
            resume_work,
            set_mode,
            set_config_field,
            set_config_sound,
            sound_options,
            sign_in_google,
            sign_out,
            sync_now,
            full_sync,
            open_main,
            set_music_playing,
            open_url,
            check_for_update,
            install_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running TaskPlayer");
}
