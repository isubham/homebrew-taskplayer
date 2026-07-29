use std::fs;

use super::tests::test_root;
use super::{list_entries, read_entry, save_entry};

#[test]
fn reads_and_upgrades_a_date_only_version_one_entry() {
    let root = test_root("legacy");
    let journal = root.join("Journal");
    fs::create_dir_all(&journal).unwrap();
    let legacy_assets = journal.join("_assets/2026-07-29");
    fs::create_dir_all(&legacy_assets).unwrap();
    fs::write(
        legacy_assets.join("image.png"),
        [137, 80, 78, 71, 13, 10, 26, 10],
    )
    .unwrap();
    fs::write(
        journal.join("2026-07-29.md"),
        "---\ntaskplayer_journal_format: 1\ntaskplayer_journal_date: 2026-07-29\n---\n\nLegacy title\n![](_assets/2026-07-29/image.png)",
    )
    .unwrap();

    let summary = list_entries(&root).unwrap().pop().unwrap();
    assert_eq!(summary.id, "legacy-2026-07-29");
    assert_eq!(summary.title, "Legacy title");
    let legacy = read_entry(&root, &summary.id).unwrap();
    let upgraded = save_entry(
        &root,
        &legacy.id,
        &legacy.date,
        legacy.created_at,
        &legacy.body,
        legacy.mood.as_deref(),
        &legacy.related_items,
        legacy.revision.as_deref(),
        false,
    )
    .unwrap();

    assert!(upgraded.absolute_path.contains("Legacy title"));
    assert!(upgraded
        .body
        .contains("_assets/legacy-2026-07-29/image.png"));
    assert!(journal
        .join("_assets/legacy-2026-07-29/image.png")
        .is_file());
    assert!(!journal.join("2026-07-29.md").exists());
    fs::remove_dir_all(root).unwrap();
}
