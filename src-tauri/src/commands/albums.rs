use super::super::*;

#[specta::specta]
#[tauri::command]
pub(crate) fn create_album(
    app: AppHandle,
    state: State<AppState>,
    list_id: String,
    name: String,
) -> Result<Snapshot, String> {
    {
        let db = state.db.lock().unwrap();
        db.add_album(&list_id, &name)
            .map_err(|error| error.to_string())?;
    }
    push(&app);
    Ok(build_snapshot(state.inner()))
}
