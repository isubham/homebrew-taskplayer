use std::fs;
use std::path::PathBuf;

use super::{archive_entry, list_entries, new_entry, read_entry, save_entry, JournalRelatedItem};
use crate::constants::{JOURNAL_INVALID_MOOD_MSG, LOCAL_NOTES_CONFLICT_MSG};

pub(super) fn test_root(label: &str) -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "taskplayer-journal-{label}-{}-{}",
        std::process::id(),
        taskplayer_core::models::now_ms()
    ));
    fs::create_dir_all(&root).unwrap();
    root.canonicalize().unwrap()
}

pub(super) fn save_new(root: &PathBuf, date: &str, body: &str) -> super::JournalDocument {
    let draft = new_entry(root, date).unwrap();
    save_entry(
        root,
        &draft.id,
        &draft.date,
        draft.created_at,
        body,
        None,
        &[],
        None,
        false,
    )
    .unwrap()
}

#[test]
fn saves_multiple_entries_for_one_day_with_first_line_titles() {
    let root = test_root("multiple");
    let first = save_new(&root, "2026-07-29", "Project concern\n\nMore detail.");
    let second = save_new(&root, "2026-07-29", "Relationship thought\n\nMore detail.");

    let entries = list_entries(&root).unwrap();
    assert_eq!(entries.len(), 2);
    assert_ne!(first.id, second.id);
    assert!(first.absolute_path.contains("Project concern"));
    assert_eq!(entries[0].date, entries[1].date);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn stores_optional_mood_and_related_items() {
    let root = test_root("metadata");
    let draft = new_entry(&root, "2026-07-29").unwrap();
    let related = JournalRelatedItem {
        kind: "list".to_string(),
        id: "list123".to_string(),
        label: "Home budget".to_string(),
    };
    let saved = save_entry(
        &root,
        &draft.id,
        &draft.date,
        draft.created_at,
        "A calm day.",
        Some("happy"),
        std::slice::from_ref(&related),
        None,
        false,
    )
    .unwrap();
    assert_eq!(saved.mood.as_deref(), Some("happy"));
    assert_eq!(saved.related_items, vec![related]);
    assert_eq!(read_entry(&root, &saved.id).unwrap().body, "A calm day.");
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn keeps_empty_drafts_unsaved_and_rejects_unknown_moods() {
    let root = test_root("validation");
    let draft = new_entry(&root, "2026-07-29").unwrap();
    let empty = save_entry(
        &root,
        &draft.id,
        &draft.date,
        draft.created_at,
        " ",
        None,
        &[],
        None,
        false,
    )
    .unwrap();
    assert!(empty.revision.is_none());
    assert!(list_entries(&root).unwrap().is_empty());
    assert_eq!(
        save_entry(
            &root,
            &draft.id,
            &draft.date,
            draft.created_at,
            "Body",
            Some("great"),
            &[],
            None,
            false,
        )
        .unwrap_err(),
        JOURNAL_INVALID_MOOD_MSG
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn renames_the_file_and_refuses_stale_writes() {
    let root = test_root("rename-conflict");
    let first = save_new(&root, "2026-07-29", "First title\nBody");
    let second = save_entry(
        &root,
        &first.id,
        &first.date,
        first.created_at,
        "Second title\nBody",
        None,
        &[],
        first.revision.as_deref(),
        false,
    )
    .unwrap();
    assert_ne!(first.absolute_path, second.absolute_path);
    assert!(!PathBuf::from(first.absolute_path).exists());
    assert_eq!(
        save_entry(
            &root,
            &first.id,
            &first.date,
            first.created_at,
            "Stale",
            None,
            &[],
            first.revision.as_deref(),
            false,
        )
        .unwrap_err(),
        LOCAL_NOTES_CONFLICT_MSG
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn refuses_to_archive_an_entry_changed_externally() {
    let root = test_root("archive-conflict");
    let first = save_new(&root, "2026-07-29", "First");
    let second = save_entry(
        &root,
        &first.id,
        &first.date,
        first.created_at,
        "Second",
        None,
        &[],
        first.revision.as_deref(),
        false,
    )
    .unwrap();
    assert_eq!(
        archive_entry(&root, &first.id, first.revision.as_deref()).unwrap_err(),
        LOCAL_NOTES_CONFLICT_MSG
    );
    assert_eq!(
        read_entry(&root, &first.id).unwrap().revision,
        second.revision
    );
    fs::remove_dir_all(root).unwrap();
}
