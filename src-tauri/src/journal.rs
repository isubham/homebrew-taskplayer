use serde::{Deserialize, Serialize};

mod deletion;
mod document;
mod format;
pub(crate) mod images;
mod paths;
mod storage;

#[cfg(test)]
mod image_tests;
#[cfg(test)]
mod legacy_tests;
#[cfg(test)]
mod tests;

pub(crate) use deletion::archive_entry;
pub(crate) use document::{list_entries, new_entry, read_entry};
pub(crate) use images::save_image;
pub(crate) use storage::save_entry;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct JournalRelatedItem {
    pub(crate) kind: String,
    pub(crate) id: String,
    pub(crate) label: String,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct JournalEntrySummary {
    pub(crate) id: String,
    pub(crate) date: String,
    #[specta(type = f64)]
    pub(crate) created_at: i64,
    pub(crate) title: String,
    pub(crate) mood: Option<String>,
    pub(crate) excerpt: String,
    pub(crate) related_items: Vec<JournalRelatedItem>,
    pub(crate) first_asset: Option<JournalAsset>,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct JournalAsset {
    pub(crate) markdown_path: String,
    pub(crate) mime_type: String,
    pub(crate) bytes: Vec<u8>,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct JournalDocument {
    pub(crate) id: String,
    pub(crate) date: String,
    #[specta(type = f64)]
    pub(crate) created_at: i64,
    pub(crate) title: String,
    pub(crate) mood: Option<String>,
    pub(crate) related_items: Vec<JournalRelatedItem>,
    pub(crate) body: String,
    pub(crate) revision: Option<String>,
    pub(crate) relative_path: String,
    pub(crate) absolute_path: String,
    pub(crate) assets: Vec<JournalAsset>,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct JournalImageResult {
    pub(crate) markdown: String,
}
