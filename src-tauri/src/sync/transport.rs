use super::*;

pub(super) fn upsert<T: Serialize>(
    access_token: &str,
    table: &str,
    rows: &[T],
) -> Result<(), String> {
    if rows.is_empty() {
        return Ok(());
    }
    let resp = client()
        .post(rest_url(table))
        .header("apikey", SUPABASE_PUBLISHABLE_KEY)
        .header("Authorization", format!("Bearer {access_token}"))
        .header("Prefer", "resolution=merge-duplicates,return=minimal")
        .json(rows)
        .send()
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let status = resp.status();
        return Err(format!(
            "push to {table} failed: HTTP {status} — {}",
            resp.text().unwrap_or_default()
        ));
    }
    Ok(())
}

pub(super) fn fetch_since<T: for<'de> Deserialize<'de>>(
    access_token: &str,
    table: &str,
    cursor: i64,
) -> Result<Vec<T>, String> {
    // `cursor` is a plain integer, so no percent-encoding is needed here —
    // hand-building this one simple query string avoids pulling in
    // reqwest's `query` feature for a single call site.
    let url = format!("{}?updated_at=gt.{cursor}", rest_url(table));
    let resp = client()
        .get(url)
        .header("apikey", SUPABASE_PUBLISHABLE_KEY)
        .header("Authorization", format!("Bearer {access_token}"))
        .send()
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let status = resp.status();
        return Err(format!(
            "pull from {table} failed: HTTP {status} — {}",
            resp.text().unwrap_or_default()
        ));
    }
    resp.json::<Vec<T>>().map_err(|e| e.to_string())
}
