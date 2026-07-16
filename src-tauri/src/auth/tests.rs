#[cfg(test)]
mod tests {
    use super::*;
    use base64::prelude::*;
    use sha2::{Digest, Sha256};

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
        let redirect = parsed
            .query_pairs()
            .find(|(k, _)| k == "redirect_to")
            .unwrap()
            .1;
        assert_eq!(redirect, REDIRECT_URL);
    }

    #[test]
    fn missing_refresh_token_is_an_invalid_session() {
        assert!(TokenRequestError::missing_refresh_token().invalid_session());
    }

    #[test]
    fn transport_failure_is_retryable() {
        assert!(!TokenRequestError::retryable("offline").invalid_session());
    }

    #[test]
    fn refresh_http_statuses_distinguish_invalid_from_retryable() {
        assert!(invalid_session_status(reqwest::StatusCode::BAD_REQUEST));
        assert!(invalid_session_status(reqwest::StatusCode::UNAUTHORIZED));
        assert!(invalid_session_status(reqwest::StatusCode::FORBIDDEN));
        assert!(!invalid_session_status(
            reqwest::StatusCode::TOO_MANY_REQUESTS
        ));
        assert!(!invalid_session_status(
            reqwest::StatusCode::INTERNAL_SERVER_ERROR
        ));
    }
}
