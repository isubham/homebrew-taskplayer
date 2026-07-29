use std::fs;
use std::path::PathBuf;

use super::document::{archive_note, read_note, reconcile_note_path, save_note};
use super::paths::{sanitize_component, NoteContext};
use super::{load_state, update_root, update_vim_mode, LocalNotesState};
use crate::constants::{
    LOCAL_NOTES_ARCHIVE_DIRECTORY, LOCAL_NOTES_CONFIG_FILE, LOCAL_NOTES_CONFLICT_MSG,
};

fn test_root(label: &str) -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "taskplayer-local-notes-{label}-{}-{}",
        std::process::id(),
        taskplayer_core::models::now_ms()
    ));
    fs::create_dir_all(&root).unwrap();
    root.canonicalize().unwrap()
}

fn context() -> NoteContext {
    NoteContext {
        task_id: "task-123456".to_string(),
        task_name: "Prepare / review".to_string(),
        list_name: "Quarterly: planning".to_string(),
        life_area: Some("career".to_string()),
    }
}

#[test]
fn persists_vim_mode_with_the_local_notes_root() {
    let data_dir = test_root("vim-config");
    fs::write(data_dir.join(LOCAL_NOTES_CONFIG_FILE), r#"{"root":null}"#).unwrap();
    assert!(!load_state(&data_dir).vim_mode);

    let notes_root = data_dir.join("notes");
    fs::create_dir(&notes_root).unwrap();
    let initial = LocalNotesState::default();
    let connected = update_root(&data_dir, &initial, Some(&notes_root)).unwrap();
    let enabled = update_vim_mode(&data_dir, &connected, true).unwrap();
    let loaded = load_state(&data_dir);

    assert!(enabled.vim_mode);
    assert!(loaded.vim_mode);
    assert_eq!(loaded.root, Some(notes_root.canonicalize().unwrap()));
    fs::remove_dir_all(data_dir).unwrap();
}

#[test]
fn sanitizes_portable_path_components() {
    assert_eq!(sanitize_component("  A/B:*?  "), "A-B---");
    assert_eq!(sanitize_component("../"), "-");
    assert_eq!(sanitize_component("..."), "Untitled");
    assert_eq!(sanitize_component("CON"), "_CON");
    assert_eq!(sanitize_component("lpt9.md"), "_lpt9.md");
}

#[test]
fn saves_reads_reconciles_and_archives_by_stable_id() {
    let root = test_root("lifecycle");
    let original = context();
    let saved = save_note(&root, &original, "Private body", None, false).unwrap();
    assert!(saved.exists);
    assert_eq!(saved.body, "Private body");
    assert!(PathBuf::from(saved.absolute_path.as_deref().unwrap()).starts_with(&root));
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        let note_path = super::paths::find_note(&root, &original.task_id).unwrap();
        let file_mode = fs::metadata(&note_path).unwrap().permissions().mode()
            & crate::constants::LOCAL_NOTES_PERMISSION_MASK;
        let directory_mode = fs::metadata(note_path.parent().unwrap())
            .unwrap()
            .permissions()
            .mode()
            & crate::constants::LOCAL_NOTES_PERMISSION_MASK;
        assert_eq!(file_mode, crate::constants::LOCAL_NOTES_FILE_MODE);
        assert_eq!(directory_mode, crate::constants::LOCAL_NOTES_DIRECTORY_MODE);
    }

    let mut renamed = original.clone();
    renamed.task_name = "Renamed review".to_string();
    reconcile_note_path(&root, &renamed).unwrap();
    let moved = read_note(&root, &renamed).unwrap();
    assert!(moved.relative_path.unwrap().contains("Renamed review.md"));

    archive_note(&root, &renamed).unwrap();
    let archived = super::paths::find_note(&root, &renamed.task_id).unwrap();
    assert!(archived
        .strip_prefix(&root)
        .unwrap()
        .starts_with(LOCAL_NOTES_ARCHIVE_DIRECTORY));
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn refuses_to_overwrite_an_external_change() {
    let root = test_root("conflict");
    let note = context();
    let first = save_note(&root, &note, "First", None, false).unwrap();
    let second = save_note(&root, &note, "Second", first.revision.as_deref(), false).unwrap();
    let error = save_note(
        &root,
        &note,
        "Stale write",
        first.revision.as_deref(),
        false,
    )
    .unwrap_err();
    assert_eq!(error, LOCAL_NOTES_CONFLICT_MSG);
    assert_eq!(read_note(&root, &note).unwrap().revision, second.revision);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn preserves_user_frontmatter_and_avoids_unrelated_files() {
    let root = test_root("frontmatter");
    let note = context();
    let preferred = root
        .join("Career - Work")
        .join("Quarterly- planning")
        .join("Prepare - review.md");
    fs::create_dir_all(preferred.parent().unwrap()).unwrap();
    fs::write(&preferred, "Unrelated Markdown").unwrap();

    let saved = save_note(&root, &note, "Body", None, false).unwrap();
    assert!(saved.relative_path.as_deref().unwrap().contains("(123456)"));
    let path = super::paths::find_note(&root, &note.task_id).unwrap();
    let original = fs::read_to_string(&path).unwrap();
    let customized = original.replacen(
        "taskplayer_format: 1",
        "taskplayer_format: 1\ntags: private",
        1,
    );
    fs::write(&path, customized).unwrap();
    let current = read_note(&root, &note).unwrap();
    save_note(&root, &note, "Updated", current.revision.as_deref(), false).unwrap();
    assert!(fs::read_to_string(path).unwrap().contains("tags: private"));
    fs::remove_dir_all(root).unwrap();
}

#[cfg(unix)]
#[test]
fn ignores_symbolic_links_during_note_discovery() {
    use std::os::unix::fs::symlink;

    let root = test_root("symlink");
    let outside = test_root("outside");
    let external = outside.join("external.md");
    fs::write(
        &external,
        "---\ntaskplayer_task_id: \"task-123456\"\n---\n\nOutside",
    )
    .unwrap();
    symlink(&external, root.join("linked.md")).unwrap();
    assert!(super::paths::find_note(&root, "task-123456").is_none());
    fs::remove_dir_all(root).unwrap();
    fs::remove_dir_all(outside).unwrap();
}
