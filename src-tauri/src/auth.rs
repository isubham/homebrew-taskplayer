// Google Sign-In via Supabase Auth (GoTrue), using PKCE over plain HTTPS.
//
// No JS SDK, no generic `oauth2` crate: Supabase's `grant_type=pkce` token
// exchange takes a bespoke JSON body rather than standard form-encoded
// OAuth2, so hand-rolling this with `reqwest` is simpler than fighting a
// generic client — matches this codebase's existing style of hand-rolling
// small things (`new_id()` instead of the `uuid` crate).

use crate::config::{SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL};
use base64::prelude::*;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use taskplayer_core::AccountInfo;

/// Must match the scheme registered in `tauri.conf.json`'s `plugins.deep-link`.
const REDIRECT_URL: &str = "taskplayer://auth-callback";
const SESSION_FILE: &str = "session.json";

pub struct Pkce {
    pub verifier: String,
    pub challenge: String,
}

/// Generates an RFC 7636 PKCE verifier/challenge pair (32 random bytes,
/// base64url-no-pad, SHA-256 for the challenge).
pub fn generate_pkce() -> Pkce {
    let mut bytes = [0u8; 32];
    if getrandom::fill(&mut bytes).is_err() {
        // Astronomically unlikely (OS entropy source failure) — never block
        // sign-in over it, just fall back to a time-seeded buffer.
        let now = taskplayer_core::now_ms().to_le_bytes();
        for (i, b) in bytes.iter_mut().enumerate() {
            *b = now[i % now.len()];
        }
    }
    let verifier = BASE64_URL_SAFE_NO_PAD.encode(bytes);
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let challenge = BASE64_URL_SAFE_NO_PAD.encode(hasher.finalize());
    Pkce { verifier, challenge }
}

/// The URL to open in the system browser to start the Google consent flow.
pub fn authorize_url(pkce: &Pkce) -> String {
    let mut url = reqwest::Url::parse(&format!("{SUPABASE_URL}/auth/v1/authorize"))
        .expect("SUPABASE_URL in config.rs must be a valid base URL");
    url.query_pairs_mut()
        .append_pair("provider", "google")
        .append_pair("redirect_to", REDIRECT_URL)
        .append_pair("code_challenge", &pkce.challenge)
        .append_pair("code_challenge_method", "s256")
        .append_pair("apikey", SUPABASE_PUBLISHABLE_KEY);
    url.to_string()
}

/// Pulls `?code=...` out of the `taskplayer://auth-callback?code=...` deep
/// link Supabase redirects to once Google's consent screen completes.
pub fn extract_code(callback_url: &str) -> Option<String> {
    let url = reqwest::Url::parse(callback_url).ok()?;
    url.query_pairs()
        .find(|(k, _)| k == "code")
        .map(|(_, v)| v.into_owned())
}

pub struct Session {
    pub access_token: String,
    pub refresh_token: String,
    /// Seconds until `access_token` expires, as reported by Supabase at
    /// issue time — lets callers schedule a refresh *before* expiry instead
    /// of only reacting to a 401 after the fact.
    pub expires_in: i64,
    pub account: AccountInfo,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: String,
    // Supabase always sends this, but default to its standard 1-hour lifetime
    // rather than 0 if it's ever missing — 0 would read as "already expired"
    // and cause the caller to refresh on every single sync tick.
    #[serde(default = "default_expires_in")]
    expires_in: i64,
    user: SupabaseUser,
}

fn default_expires_in() -> i64 {
    3600
}

#[derive(Debug, Deserialize)]
struct SupabaseUser {
    id: String,
    email: Option<String>,
    #[serde(default)]
    user_metadata: serde_json::Value,
}

fn metadata_str(meta: &serde_json::Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| meta.get(*key).and_then(|v| v.as_str()).map(str::to_string))
}

fn to_session(token: TokenResponse) -> Session {
    let account = AccountInfo {
        id: token.user.id,
        email: token.user.email.unwrap_or_default(),
        name: metadata_str(&token.user.user_metadata, &["full_name", "name"]),
        avatar_url: metadata_str(&token.user.user_metadata, &["avatar_url", "picture"]),
    };
    Session {
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_in: token.expires_in,
        account,
    }
}

fn client() -> reqwest::blocking::Client {
    reqwest::blocking::Client::new()
}

fn token_request(grant_type: &str, body: serde_json::Value) -> Result<Session, String> {
    let url = format!("{SUPABASE_URL}/auth/v1/token?grant_type={grant_type}");
    let resp = client()
        .post(&url)
        .header("apikey", SUPABASE_PUBLISHABLE_KEY)
        .json(&body)
        .send()
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Supabase token request ({grant_type}) failed: HTTP {}", resp.status()));
    }
    resp.json::<TokenResponse>().map(to_session).map_err(|e| e.to_string())
}

/// Exchanges the PKCE auth code (from the deep-link callback) for a session.
pub fn exchange_code(auth_code: &str, verifier: &str) -> Result<Session, String> {
    token_request("pkce", serde_json::json!({ "auth_code": auth_code, "code_verifier": verifier }))
}

/// Silently refreshes an existing session using the stored refresh token.
pub fn refresh_session(refresh_token: &str) -> Result<Session, String> {
    token_request("refresh_token", serde_json::json!({ "refresh_token": refresh_token }))
}

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
    std::fs::write(&path, serde_json::json!({ "refresh_token": token }).to_string()).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())?;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_challenge_is_sha256_of_verifier() {
        let pkce = generate_pkce();
        let mut hasher = Sha256::new();
        hasher.update(pkce.verifier.as_bytes());
        let expected = BASE64_URL_SAFE_NO_PAD.encode(hasher.finalize());
        assert_eq!(pkce.challenge, expected);
        // RFC 7636: verifier must be 43-128 chars from the unreserved set.
        assert!(pkce.verifier.len() >= 43 && pkce.verifier.len() <= 128);
    }

    #[test]
    fn extract_code_reads_query_param() {
        let url = "taskplayer://auth-callback?code=abc123&other=x";
        assert_eq!(extract_code(url).as_deref(), Some("abc123"));
    }

    #[test]
    fn extract_code_none_when_missing() {
        assert_eq!(extract_code("taskplayer://auth-callback"), None);
    }

    #[test]
    fn authorize_url_contains_pkce_and_redirect() {
        let pkce = generate_pkce();
        let url = authorize_url(&pkce);
        assert!(url.contains("provider=google"));
        assert!(url.contains(&pkce.challenge));
        assert!(url.contains("code_challenge_method=s256"));
        // redirect_to is percent-encoded, so check the decoded round-trip instead of a raw substring.
        let parsed = reqwest::Url::parse(&url).unwrap();
        let redirect = parsed.query_pairs().find(|(k, _)| k == "redirect_to").unwrap().1;
        assert_eq!(redirect, REDIRECT_URL);
    }
}
