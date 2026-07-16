use std::fmt;

use serde::Deserialize;
use taskplayer_core::AccountInfo;

use crate::config::{SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL};

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

/// A token refresh can fail because the session is genuinely unusable, or
/// because the network/server is temporarily unavailable. Callers must keep
/// the stored refresh token and retry the latter instead of treating every
/// transport failure as a sign-out.
#[derive(Debug)]
pub struct TokenRequestError {
    message: String,
    invalid_session: bool,
}

impl TokenRequestError {
    pub fn invalid_session(&self) -> bool {
        self.invalid_session
    }

    pub fn missing_refresh_token() -> Self {
        Self {
            message: "no stored refresh token".to_string(),
            invalid_session: true,
        }
    }

    pub(super) fn retryable(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            invalid_session: false,
        }
    }

    fn invalid(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            invalid_session: true,
        }
    }
}

impl fmt::Display for TokenRequestError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

pub(super) fn invalid_session_status(status: reqwest::StatusCode) -> bool {
    matches!(status.as_u16(), 400 | 401 | 403)
}

fn token_request(grant_type: &str, body: serde_json::Value) -> Result<Session, TokenRequestError> {
    let url = format!("{SUPABASE_URL}/auth/v1/token?grant_type={grant_type}");
    let resp = client()
        .post(&url)
        .header("apikey", SUPABASE_PUBLISHABLE_KEY)
        .json(&body)
        .send()
        .map_err(|e| TokenRequestError::retryable(e.to_string()))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let message = format!("Supabase token request ({grant_type}) failed: HTTP {status}");
        // Invalid/expired/rotated refresh tokens are client-auth failures.
        // Rate limits and server failures can recover without user action.
        return Err(if invalid_session_status(status) {
            TokenRequestError::invalid(message)
        } else {
            TokenRequestError::retryable(message)
        });
    }
    resp.json::<TokenResponse>()
        .map(to_session)
        .map_err(|e| TokenRequestError::retryable(e.to_string()))
}

/// Exchanges the PKCE auth code (from the deep-link callback) for a session.
pub fn exchange_code(auth_code: &str, verifier: &str) -> Result<Session, String> {
    token_request(
        "pkce",
        serde_json::json!({ "auth_code": auth_code, "code_verifier": verifier }),
    )
    .map_err(|e| e.to_string())
}

/// Silently refreshes an existing session using the stored refresh token.
pub fn refresh_session(refresh_token: &str) -> Result<Session, TokenRequestError> {
    token_request(
        "refresh_token",
        serde_json::json!({ "refresh_token": refresh_token }),
    )
}
