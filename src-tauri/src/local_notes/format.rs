use std::fs;
use std::path::Path;

use sha2::{Digest, Sha256};

use crate::constants::{
    LOCAL_NOTES_FORMAT_KEY, LOCAL_NOTES_FORMAT_VERSION, LOCAL_NOTES_FRONTMATTER_DELIMITER,
    LOCAL_NOTES_INVALID_FRONTMATTER_MSG, LOCAL_NOTES_TASK_ID_KEY,
};

pub(super) fn revision(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub(super) fn managed_header(task_id: &str) -> String {
    format!(
        "{LOCAL_NOTES_FRONTMATTER_DELIMITER}\n{LOCAL_NOTES_TASK_ID_KEY}: \"{task_id}\"\n{LOCAL_NOTES_FORMAT_KEY}: {LOCAL_NOTES_FORMAT_VERSION}\n{LOCAL_NOTES_FRONTMATTER_DELIMITER}\n\n"
    )
}

fn split_document(contents: &str) -> Option<(&str, &str)> {
    let newline = if contents.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let opening = format!("{LOCAL_NOTES_FRONTMATTER_DELIMITER}{newline}");
    if !contents.starts_with(&opening) {
        return None;
    }
    let closing = format!("{newline}{LOCAL_NOTES_FRONTMATTER_DELIMITER}{newline}");
    let after_opening = opening.len();
    let closing_offset = contents[after_opening..].find(&closing)? + after_opening;
    let body_offset = closing_offset + closing.len();
    let body_offset = if contents[body_offset..].starts_with(newline) {
        body_offset + newline.len()
    } else {
        body_offset
    };
    Some((&contents[..body_offset], &contents[body_offset..]))
}

fn metadata_value(contents: &str, key: &str) -> Option<String> {
    let (header, _) = split_document(contents)?;
    header.lines().find_map(|line| {
        let (candidate, value) = line.split_once(':')?;
        (candidate.trim() == key).then(|| value.trim().trim_matches('"').to_string())
    })
}

pub(super) fn document_task_id(path: &Path) -> Option<String> {
    if fs::symlink_metadata(path).ok()?.file_type().is_symlink() {
        return None;
    }
    let contents = fs::read_to_string(path).ok()?;
    metadata_value(&contents, LOCAL_NOTES_TASK_ID_KEY)
}

pub(super) fn load_existing(path: &Path) -> Result<(String, String, String), String> {
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    let contents = String::from_utf8(bytes.clone()).map_err(|error| error.to_string())?;
    let (header, body) =
        split_document(&contents).ok_or_else(|| LOCAL_NOTES_INVALID_FRONTMATTER_MSG.to_string())?;
    Ok((header.to_string(), body.to_string(), revision(&bytes)))
}
