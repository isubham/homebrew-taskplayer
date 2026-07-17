use super::*;

#[derive(Debug, Serialize, Deserialize)]
pub(super) struct RemoteMusicFavorite {
    pub(super) user_id: String,
    pub(super) track_id: String,
    pub(super) title: String,
    pub(super) artist: String,
    #[serde(default)]
    pub(super) artwork_urls: Vec<String>,
    pub(super) permalink: Option<String>,
    pub(super) source_type: String,
    pub(super) updated_at: i64,
    pub(super) deleted_at: Option<i64>,
}

impl RemoteMusicFavorite {
    pub(super) fn from_local(favorite: &MusicFavorite, user_id: &str) -> Self {
        Self {
            user_id: user_id.to_string(),
            track_id: favorite.track_id.clone(),
            title: favorite.title.clone(),
            artist: favorite.artist.clone(),
            artwork_urls: favorite.artwork_urls.clone(),
            permalink: favorite.permalink.clone(),
            source_type: favorite.source_type.clone(),
            updated_at: favorite.updated_at,
            deleted_at: favorite.deleted_at,
        }
    }

    pub(super) fn into_local(self) -> MusicFavorite {
        MusicFavorite {
            track_id: self.track_id,
            title: self.title,
            artist: self.artist,
            artwork_urls: self.artwork_urls,
            permalink: self.permalink,
            source_type: self.source_type,
            updated_at: self.updated_at,
            deleted_at: self.deleted_at,
        }
    }
}
