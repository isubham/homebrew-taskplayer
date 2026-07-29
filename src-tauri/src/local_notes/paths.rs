use std::fs;
use std::path::{Path, PathBuf};

use super::format::document_task_id;
use crate::constants::{
    local_notes_area_directory, LOCAL_NOTES_ARCHIVE_DIRECTORY, LOCAL_NOTES_EXTENSION,
    LOCAL_NOTES_FILENAME_FALLBACK, LOCAL_NOTES_INVALID_FILENAME_CHARS,
    LOCAL_NOTES_MAX_FILENAME_CHARS, LOCAL_NOTES_MAX_SCAN_DEPTH, LOCAL_NOTES_PATH_ESCAPE_MSG,
    LOCAL_NOTES_PATH_OCCUPIED_MSG, LOCAL_NOTES_RESERVED_FILENAMES,
    LOCAL_NOTES_RESERVED_FILENAME_PREFIX, LOCAL_NOTES_SHORT_ID_CHARS, LOCAL_NOTES_SYMLINK_MSG,
};

#[derive(Clone, Debug)]
pub(crate) struct NoteContext {
    pub(crate) task_id: String,
    pub(crate) task_name: String,
    pub(crate) list_name: String,
    pub(crate) life_area: Option<String>,
}

pub(crate) fn sanitize_component(value: &str) -> String {
    let mut cleaned = String::new();
    let mut previous_space = false;
    for character in value.chars() {
        let invalid =
            character.is_control() || LOCAL_NOTES_INVALID_FILENAME_CHARS.contains(character);
        let next = if invalid { '-' } else { character };
        if next.is_whitespace() {
            if !previous_space {
                cleaned.push(' ');
            }
            previous_space = true;
        } else {
            cleaned.push(next);
            previous_space = false;
        }
        if cleaned.chars().count() >= LOCAL_NOTES_MAX_FILENAME_CHARS {
            break;
        }
    }
    let trimmed = cleaned.trim().trim_matches('.').trim();
    if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
        LOCAL_NOTES_FILENAME_FALLBACK.to_string()
    } else {
        let stem = trimmed
            .split('.')
            .next()
            .unwrap_or(trimmed)
            .to_ascii_uppercase();
        let numbered_reserved = (stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem[3..]
                .parse::<u8>()
                .is_ok_and(|value| (1..=9).contains(&value));
        if LOCAL_NOTES_RESERVED_FILENAMES.contains(&stem.as_str()) || numbered_reserved {
            format!("{LOCAL_NOTES_RESERVED_FILENAME_PREFIX}{trimmed}")
        } else {
            trimmed.to_string()
        }
    }
}

fn short_id(id: &str) -> String {
    let mut suffix: Vec<char> = id.chars().rev().take(LOCAL_NOTES_SHORT_ID_CHARS).collect();
    suffix.reverse();
    suffix.into_iter().collect()
}

fn note_file_name(context: &NoteContext, suffix: Option<&str>) -> String {
    let title = sanitize_component(&context.task_name);
    if let Some(value) = suffix {
        format!("{title} ({value}).{LOCAL_NOTES_EXTENSION}")
    } else {
        format!("{title}.{LOCAL_NOTES_EXTENSION}")
    }
}

fn active_directory(root: &Path, context: &NoteContext) -> PathBuf {
    root.join(local_notes_area_directory(context.life_area.as_deref()))
        .join(sanitize_component(&context.list_name))
}

pub(crate) fn desired_note_path(root: &Path, context: &NoteContext) -> Result<PathBuf, String> {
    let directory = active_directory(root, context);
    available_path(&directory, context)
}

pub(crate) fn archive_note_path(root: &Path, context: &NoteContext) -> Result<PathBuf, String> {
    let directory = root
        .join(LOCAL_NOTES_ARCHIVE_DIRECTORY)
        .join(local_notes_area_directory(context.life_area.as_deref()))
        .join(sanitize_component(&context.list_name));
    available_path(&directory, context)
}

fn available_path(directory: &Path, context: &NoteContext) -> Result<PathBuf, String> {
    let short = short_id(&context.task_id);
    let full = sanitize_component(&context.task_id);
    for suffix in [None, Some(short.as_str()), Some(full.as_str())] {
        let candidate = directory.join(note_file_name(context, suffix));
        if !candidate.exists()
            || document_task_id(&candidate).as_deref() == Some(context.task_id.as_str())
        {
            return Ok(candidate);
        }
    }
    Err(LOCAL_NOTES_PATH_OCCUPIED_MSG.to_string())
}

pub(crate) fn find_note(root: &Path, task_id: &str) -> Option<PathBuf> {
    find_note_below(root, task_id, 0)
}

fn find_note_below(directory: &Path, task_id: &str, depth: usize) -> Option<PathBuf> {
    if depth > LOCAL_NOTES_MAX_SCAN_DEPTH {
        return None;
    }
    let entries = fs::read_dir(directory).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(metadata) = fs::symlink_metadata(&path) else {
            continue;
        };
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_dir() {
            if let Some(found) = find_note_below(&path, task_id, depth + 1) {
                return Some(found);
            }
        } else if path.extension().and_then(|value| value.to_str()) == Some(LOCAL_NOTES_EXTENSION)
            && document_task_id(&path).as_deref() == Some(task_id)
        {
            return Some(path);
        }
    }
    None
}

pub(crate) fn ensure_safe_parent(root: &Path, destination: &Path) -> Result<(), String> {
    let canonical_root = root.canonicalize().map_err(|error| error.to_string())?;
    if !destination.starts_with(&canonical_root) {
        return Err(LOCAL_NOTES_PATH_ESCAPE_MSG.to_string());
    }
    let parent = destination
        .parent()
        .ok_or_else(|| LOCAL_NOTES_PATH_ESCAPE_MSG.to_string())?;
    let relative = parent
        .strip_prefix(&canonical_root)
        .map_err(|_| LOCAL_NOTES_PATH_ESCAPE_MSG.to_string())?;
    let mut current = canonical_root;
    for component in relative.components() {
        current.push(component);
        if current.exists() {
            let metadata = fs::symlink_metadata(&current).map_err(|error| error.to_string())?;
            if metadata.file_type().is_symlink() {
                return Err(LOCAL_NOTES_SYMLINK_MSG.to_string());
            }
        } else {
            fs::create_dir(&current).map_err(|error| error.to_string())?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(
                    &current,
                    fs::Permissions::from_mode(crate::constants::LOCAL_NOTES_DIRECTORY_MODE),
                )
                .map_err(|error| error.to_string())?;
            }
        }
    }
    Ok(())
}

pub(crate) fn relative_display(root: &Path, path: &Path) -> Option<String> {
    path.strip_prefix(root)
        .ok()
        .map(|relative| relative.to_string_lossy().into_owned())
}
