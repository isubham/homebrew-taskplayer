use std::fs;

use super::tests::test_root;
use super::{archive_entry, list_entries, new_entry, save_entry, save_image};

#[test]
fn stores_and_archives_entry_scoped_images() {
    let root = test_root("image-archive");
    let draft = new_entry(&root, "2026-07-29").unwrap();
    let bytes = [137, 80, 78, 71, 13, 10, 26, 10];
    let image = save_image(&root, &draft.id, "image/png", &bytes).unwrap();
    assert!(image
        .markdown
        .starts_with(&format!("![](_assets/{}/", draft.id)));
    let saved = save_entry(
        &root,
        &draft.id,
        &draft.date,
        draft.created_at,
        &image.markdown,
        None,
        &[],
        None,
        false,
    )
    .unwrap();
    assert_eq!(saved.assets[0].bytes, bytes);

    archive_entry(&root, &saved.id, saved.revision.as_deref()).unwrap();
    assert!(list_entries(&root).unwrap().is_empty());
    let archive = fs::read_dir(root.join("_Archived/Journal"))
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .path();
    assert!(archive.join("_assets").join(&saved.id).is_dir());
    fs::remove_dir_all(root).unwrap();
}

#[cfg(unix)]
#[test]
fn ignores_linked_journal_assets() {
    use std::os::unix::fs::symlink;

    let root = test_root("linked-image");
    let outside = test_root("linked-image-outside");
    let draft = new_entry(&root, "2026-07-29").unwrap();
    let image = outside.join("image.png");
    fs::write(&image, [137, 80, 78, 71, 13, 10, 26, 10]).unwrap();
    let asset_dir = root.join("Journal/_assets").join(&draft.id);
    fs::create_dir_all(&asset_dir).unwrap();
    symlink(&image, asset_dir.join("linked.png")).unwrap();
    let saved = save_entry(
        &root,
        &draft.id,
        &draft.date,
        draft.created_at,
        &format!("![](_assets/{}/linked.png)", draft.id),
        None,
        &[],
        None,
        false,
    )
    .unwrap();
    assert!(saved.assets.is_empty());
    fs::remove_dir_all(root).unwrap();
    fs::remove_dir_all(outside).unwrap();
}
