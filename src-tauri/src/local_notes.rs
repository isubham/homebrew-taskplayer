use std::path::PathBuf;

use serde::Serialize;

mod config;
mod document;
mod format;
mod paths;

#[cfg(test)]
mod tests;

pub(crate) use config::{load_state, update_root, update_vim_mode};
pub(crate) use document::{
    archive_note, ensure_note_file, read_note, reconcile_note_path, save_image, save_note,
};
pub(crate) use paths::NoteContext;
pub(crate) use paths::{ensure_safe_parent, sanitize_component};

#[derive(Clone, Debug, Default)]
pub(crate) struct LocalNotesState {
    pub(crate) root: Option<PathBuf>,
    pub(crate) vim_mode: bool,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalNotesSettings {
    pub(crate) enabled: bool,
    pub(crate) available: bool,
    pub(crate) root_path: Option<String>,
    pub(crate) vim_mode: bool,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalNoteDocument {
    pub(crate) enabled: bool,
    pub(crate) available: bool,
    pub(crate) exists: bool,
    pub(crate) body: String,
    pub(crate) revision: Option<String>,
    pub(crate) relative_path: Option<String>,
    pub(crate) absolute_path: Option<String>,
    pub(crate) vim_mode: bool,
}

impl LocalNoteDocument {
    pub(crate) fn disconnected(enabled: bool) -> Self {
        Self {
            enabled,
            available: false,
            exists: false,
            body: String::new(),
            revision: None,
            relative_path: None,
            absolute_path: None,
            vim_mode: false,
        }
    }
}
