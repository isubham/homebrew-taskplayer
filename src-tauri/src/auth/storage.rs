const SESSION_FILE: &str = "session.json";

// ---- Session file ----
//
// Only the refresh token is secret and lives here, in `<app_data_dir>/session.json`
// with owner-only (0600) permissions. Non-secret profile info (name/email/
// avatar) is cached in the SQLite `meta` table via `Db::get_account`/
// `set_account` for fast reads on render.
//
// Deliberately NOT the OS Keychain: this app is ad-hoc code-signed (see
// `Casks/taskplayer.rb`'s `postflight`), and every rebuild/`brew upgrade`
// re-signs it with a fresh identity. macOS Keychain ACLs are bound to the
// exact code signature, so a Keychain-stored secret becomes inaccessible —
// and macOS re-prompts for permission — after every single rebuild. A
// plain file scoped to this app's own data directory with restrictive Unix
// permissions (the same approach tools like `gh`/`aws-cli` use) avoids that
// entirely and needs no code-signing stability to work reliably.

fn session_path(dir: &std::path::Path) -> std::path::PathBuf {
    dir.join(SESSION_FILE)
}

pub fn save_refresh_token(dir: &std::path::Path, token: &str) -> Result<(), String> {
    let path = session_path(dir);
    std::fs::write(
        &path,
        serde_json::json!({ "refresh_token": token }).to_string(),
    )
    .map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn load_refresh_token(dir: &std::path::Path) -> Option<String> {
    // Fails closed (returns None) on any error — missing file, bad
    // permissions, corrupt JSON — same "just show Sign in" contract as
    // before, just without the code-signature fragility.
    let contents = std::fs::read_to_string(session_path(dir)).ok()?;
    let value: serde_json::Value = serde_json::from_str(&contents).ok()?;
    value.get("refresh_token")?.as_str().map(str::to_string)
}

pub fn clear_refresh_token(dir: &std::path::Path) {
    let _ = std::fs::remove_file(session_path(dir));
}
