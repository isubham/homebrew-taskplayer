use sha2::{Digest, Sha256};

use super::JournalRelatedItem;
use crate::constants::{
    JOURNAL_ALLOWED_MOODS, JOURNAL_ALLOWED_RELATED_KINDS, JOURNAL_CREATED_AT_KEY, JOURNAL_DATE_KEY,
    JOURNAL_ENTRY_ID_CHARS, JOURNAL_EXCERPT_CHARS, JOURNAL_FORMAT_KEY, JOURNAL_FORMAT_VERSION,
    JOURNAL_ID_KEY, JOURNAL_INVALID_ENTRY_MSG, JOURNAL_INVALID_MOOD_MSG,
    JOURNAL_INVALID_RELATED_ITEM_MSG, JOURNAL_MOOD_KEY, JOURNAL_RELATED_ITEMS_KEY,
    JOURNAL_RELATED_LABEL_CHARS, JOURNAL_TITLE_FALLBACK, LOCAL_NOTES_FRONTMATTER_DELIMITER,
    LOCAL_NOTES_INVALID_FRONTMATTER_MSG,
};

pub(super) struct ParsedJournal {
    pub(super) id: Option<String>,
    pub(super) date: String,
    pub(super) created_at: Option<i64>,
    pub(super) mood: Option<String>,
    pub(super) related_items: Vec<JournalRelatedItem>,
    pub(super) body: String,
}

pub(super) fn revision(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub(super) fn validate_mood(mood: Option<&str>) -> Result<Option<String>, String> {
    match mood {
        Some(value) if JOURNAL_ALLOWED_MOODS.contains(&value) => Ok(Some(value.to_string())),
        Some(_) => Err(JOURNAL_INVALID_MOOD_MSG.to_string()),
        None => Ok(None),
    }
}

pub(super) fn validate_entry_id(id: &str) -> Result<(), String> {
    let valid = !id.is_empty()
        && id.len() <= JOURNAL_ENTRY_ID_CHARS
        && id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'));
    valid
        .then_some(())
        .ok_or_else(|| JOURNAL_INVALID_ENTRY_MSG.to_string())
}

fn validate_related_items(items: &[JournalRelatedItem]) -> Result<Vec<JournalRelatedItem>, String> {
    items
        .iter()
        .map(|item| {
            validate_entry_id(&item.id)
                .map_err(|_| JOURNAL_INVALID_RELATED_ITEM_MSG.to_string())?;
            let label = item.label.trim();
            if !JOURNAL_ALLOWED_RELATED_KINDS.contains(&item.kind.as_str())
                || label.is_empty()
                || label.chars().count() > JOURNAL_RELATED_LABEL_CHARS
            {
                return Err(JOURNAL_INVALID_RELATED_ITEM_MSG.to_string());
            }
            Ok(JournalRelatedItem {
                kind: item.kind.clone(),
                id: item.id.clone(),
                label: label.to_string(),
            })
        })
        .collect()
}

pub(super) fn serialize(
    id: &str,
    date: &str,
    created_at: i64,
    mood: Option<&str>,
    related_items: &[JournalRelatedItem],
    body: &str,
) -> Result<String, String> {
    validate_entry_id(id)?;
    let mood = validate_mood(mood)?;
    let related_items = validate_related_items(related_items)?;
    let mut header = format!(
        "{LOCAL_NOTES_FRONTMATTER_DELIMITER}\n{JOURNAL_FORMAT_KEY}: {JOURNAL_FORMAT_VERSION}\n{JOURNAL_ID_KEY}: {id}\n{JOURNAL_DATE_KEY}: {date}\n{JOURNAL_CREATED_AT_KEY}: {created_at}\n"
    );
    if let Some(value) = mood {
        header.push_str(&format!("{JOURNAL_MOOD_KEY}: {value}\n"));
    }
    if !related_items.is_empty() {
        let encoded = serde_json::to_string(&related_items).map_err(|error| error.to_string())?;
        header.push_str(&format!("{JOURNAL_RELATED_ITEMS_KEY}: {encoded}\n"));
    }
    header.push_str(&format!("{LOCAL_NOTES_FRONTMATTER_DELIMITER}\n\n"));
    Ok(format!("{header}{}", body.replace("\r\n", "\n")))
}

pub(super) fn parse(contents: &str) -> Result<ParsedJournal, String> {
    let mut lines = contents.lines();
    if lines.next() != Some(LOCAL_NOTES_FRONTMATTER_DELIMITER) {
        return Err(LOCAL_NOTES_INVALID_FRONTMATTER_MSG.to_string());
    }
    let mut id = None;
    let mut date = None;
    let mut created_at = None;
    let mut mood = None;
    let mut related_items = Vec::new();
    let mut closed = false;
    for line in &mut lines {
        if line == LOCAL_NOTES_FRONTMATTER_DELIMITER {
            closed = true;
            break;
        }
        if let Some((key, value)) = line.split_once(':') {
            match key.trim() {
                JOURNAL_ID_KEY => id = Some(value.trim().to_string()),
                JOURNAL_DATE_KEY => date = Some(value.trim().to_string()),
                JOURNAL_CREATED_AT_KEY => created_at = value.trim().parse().ok(),
                JOURNAL_MOOD_KEY => mood = Some(value.trim().to_string()),
                JOURNAL_RELATED_ITEMS_KEY => {
                    related_items = serde_json::from_str(value.trim()).unwrap_or_default()
                }
                _ => {}
            }
        }
    }
    if !closed {
        return Err(LOCAL_NOTES_INVALID_FRONTMATTER_MSG.to_string());
    }
    let body = lines.collect::<Vec<_>>().join("\n");
    let body = body.strip_prefix('\n').unwrap_or(&body).to_string();
    let date = date.ok_or_else(|| LOCAL_NOTES_INVALID_FRONTMATTER_MSG.to_string())?;
    let mood = validate_mood(mood.as_deref()).unwrap_or(None);
    if let Some(value) = id.as_deref() {
        validate_entry_id(value)?;
    }
    let related_items = validate_related_items(&related_items).unwrap_or_default();
    Ok(ParsedJournal {
        id,
        date,
        created_at,
        mood,
        related_items,
        body,
    })
}

pub(super) fn title(body: &str) -> String {
    body.lines()
        .map(str::trim)
        .find(|line| !line.is_empty() && !line.starts_with("!["))
        .map(|line| line.trim_start_matches('#').trim())
        .filter(|line| !line.is_empty())
        .unwrap_or(JOURNAL_TITLE_FALLBACK)
        .to_string()
}

pub(super) fn excerpt(body: &str) -> String {
    let mut skipped_title = false;
    let text = body
        .lines()
        .filter(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with("![") {
                return false;
            }
            if !skipped_title {
                skipped_title = true;
                return false;
            }
            true
        })
        .collect::<Vec<_>>()
        .join(" ");
    text.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(JOURNAL_EXCERPT_CHARS)
        .collect()
}
