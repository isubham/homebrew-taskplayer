use std::path::{Path, PathBuf};

use super::super::*;

fn note_context(state: &AppState, task_id: &str) -> Result<local_notes::NoteContext, String> {
    let db = state.db.lock().unwrap();
    let task = db
        .tasks()
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|task| task.id == task_id)
        .ok_or_else(|| LOCAL_NOTES_TASK_NOT_FOUND_MSG.to_string())?;
    let list = db
        .lists()
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|list| list.id == task.list_id)
        .ok_or_else(|| LOCAL_NOTES_LIST_NOT_FOUND_MSG.to_string())?;
    Ok(local_notes::NoteContext {
        task_id: task.id,
        task_name: task.name,
        list_name: list.name,
        life_area: list.life_area,
    })
}

fn configured_root(state: &AppState) -> Option<PathBuf> {
    state.local_notes.lock().unwrap().root.clone()
}

fn with_editor_preferences(mut document: LocalNoteDocument, state: &AppState) -> LocalNoteDocument {
    document.vim_mode = state.local_notes.lock().unwrap().vim_mode;
    document
}

fn available_root(state: &AppState) -> Result<PathBuf, String> {
    let root = configured_root(state).ok_or_else(|| LOCAL_NOTES_DISABLED_MSG.to_string())?;
    if !root.is_dir() {
        return Err(LOCAL_NOTES_UNAVAILABLE_MSG.to_string());
    }
    Ok(root)
}

pub(crate) fn reconcile_task_note(state: &AppState, task_id: &str) {
    let Some(root) = configured_root(state).filter(|path| path.is_dir()) else {
        return;
    };
    let result = note_context(state, task_id)
        .and_then(|context| local_notes::reconcile_note_path(&root, &context));
    if let Err(error) = result {
        log_line(format!("local notes path reconciliation failed: {error}"));
    }
}

pub(crate) fn archive_task_note(state: &AppState, task_id: &str) -> Result<(), String> {
    let Some(root) = configured_root(state) else {
        return Ok(());
    };
    if !root.is_dir() {
        return Err(LOCAL_NOTES_UNAVAILABLE_MSG.to_string());
    }
    let context = note_context(state, task_id)?;
    local_notes::archive_note(&root, &context)
}

#[specta::specta]
#[tauri::command]
pub(crate) fn get_local_notes_settings(state: State<AppState>) -> LocalNotesSettings {
    let local_notes = state.local_notes.lock().unwrap().clone();
    LocalNotesSettings {
        enabled: local_notes.root.is_some(),
        available: local_notes.root.as_ref().is_some_and(|path| path.is_dir()),
        root_path: local_notes
            .root
            .map(|path| path.to_string_lossy().into_owned()),
        vim_mode: local_notes.vim_mode,
    }
}

#[specta::specta]
#[tauri::command]
pub(crate) fn set_local_notes_directory(
    state: State<AppState>,
    path: String,
) -> Result<LocalNotesSettings, String> {
    let mut current = state.local_notes.lock().unwrap();
    *current = local_notes::update_root(&state.data_dir, &current, Some(Path::new(&path)))?;
    drop(current);
    Ok(get_local_notes_settings(state))
}

#[specta::specta]
#[tauri::command]
pub(crate) fn disable_local_notes(state: State<AppState>) -> Result<LocalNotesSettings, String> {
    let mut current = state.local_notes.lock().unwrap();
    *current = local_notes::update_root(&state.data_dir, &current, None)?;
    drop(current);
    Ok(get_local_notes_settings(state))
}

#[specta::specta]
#[tauri::command]
pub(crate) fn set_local_notes_vim_mode(
    state: State<AppState>,
    enabled: bool,
) -> Result<LocalNotesSettings, String> {
    let mut current = state.local_notes.lock().unwrap();
    *current = local_notes::update_vim_mode(&state.data_dir, &current, enabled)?;
    drop(current);
    Ok(get_local_notes_settings(state))
}

#[specta::specta]
#[tauri::command]
pub(crate) fn read_local_note(
    state: State<AppState>,
    task_id: String,
) -> Result<LocalNoteDocument, String> {
    let Some(root) = configured_root(state.inner()) else {
        return Ok(with_editor_preferences(
            LocalNoteDocument::disconnected(false),
            state.inner(),
        ));
    };
    if !root.is_dir() {
        return Ok(with_editor_preferences(
            LocalNoteDocument::disconnected(true),
            state.inner(),
        ));
    }
    local_notes::read_note(&root, &note_context(state.inner(), &task_id)?)
        .map(|document| with_editor_preferences(document, state.inner()))
}

#[specta::specta]
#[tauri::command]
pub(crate) fn save_local_note(
    state: State<AppState>,
    task_id: String,
    body: String,
    expected_revision: Option<String>,
    force: bool,
) -> Result<LocalNoteDocument, String> {
    let root = available_root(state.inner())?;
    let context = note_context(state.inner(), &task_id)?;
    local_notes::save_note(&root, &context, &body, expected_revision.as_deref(), force)
        .map(|document| with_editor_preferences(document, state.inner()))
}

#[specta::specta]
#[tauri::command]
pub(crate) fn open_local_note_externally(
    app: AppHandle,
    state: State<AppState>,
    task_id: String,
) -> Result<(), String> {
    let root = available_root(state.inner())?;
    let context = note_context(state.inner(), &task_id)?;
    let document = local_notes::ensure_note_file(&root, &context)?;
    let relative = document
        .relative_path
        .ok_or_else(|| LOCAL_NOTES_TASK_NOT_FOUND_MSG.to_string())?;
    app.opener()
        .open_path(
            root.join(relative).to_string_lossy().into_owned(),
            None::<&str>,
        )
        .map_err(|error| error.to_string())
}

#[specta::specta]
#[tauri::command]
pub(crate) fn reveal_local_notes_directory(
    app: AppHandle,
    state: State<AppState>,
) -> Result<(), String> {
    let root = available_root(state.inner())?;
    app.opener()
        .open_path(root.to_string_lossy().into_owned(), None::<&str>)
        .map_err(|error| error.to_string())
}
