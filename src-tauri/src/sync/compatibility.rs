use super::*;

pub(super) fn client() -> reqwest::blocking::Client {
    reqwest::blocking::Client::new()
}

pub(super) fn rest_url(table: &str) -> String {
    format!("{SUPABASE_URL}/rest/v1/{table}")
}

/// How far to rewind the pull cursor below "now" on every pull, instead of
/// advancing it all the way to the puller's own clock reading.
///
/// `updated_at` is stamped by whichever device made the edit, using that
/// device's own clock at *creation* time — there's no server-side trigger
/// setting it on arrival. So a row can be created on device B, sit unpushed
/// for a few seconds/minutes (offline, or just waiting for its periodic sync
/// tick), and only reach Supabase *after* device A already advanced its
/// pull_cursor past that row's timestamp. From then on `updated_at > cursor`
/// excludes that row forever — not even a manual re-sync recovers it, since
/// the row's timestamp never changes.
///
/// Keeping the cursor a few minutes behind "now" instead re-scans that
/// window on every pull, catching the race. Re-applying an already-seen row
/// is a no-op: `upsert_from_remote`'s `ON CONFLICT ... WHERE excluded.updated_at
/// > x.updated_at` only writes if it's actually newer.
pub(super) const PULL_REWIND_MS: i64 = 5 * 60 * 1000;

pub(super) const MIN_BACKEND_SCHEMA_VERSION: i64 = 8;
pub(super) const REQUIRED_BACKEND_CAPABILITIES: &[&str] = &[
    "planner_windows_v1",
    "life_area_priorities_v1",
    "run_state_v1",
    "music_favorites_v1",
    "user_settings_v1",
    "apple_music_takeover_v1",
    "music_player_takeover_v2",
    "planned_sessions_v1",
];

#[derive(Clone, Debug, Deserialize)]
pub(super) struct BackendSchema {
    pub(super) schema_version: i64,
    pub(super) min_supported_client: String,
    #[serde(default)]
    pub(super) capabilities: Vec<String>,
}

static BACKEND_SCHEMA: OnceLock<Mutex<Option<BackendSchema>>> = OnceLock::new();

pub(super) fn version_triplet(version: &str) -> Option<(u64, u64, u64)> {
    let core = version.split(['-', '+']).next()?;
    let mut parts = core.split('.');
    Some((
        parts.next()?.parse().ok()?,
        parts.next().unwrap_or("0").parse().ok()?,
        parts.next().unwrap_or("0").parse().ok()?,
    ))
}

pub(super) fn validate_backend_schema(schema: &BackendSchema) -> Result<(), String> {
    let current_client = env!("CARGO_PKG_VERSION");
    let current_version = version_triplet(current_client)
        .ok_or_else(|| format!("invalid client version: {current_client}"))?;
    let minimum_version = version_triplet(&schema.min_supported_client).ok_or_else(|| {
        format!(
            "invalid minimum client version in backend contract: {}",
            schema.min_supported_client
        )
    })?;
    if current_version < minimum_version {
        return Err(format!(
            "Sync paused: TaskPlayer {current_client} is older than the backend's supported minimum {}. Update TaskPlayer to resume sync.",
            schema.min_supported_client
        ));
    }

    if schema.schema_version < MIN_BACKEND_SCHEMA_VERSION {
        return Err(format!(
            "Sync paused: backend schema {} is older than required schema {}. Apply the Supabase migrations first.",
            schema.schema_version, MIN_BACKEND_SCHEMA_VERSION
        ));
    }

    let missing = REQUIRED_BACKEND_CAPABILITIES
        .iter()
        .filter(|required| {
            !schema
                .capabilities
                .iter()
                .any(|available| available.as_str() == **required)
        })
        .copied()
        .collect::<Vec<_>>();

    if !missing.is_empty() {
        return Err(format!(
            "Sync paused: backend is missing required capabilities: {}. Apply the Supabase migrations first.",
            missing.join(", ")
        ));
    }

    Ok(())
}

/// Verify the global Supabase contract once per app process. If the contract
/// is absent or too old, only sync is paused; local SQLite and task playback
/// continue to work normally.
pub(super) fn ensure_backend_compatible(access_token: &str) -> Result<(), String> {
    let cache = BACKEND_SCHEMA.get_or_init(|| Mutex::new(None));
    if let Some(schema) = cache
        .lock()
        .map_err(|_| "backend schema cache is unavailable".to_string())?
        .clone()
    {
        return validate_backend_schema(&schema);
    }

    let url = format!(
        "{}?id=eq.1&select=schema_version,min_supported_client,capabilities",
        rest_url("app_schema")
    );
    let resp = client()
        .get(url)
        .header("apikey", SUPABASE_PUBLISHABLE_KEY)
        .header("Authorization", format!("Bearer {access_token}"))
        .send()
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        return Err(format!(
            "Sync paused: the backend compatibility contract is unavailable (HTTP {status}). Apply the Supabase migrations first."
        ));
    }

    let schema = resp
        .json::<Vec<BackendSchema>>()
        .map_err(|e| format!("invalid backend compatibility contract: {e}"))?
        .into_iter()
        .next()
        .ok_or_else(|| "Sync paused: the backend compatibility contract is empty.".to_string())?;

    validate_backend_schema(&schema)?;
    *cache
        .lock()
        .map_err(|_| "backend schema cache is unavailable".to_string())? = Some(schema);
    Ok(())
}
