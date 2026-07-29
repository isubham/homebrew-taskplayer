use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use super::format::{document_task_id, load_existing, managed_header};
use super::paths::{
    archive_note_path, desired_note_path, ensure_safe_parent, find_note, relative_display,
    NoteContext,
};
use super::LocalNoteDocument;
use crate::constants::{
    LOCAL_NOTES_CONFLICT_MSG, LOCAL_NOTES_DESTINATION_MSG, LOCAL_NOTES_PATH_OCCUPIED_MSG,
    LOCAL_NOTES_TEMP_PREFIX,
};

fn atomic_write(root: &Path, destination: &Path, contents: &str) -> Result<(), String> {
    ensure_safe_parent(root, destination)?;
    let parent = destination
        .parent()
        .ok_or_else(|| LOCAL_NOTES_DESTINATION_MSG.to_string())?;
    let temporary = parent.join(format!(
        "{LOCAL_NOTES_TEMP_PREFIX}-{}-{}.tmp",
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
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(
            &temporary,
            fs::Permissions::from_mode(crate::constants::LOCAL_NOTES_FILE_MODE),
        )
        .map_err(|error| error.to_string())?;
    }
    fs::rename(&temporary, destination).map_err(|error| error.to_string())
}

fn relocate(root: &Path, source: &Path, destination: &Path) -> Result<PathBuf, String> {
    if source == destination {
        return Ok(source.to_path_buf());
    }
    ensure_safe_parent(root, destination)?;
    if destination.exists() && document_task_id(destination) != document_task_id(source) {
        return Err(LOCAL_NOTES_PATH_OCCUPIED_MSG.to_string());
    }
    fs::rename(source, destination).map_err(|error| error.to_string())?;
    Ok(destination.to_path_buf())
}

fn located_path(root: &Path, context: &NoteContext) -> Result<(Option<PathBuf>, PathBuf), String> {
    let desired = desired_note_path(root, context)?;
    let existing = find_note(root, &context.task_id);
    Ok((existing, desired))
}

pub(crate) fn reconcile_note_path(root: &Path, context: &NoteContext) -> Result<(), String> {
    let (existing, desired) = located_path(root, context)?;
    if let Some(path) = existing {
        relocate(root, &path, &desired)?;
    }
    Ok(())
}

pub(crate) fn read_note(root: &Path, context: &NoteContext) -> Result<LocalNoteDocument, String> {
    let (existing, desired) = located_path(root, context)?;
    let path = match existing {
        Some(path) => relocate(root, &path, &desired)?,
        None => {
            return Ok(LocalNoteDocument {
                enabled: true,
                available: true,
                exists: false,
                body: String::new(),
                revision: None,
                relative_path: relative_display(root, &desired),
                absolute_path: Some(desired.to_string_lossy().into_owned()),
                vim_mode: false,
            });
        }
    };
    let (_, body, current_revision) = load_existing(&path)?;
    Ok(LocalNoteDocument {
        enabled: true,
        available: true,
        exists: true,
        body,
        revision: Some(current_revision),
        relative_path: relative_display(root, &path),
        absolute_path: Some(path.to_string_lossy().into_owned()),
        vim_mode: false,
    })
}

pub(crate) fn save_note(
    root: &Path,
    context: &NoteContext,
    body: &str,
    expected_revision: Option<&str>,
    force: bool,
) -> Result<LocalNoteDocument, String> {
    let (existing, desired) = located_path(root, context)?;
    let path = match existing {
        Some(path) => relocate(root, &path, &desired)?,
        None => desired,
    };
    let existing_document = path.exists().then(|| load_existing(&path)).transpose()?;
    if !force {
        let current = existing_document
            .as_ref()
            .map(|(_, _, current_revision)| current_revision.as_str());
        if current != expected_revision {
            return Err(LOCAL_NOTES_CONFLICT_MSG.to_string());
        }
    }
    if existing_document.is_none() && body.is_empty() {
        return read_note(root, context);
    }
    let header = existing_document
        .as_ref()
        .map(|(header, _, _)| header.clone())
        .unwrap_or_else(|| managed_header(&context.task_id));
    let newline = if header.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let normalized_body = body.replace("\r\n", "\n").replace('\n', newline);
    atomic_write(root, &path, &format!("{header}{normalized_body}"))?;
    read_note(root, context)
}

pub(crate) fn ensure_note_file(
    root: &Path,
    context: &NoteContext,
) -> Result<LocalNoteDocument, String> {
    let current = read_note(root, context)?;
    if current.exists {
        return Ok(current);
    }
    let path = desired_note_path(root, context)?;
    atomic_write(root, &path, &managed_header(&context.task_id))?;
    read_note(root, context)
}

pub(crate) fn archive_note(root: &Path, context: &NoteContext) -> Result<(), String> {
    let Some(existing) = find_note(root, &context.task_id) else {
        return Ok(());
    };
    let destination = archive_note_path(root, context)?;
    relocate(root, &existing, &destination)?;
    Ok(())
}
