use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

use super::format::{excerpt, parse, revision, title};
use super::paths::{
    desired_entry_path, find_entry_path, journal_directory, parse_date, safe_existing_path,
};
use super::{JournalAsset, JournalDocument, JournalEntrySummary};
use crate::constants::{
    JOURNAL_ASSETS_DIRECTORY, JOURNAL_LEGACY_ID_PREFIX, JOURNAL_MAX_IMAGE_BYTES,
};

fn asset_references(body: &str) -> Vec<String> {
    let mut remaining = body;
    let mut paths = Vec::new();
    while let Some(image_start) = remaining.find("![") {
        remaining = &remaining[image_start + 2..];
        let Some(link_start) = remaining.find("](") else {
            break;
        };
        remaining = &remaining[link_start + 2..];
        let Some(link_end) = remaining.find(')') else {
            break;
        };
        let candidate = &remaining[..link_end];
        if candidate.starts_with(&format!("{JOURNAL_ASSETS_DIRECTORY}/")) {
            paths.push(candidate.to_string());
        }
        remaining = &remaining[link_end + 1..];
    }
    paths
}

fn load_assets(root: &Path, body: &str) -> Vec<JournalAsset> {
    let base = journal_directory(root);
    asset_references(body)
        .into_iter()
        .filter_map(|markdown_path| {
            let canonical = safe_existing_path(&base, &base.join(&markdown_path))?;
            let metadata = fs::metadata(&canonical).ok()?;
            if metadata.len() as usize > JOURNAL_MAX_IMAGE_BYTES {
                return None;
            }
            let mime_type = match canonical
                .extension()?
                .to_str()?
                .to_ascii_lowercase()
                .as_str()
            {
                "png" => "image/png",
                "jpg" | "jpeg" => "image/jpeg",
                "gif" => "image/gif",
                "webp" => "image/webp",
                "heic" | "heif" => "image/heic",
                _ => return None,
            };
            Some(JournalAsset {
                markdown_path,
                mime_type: mime_type.to_string(),
                bytes: fs::read(canonical).ok()?,
            })
        })
        .collect()
}

fn file_created_at(path: &Path) -> i64 {
    fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

pub(super) fn document_at(root: &Path, path: &Path) -> Result<JournalDocument, String> {
    if fs::symlink_metadata(path)
        .map_err(|error| error.to_string())?
        .file_type()
        .is_symlink()
    {
        return Err(crate::constants::LOCAL_NOTES_SYMLINK_MSG.to_string());
    }
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    let contents = String::from_utf8(bytes.clone()).map_err(|error| error.to_string())?;
    let parsed = parse(&contents)?;
    parse_date(&parsed.date)?;
    let id = parsed
        .id
        .unwrap_or_else(|| format!("{JOURNAL_LEGACY_ID_PREFIX}{}", parsed.date));
    let created_at = parsed.created_at.unwrap_or_else(|| file_created_at(path));
    let relative_path = path
        .strip_prefix(root)
        .map_err(|_| crate::constants::LOCAL_NOTES_DESTINATION_MSG.to_string())?
        .to_string_lossy()
        .into_owned();
    Ok(JournalDocument {
        id,
        date: parsed.date,
        created_at,
        title: title(&parsed.body),
        mood: parsed.mood,
        related_items: parsed.related_items,
        assets: load_assets(root, &parsed.body),
        body: parsed.body,
        revision: Some(revision(&bytes)),
        relative_path,
        absolute_path: path.to_string_lossy().into_owned(),
    })
}

pub(super) fn draft_entry(
    root: &Path,
    date: &str,
    id: &str,
    created_at: i64,
) -> Result<JournalDocument, String> {
    parse_date(date)?;
    let title = crate::constants::JOURNAL_TITLE_FALLBACK.to_string();
    let path = desired_entry_path(root, date, &title, id, None)?;
    Ok(JournalDocument {
        id: id.to_string(),
        date: date.to_string(),
        created_at,
        title,
        mood: None,
        related_items: Vec::new(),
        body: String::new(),
        revision: None,
        relative_path: path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .into_owned(),
        absolute_path: path.to_string_lossy().into_owned(),
        assets: Vec::new(),
    })
}

pub(crate) fn new_entry(root: &Path, date: &str) -> Result<JournalDocument, String> {
    draft_entry(
        root,
        date,
        &taskplayer_core::models::new_id(),
        taskplayer_core::models::now_ms(),
    )
}

pub(crate) fn read_entry(root: &Path, id: &str) -> Result<JournalDocument, String> {
    document_at(root, &find_entry_path(root, id)?)
}

pub(crate) fn list_entries(root: &Path) -> Result<Vec<JournalEntrySummary>, String> {
    let directory = journal_directory(root);
    if !directory.exists() {
        return Ok(Vec::new());
    }
    let mut seen = HashSet::new();
    let mut entries = fs::read_dir(directory)
        .map_err(|error| error.to_string())?
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let metadata = fs::symlink_metadata(&path).ok()?;
            if metadata.file_type().is_symlink() || !metadata.is_file() {
                return None;
            }
            let document = document_at(root, &path).ok()?;
            seen.insert(document.id.clone())
                .then_some(JournalEntrySummary {
                    id: document.id,
                    date: document.date,
                    created_at: document.created_at,
                    title: document.title,
                    mood: document.mood,
                    excerpt: excerpt(&document.body),
                    related_items: document.related_items,
                    first_asset: document.assets.into_iter().next(),
                })
        })
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| {
        right
            .date
            .cmp(&left.date)
            .then_with(|| right.created_at.cmp(&left.created_at))
    });
    Ok(entries)
}
