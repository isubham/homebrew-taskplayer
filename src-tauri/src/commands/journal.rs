use std::path::PathBuf;

use super::super::*;

fn available_root(state: &AppState) -> Result<PathBuf, String> {
    let root = state
        .local_notes
        .lock()
        .unwrap()
        .root
        .clone()
        .ok_or_else(|| LOCAL_NOTES_DISABLED_MSG.to_string())?;
    if !root.is_dir() {
        return Err(LOCAL_NOTES_UNAVAILABLE_MSG.to_string());
    }
    Ok(root)
}

#[specta::specta]
#[tauri::command]
pub(crate) fn list_journal_entries(
    state: State<AppState>,
) -> Result<Vec<JournalEntrySummary>, String> {
    journal::list_entries(&available_root(state.inner())?)
}

#[specta::specta]
#[tauri::command]
pub(crate) fn new_journal_entry(
    state: State<AppState>,
    date: String,
) -> Result<JournalDocument, String> {
    journal::new_entry(&available_root(state.inner())?, &date)
}

#[specta::specta]
#[tauri::command]
pub(crate) fn read_journal_entry(
    state: State<AppState>,
    id: String,
) -> Result<JournalDocument, String> {
    journal::read_entry(&available_root(state.inner())?, &id)
}

#[specta::specta]
#[tauri::command]
pub(crate) fn save_journal_entry(
    state: State<AppState>,
    id: String,
    date: String,
    created_at: f64,
    body: String,
    mood: Option<String>,
    related_items: Vec<JournalRelatedItem>,
    expected_revision: Option<String>,
    force: bool,
) -> Result<JournalDocument, String> {
    journal::save_entry(
        &available_root(state.inner())?,
        &id,
        &date,
        created_at.round() as i64,
        &body,
        mood.as_deref(),
        &related_items,
        expected_revision.as_deref(),
        force,
    )
}

#[specta::specta]
#[tauri::command]
pub(crate) fn delete_journal_entry(
    state: State<AppState>,
    id: String,
    expected_revision: Option<String>,
) -> Result<(), String> {
    journal::archive_entry(
        &available_root(state.inner())?,
        &id,
        expected_revision.as_deref(),
    )
}

#[specta::specta]
#[tauri::command]
pub(crate) fn save_journal_image(
    state: State<AppState>,
    entry_id: String,
    mime_type: String,
    bytes: Vec<u8>,
) -> Result<JournalImageResult, String> {
    journal::save_image(
        &available_root(state.inner())?,
        &entry_id,
        &mime_type,
        &bytes,
    )
}

#[specta::specta]
#[tauri::command]
pub(crate) fn open_journal_entry_externally(
    app: AppHandle,
    state: State<AppState>,
    id: String,
) -> Result<(), String> {
    let root = available_root(state.inner())?;
    let document = journal::read_entry(&root, &id)?;
    if document.revision.is_none() {
        return Ok(());
    }
    app.opener()
        .open_path(document.absolute_path, None::<&str>)
        .map_err(|error| error.to_string())
}
