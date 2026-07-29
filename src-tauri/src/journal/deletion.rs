use std::fs;
use std::path::Path;

use super::document::document_at;
use super::format::revision;
use super::paths::{asset_directory, find_entry_path};
use crate::constants::{
    JOURNAL_ASSETS_DIRECTORY, JOURNAL_DIRECTORY, JOURNAL_LEGACY_ID_PREFIX,
    LOCAL_NOTES_ARCHIVE_DIRECTORY, LOCAL_NOTES_CONFLICT_MSG, LOCAL_NOTES_SHORT_ID_CHARS,
    LOCAL_NOTES_SYMLINK_MSG,
};
use crate::local_notes::ensure_safe_parent;

pub(crate) fn archive_entry(
    root: &Path,
    id: &str,
    expected_revision: Option<&str>,
) -> Result<(), String> {
    let entry = find_entry_path(root, id)?;
    if fs::symlink_metadata(&entry)
        .map_err(|error| error.to_string())?
        .file_type()
        .is_symlink()
    {
        return Err(LOCAL_NOTES_SYMLINK_MSG.to_string());
    }
    let bytes = fs::read(&entry).map_err(|error| error.to_string())?;
    if Some(revision(&bytes).as_str()) != expected_revision {
        return Err(LOCAL_NOTES_CONFLICT_MSG.to_string());
    }
    let document = document_at(root, &entry)?;
    let short_id = id
        .chars()
        .take(LOCAL_NOTES_SHORT_ID_CHARS)
        .collect::<String>();
    let archive = root
        .join(LOCAL_NOTES_ARCHIVE_DIRECTORY)
        .join(JOURNAL_DIRECTORY)
        .join(format!(
            "{}-{short_id}-{}",
            document.date,
            taskplayer_core::models::now_ms()
        ));
    let file_name = entry
        .file_name()
        .ok_or_else(|| crate::constants::LOCAL_NOTES_DESTINATION_MSG.to_string())?;
    let archived_entry = archive.join(file_name);
    ensure_safe_parent(root, &archived_entry)?;
    fs::rename(&entry, &archived_entry).map_err(|error| error.to_string())?;

    let asset_key = if id.starts_with(JOURNAL_LEGACY_ID_PREFIX) {
        document.date.as_str()
    } else {
        id
    };
    let assets = asset_directory(root, asset_key)?;
    if assets.exists() {
        let archived_assets = archive.join(JOURNAL_ASSETS_DIRECTORY).join(asset_key);
        if let Err(error) = ensure_safe_parent(root, &archived_assets).and_then(|_| {
            fs::rename(&assets, &archived_assets).map_err(|reason| reason.to_string())
        }) {
            let _ = fs::rename(&archived_entry, &entry);
            return Err(error);
        }
    }
    Ok(())
}
