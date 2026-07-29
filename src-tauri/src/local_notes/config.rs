use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::LocalNotesState;
use crate::constants::{
    LOCAL_NOTES_CONFIG_FILE, LOCAL_NOTES_INVALID_DIRECTORY_MSG, LOCAL_NOTES_TEMP_PREFIX,
};

#[derive(Serialize, Deserialize)]
struct PersistedLocalNotes {
    root: Option<String>,
    #[serde(default)]
    vim_mode: bool,
}

fn config_path(data_dir: &Path) -> PathBuf {
    data_dir.join(LOCAL_NOTES_CONFIG_FILE)
}

pub(crate) fn load_state(data_dir: &Path) -> LocalNotesState {
    let persisted = fs::read_to_string(config_path(data_dir))
        .ok()
        .and_then(|value| serde_json::from_str::<PersistedLocalNotes>(&value).ok());
    LocalNotesState {
        root: persisted
            .as_ref()
            .and_then(|value| value.root.as_ref())
            .map(PathBuf::from),
        vim_mode: persisted.is_some_and(|value| value.vim_mode),
    }
}

fn persist_state(data_dir: &Path, state: &LocalNotesState) -> Result<(), String> {
    fs::create_dir_all(data_dir).map_err(|error| error.to_string())?;
    let destination = config_path(data_dir);
    let temporary = data_dir.join(format!("{LOCAL_NOTES_TEMP_PREFIX}-config.tmp"));
    let payload = PersistedLocalNotes {
        root: state
            .root
            .as_ref()
            .map(|path| path.to_string_lossy().into_owned()),
        vim_mode: state.vim_mode,
    };
    let bytes = serde_json::to_vec_pretty(&payload).map_err(|error| error.to_string())?;
    let mut file = fs::File::create(&temporary).map_err(|error| error.to_string())?;
    file.write_all(&bytes).map_err(|error| error.to_string())?;
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

pub(crate) fn update_root(
    data_dir: &Path,
    current: &LocalNotesState,
    requested_root: Option<&Path>,
) -> Result<LocalNotesState, String> {
    let root = match requested_root {
        Some(path) => {
            let canonical = path
                .canonicalize()
                .map_err(|_| LOCAL_NOTES_INVALID_DIRECTORY_MSG.to_string())?;
            if !canonical.is_dir() {
                return Err(LOCAL_NOTES_INVALID_DIRECTORY_MSG.to_string());
            }
            Some(canonical)
        }
        None => None,
    };
    let next = LocalNotesState {
        root,
        vim_mode: current.vim_mode,
    };
    persist_state(data_dir, &next)?;
    Ok(next)
}

pub(crate) fn update_vim_mode(
    data_dir: &Path,
    current: &LocalNotesState,
    enabled: bool,
) -> Result<LocalNotesState, String> {
    let next = LocalNotesState {
        root: current.root.clone(),
        vim_mode: enabled,
    };
    persist_state(data_dir, &next)?;
    Ok(next)
}
