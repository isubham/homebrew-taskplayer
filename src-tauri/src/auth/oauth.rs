// Google Sign-In via Supabase Auth (GoTrue), using PKCE over plain HTTPS.
//
// No JS SDK, no generic `oauth2` crate: Supabase's `grant_type=pkce` token
// exchange takes a bespoke JSON body rather than standard form-encoded
// OAuth2, so hand-rolling this with `reqwest` is simpler than fighting a
// generic client — matches this codebase's existing style of hand-rolling
// small things (`new_id()` instead of the `uuid` crate).

use crate::config::{SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL};
use base64::prelude::*;
use sha2::{Digest, Sha256};

/// Must match the scheme registered in `tauri.conf.json`'s `plugins.deep-link`
/// (release) or `tauri.dev.conf.json`'s override (dev, via `npm run dev`).
/// Split so a dev instance and an installed release build never race for the
/// same OAuth callback — see "Running dev alongside an installed release
/// build" in the README. Requires `taskplayer-dev://auth-callback` to also be
/// added to Supabase's allowed redirect URLs (Authentication → URL
/// Configuration) alongside the existing `taskplayer://auth-callback`.
#[cfg(debug_assertions)]
pub(super) const REDIRECT_URL: &str = "taskplayer-dev://auth-callback";
#[cfg(not(debug_assertions))]
pub(super) const REDIRECT_URL: &str = "taskplayer://auth-callback";
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
    Pkce {
        verifier,
        challenge,
    }
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
