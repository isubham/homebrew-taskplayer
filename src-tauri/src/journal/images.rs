use std::fs;
use std::io::Write;
use std::path::Path;

use super::paths::asset_directory;
use super::JournalImageResult;
use crate::constants::{
    JOURNAL_ASSETS_DIRECTORY, JOURNAL_IMAGE_TOO_LARGE_MSG, JOURNAL_INVALID_IMAGE_MSG,
    JOURNAL_MAX_IMAGE_BYTES, LOCAL_NOTES_FILE_MODE, LOCAL_NOTES_TEMP_PREFIX,
};
use crate::local_notes::ensure_safe_parent;

pub(crate) fn image_extension(mime_type: &str) -> Option<&'static str> {
    match mime_type {
        "image/png" => Some("png"),
        "image/jpeg" => Some("jpg"),
        "image/gif" => Some("gif"),
        "image/webp" => Some("webp"),
        "image/heic" | "image/heif" => Some("heic"),
        _ => None,
    }
}

pub(crate) fn has_valid_signature(mime_type: &str, bytes: &[u8]) -> bool {
    match mime_type {
        "image/png" => bytes.starts_with(&[137, 80, 78, 71, 13, 10, 26, 10]),
        "image/jpeg" => bytes.starts_with(&[255, 216, 255]),
        "image/gif" => bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a"),
        "image/webp" => bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP"),
        "image/heic" | "image/heif" => {
            bytes.len() >= 12 && bytes.get(4..8) == Some(b"ftyp") && (
                bytes.get(8..12) == Some(b"heic") ||
                bytes.get(8..12) == Some(b"heix") ||
                bytes.get(8..12) == Some(b"mif1") ||
                bytes.get(8..12) == Some(b"msf1")
            )
        }
        _ => false,
    }
}

pub(crate) fn save_image(
    root: &Path,
    entry_id: &str,
    mime_type: &str,
    bytes: &[u8],
) -> Result<JournalImageResult, String> {
    let extension =
        image_extension(mime_type).ok_or_else(|| JOURNAL_INVALID_IMAGE_MSG.to_string())?;
    if !has_valid_signature(mime_type, bytes) {
        return Err(JOURNAL_INVALID_IMAGE_MSG.to_string());
    }
    if bytes.len() > JOURNAL_MAX_IMAGE_BYTES {
        return Err(JOURNAL_IMAGE_TOO_LARGE_MSG.to_string());
    }
    let directory = asset_directory(root, entry_id)?;
    let mut random = [0_u8; 8];
    getrandom::fill(&mut random).map_err(|error| error.to_string())?;
    let stem = random
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let destination = directory.join(format!("{stem}.{extension}"));
    ensure_safe_parent(root, &destination)?;
    let temporary = directory.join(format!("{LOCAL_NOTES_TEMP_PREFIX}-{stem}.tmp"));
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(|error| error.to_string())?;
    file.write_all(bytes).map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())?;
    #[cfg(unix)]
    fs::set_permissions(
        &temporary,
        <fs::Permissions as std::os::unix::fs::PermissionsExt>::from_mode(LOCAL_NOTES_FILE_MODE),
    )
    .map_err(|error| error.to_string())?;
    fs::rename(&temporary, &destination).map_err(|error| error.to_string())?;
    let path = format!("{JOURNAL_ASSETS_DIRECTORY}/{entry_id}/{stem}.{extension}");
    Ok(JournalImageResult {
        markdown: format!("![]({path})"),
    })
}
