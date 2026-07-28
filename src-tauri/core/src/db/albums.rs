use super::*;

fn album_id(list_id: &str, name: &str) -> String {
    format!("album:{list_id}:{name}")
}

impl Db {
    pub fn albums(&self) -> rusqlite::Result<Vec<Album>> {
        let mut statement = self.conn.prepare(
            "SELECT id,list_id,name,ord,updated_at
             FROM albums WHERE deleted_at IS NULL ORDER BY ord,name",
        )?;
        let albums = statement
            .query_map([], |row| {
                Ok(Album {
                    id: row.get(0)?,
                    list_id: row.get(1)?,
                    name: row.get(2)?,
                    order: row.get(3)?,
                    updated_at: row.get(4)?,
                    deleted_at: None,
                })
            })?
            .collect();
        albums
    }

    pub fn add_album(&self, list_id: &str, name: &str) -> rusqlite::Result<Album> {
        let name = name.trim();
        if name.is_empty() {
            return Err(rusqlite::Error::InvalidParameterName("name".into()));
        }
        let order = self.conn.query_row(
            "SELECT COUNT(*) FROM albums WHERE list_id=?1 AND deleted_at IS NULL",
            params![list_id],
            |row| row.get(0),
        )?;
        let album = Album {
            id: album_id(list_id, name),
            list_id: list_id.to_string(),
            name: name.to_string(),
            order,
            updated_at: now_ms(),
            deleted_at: None,
        };
        self.conn.execute(
            "INSERT INTO albums(id,list_id,name,ord,updated_at,deleted_at)
             VALUES(?1,?2,?3,?4,?5,NULL)
             ON CONFLICT(id) DO UPDATE SET deleted_at=NULL,updated_at=excluded.updated_at",
            params![
                album.id,
                album.list_id,
                album.name,
                album.order,
                album.updated_at
            ],
        )?;
        Ok(album)
    }

    pub fn albums_dirty_since(&self, timestamp: i64) -> rusqlite::Result<Vec<Album>> {
        let mut statement = self.conn.prepare(
            "SELECT id,list_id,name,ord,updated_at,deleted_at
             FROM albums WHERE updated_at>?1",
        )?;
        let albums = statement
            .query_map(params![timestamp], |row| {
                Ok(Album {
                    id: row.get(0)?,
                    list_id: row.get(1)?,
                    name: row.get(2)?,
                    order: row.get(3)?,
                    updated_at: row.get(4)?,
                    deleted_at: row.get(5)?,
                })
            })?
            .collect();
        albums
    }

    pub fn upsert_albums_from_remote(
        &self,
        albums: &[Album],
        force: bool,
    ) -> rusqlite::Result<()> {
        for album in albums {
            let condition = if force {
                ""
            } else {
                " WHERE excluded.updated_at > albums.updated_at"
            };
            self.conn.execute(
                &format!(
                    "INSERT INTO albums(id,list_id,name,ord,updated_at,deleted_at)
                     VALUES(?1,?2,?3,?4,?5,?6)
                     ON CONFLICT(id) DO UPDATE SET list_id=excluded.list_id,
                       name=excluded.name,ord=excluded.ord,
                       updated_at=excluded.updated_at,deleted_at=excluded.deleted_at{condition}"
                ),
                params![
                    album.id,
                    album.list_id,
                    album.name,
                    album.order,
                    album.updated_at,
                    album.deleted_at
                ],
            )?;
        }
        Ok(())
    }

    pub(crate) fn ensure_albums_for_legacy_tasks(&self) -> rusqlite::Result<()> {
        let now = now_ms();
        self.conn.execute(
            "INSERT OR IGNORE INTO albums(id,list_id,name,ord,updated_at)
             SELECT 'album:' || list_id || ':' || trim(album),
                    list_id,trim(album),MIN(ord),?1
             FROM tasks
             WHERE deleted_at IS NULL AND album IS NOT NULL AND trim(album)!=''
             GROUP BY list_id,trim(album)",
            params![now],
        )?;
        Ok(())
    }
}
