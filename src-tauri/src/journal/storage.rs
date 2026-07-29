use std::fs;
use std::io::Write;
use std::path::Path;

use super::document::{document_at, draft_entry};
use super::format::{revision, serialize, title, validate_entry_id};
use super::paths::{asset_directory, desired_entry_path, find_entry_path, parse_date};
use super::{JournalDocument, JournalRelatedItem};
use crate::constants::{
    JOURNAL_ASSETS_DIRECTORY, JOURNAL_DIRECTORY, JOURNAL_ENTRY_NOT_FOUND_MSG,
    JOURNAL_LEGACY_ID_PREFIX, LOCAL_NOTES_CONFLICT_MSG, LOCAL_NOTES_DESTINATION_MSG,
    LOCAL_NOTES_FILE_MODE, LOCAL_NOTES_TEMP_PREFIX,
};
use crate::local_notes::ensure_safe_parent;

fn atomic_write(root: &Path, destination: &Path, contents: &str) -> Result<(), String> {
    ensure_safe_parent(root, destination)?;
    let parent = destination
        .parent()
        .ok_or_else(|| LOCAL_NOTES_DESTINATION_MSG.to_string())?;
    let temporary = parent.join(format!(
        "{LOCAL_NOTES_TEMP_PREFIX}-journal-{}-{}.tmp",
        std::process::id(),
        taskplayer_core::models::now_ms()
    ));
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(|error| error.to_string())?;
    file.write_all(contents.as_bytes())
        .map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())?;
    #[cfg(unix)]
    fs::set_permissions(
        &temporary,
        <fs::Permissions as std::os::unix::fs::PermissionsExt>::from_mode(LOCAL_NOTES_FILE_MODE),
    )
    .map_err(|error| error.to_string())?;
    fs::rename(temporary, destination).map_err(|error| error.to_string())
}

pub(crate) fn save_entry(
    root: &Path,
    id: &str,
    date: &str,
    created_at: i64,
    body: &str,
    mood: Option<&str>,
    related_items: &[JournalRelatedItem],
    expected_revision: Option<&str>,
    force: bool,
) -> Result<JournalDocument, String> {
    validate_entry_id(id)?;
    parse_date(date)?;
    let existing_path = match find_entry_path(root, id) {
        Ok(path) => Some(path),
        Err(error) if error == JOURNAL_ENTRY_NOT_FOUND_MSG => None,
        Err(error) => return Err(error),
    };
    let current = existing_path
        .as_ref()
        .map(fs::read)
        .transpose()
        .map_err(|error| error.to_string())?;
    if !force && current.as_deref().map(revision).as_deref() != expected_revision {
        return Err(LOCAL_NOTES_CONFLICT_MSG.to_string());
    }
    if current.is_none() && body.trim().is_empty() {
        return draft_entry(root, date, id, created_at);
    }
    let stored_created_at = existing_path
        .as_deref()
        .map(|path| document_at(root, path))
        .transpose()?
        .map(|document| document.created_at)
        .unwrap_or(created_at);
    let desired = desired_entry_path(root, date, &title(body), id, existing_path.as_deref())?;
    let legacy_assets = id
        .starts_with(JOURNAL_LEGACY_ID_PREFIX)
        .then(|| {
            root.join(JOURNAL_DIRECTORY)
                .join(JOURNAL_ASSETS_DIRECTORY)
                .join(date)
        })
        .filter(|path| path.exists());
    let migrated_body = legacy_assets
        .as_ref()
        .map(|_| {
            body.replace(
                &format!("{JOURNAL_ASSETS_DIRECTORY}/{date}/"),
                &format!("{JOURNAL_ASSETS_DIRECTORY}/{id}/"),
            )
        })
        .unwrap_or_else(|| body.to_string());
    let contents = serialize(
        id,
        date,
        stored_created_at,
        mood,
        related_items,
        &migrated_body,
    )?;
    atomic_write(root, &desired, &contents)?;
    if let Some(source) = legacy_assets {
        let destination = asset_directory(root, id)?;
        if let Err(error) = ensure_safe_parent(root, &destination)
            .and_then(|_| fs::rename(source, destination).map_err(|reason| reason.to_string()))
        {
            if existing_path.as_deref() != Some(desired.as_path()) {
                let _ = fs::remove_file(&desired);
            }
            return Err(error);
        }
    }
    if let Some(existing) = existing_path.filter(|path| path != &desired) {
        fs::remove_file(existing).map_err(|error| error.to_string())?;
    }
    document_at(root, &desired)
}
