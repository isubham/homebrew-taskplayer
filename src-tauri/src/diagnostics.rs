use super::*;

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
pub(crate) fn log_dir() -> PathBuf {
    let home = std::env::var("HOME")
        .ok()
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    home.join("Library/Logs/TaskPlayer")
}

pub(crate) fn log_file_path() -> PathBuf {
    log_dir().join("taskplayer.log")
}

/// Appends one line to `taskplayer.log` (and still prints to stderr, so
/// `tauri dev` in a terminal keeps working exactly as before). Every error
/// path in this file should call this instead of `eprintln!` directly —
/// stderr is invisible once the app is launched normally (double-click,
/// login item), which is the only place a real user ever hits these paths.
pub(crate) fn log_line(msg: impl AsRef<str>) {
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
pub(crate) fn guard<F: FnOnce()>(where_: &str, f: F) {
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
pub(crate) fn install_panic_hook() {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        default_hook(info);
        log_line(format!("PANIC: {info}"));
    }));
}
