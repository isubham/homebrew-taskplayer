use std::fs;
use std::path::{Path, PathBuf};

use chrono::NaiveDate;

use crate::constants::{
    JOURNAL_ASSETS_DIRECTORY, JOURNAL_DIRECTORY, JOURNAL_ENTRY_NOT_FOUND_MSG,
    JOURNAL_INVALID_DATE_MSG, LOCAL_NOTES_EXTENSION, LOCAL_NOTES_PATH_OCCUPIED_MSG,
    LOCAL_NOTES_SHORT_ID_CHARS,
};
use crate::local_notes::sanitize_component;

use super::format::{parse, validate_entry_id};

pub(super) fn parse_date(date: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(date, "%Y-%m-%d").map_err(|_| JOURNAL_INVALID_DATE_MSG.to_string())
}

pub(super) fn journal_directory(root: &Path) -> PathBuf {
    root.join(JOURNAL_DIRECTORY)
}

fn entry_filename(date: &str, title: &str, id_suffix: &str) -> String {
    format!(
        "{date} - {} - {id_suffix}.{LOCAL_NOTES_EXTENSION}",
        sanitize_component(title)
    )
}

pub(super) fn desired_entry_path(
    root: &Path,
    date: &str,
    title: &str,
    id: &str,
    current: Option<&Path>,
) -> Result<PathBuf, String> {
    parse_date(date)?;
    validate_entry_id(id)?;
    let short_id = id
        .chars()
        .take(LOCAL_NOTES_SHORT_ID_CHARS)
        .collect::<String>();
    for suffix in [short_id.as_str(), id] {
        let candidate = journal_directory(root).join(entry_filename(date, title, suffix));
        if !candidate.exists() || current == Some(candidate.as_path()) {
            return Ok(candidate);
        }
    }
    Err(LOCAL_NOTES_PATH_OCCUPIED_MSG.to_string())
}

pub(super) fn asset_directory(root: &Path, id: &str) -> Result<PathBuf, String> {
    validate_entry_id(id)?;
    Ok(journal_directory(root)
        .join(JOURNAL_ASSETS_DIRECTORY)
        .join(id))
}

pub(super) fn find_entry_path(root: &Path, id: &str) -> Result<PathBuf, String> {
    validate_entry_id(id)?;
    let directory = journal_directory(root);
    if !directory.exists() {
        return Err(JOURNAL_ENTRY_NOT_FOUND_MSG.to_string());
    }
    for entry in fs::read_dir(directory)
        .map_err(|error| error.to_string())?
        .flatten()
    {
        let path = entry.path();
        let Ok(metadata) = fs::symlink_metadata(&path) else {
            continue;
        };
        if metadata.file_type().is_symlink()
            || !metadata.is_file()
            || path.extension().and_then(|value| value.to_str()) != Some(LOCAL_NOTES_EXTENSION)
        {
            continue;
        }
        let Ok(contents) = fs::read_to_string(&path) else {
            continue;
        };
        let Ok(parsed) = parse(&contents) else {
            continue;
        };
        let stored_id = parsed
            .id
            .unwrap_or_else(|| format!("legacy-{}", parsed.date));
        if stored_id == id {
            return Ok(path);
        }
    }
    Err(JOURNAL_ENTRY_NOT_FOUND_MSG.to_string())
}

pub(super) fn safe_existing_path(base: &Path, path: &Path) -> Option<PathBuf> {
    let relative = path.strip_prefix(base).ok()?;
    let mut current = base.to_path_buf();
    for component in relative.components() {
        current.push(component);
        if fs::symlink_metadata(&current)
            .ok()?
            .file_type()
            .is_symlink()
        {
            return None;
        }
    }
    let canonical_base = base.canonicalize().ok()?;
    let canonical = path.canonicalize().ok()?;
    canonical.starts_with(canonical_base).then_some(canonical)
}
