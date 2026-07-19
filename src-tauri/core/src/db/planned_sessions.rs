use rusqlite::{params, OptionalExtension};

use super::Db;
use crate::planner::{AutomaticPlanSuggestion, AUTOMATIC_PLANNER_MAX_SUGGESTIONS};
use crate::{new_id, now_ms, PlannedSession};

impl Db {
    pub fn planned_sessions(&self) -> rusqlite::Result<Vec<PlannedSession>> {
        let mut statement = self.conn.prepare(
            "SELECT id,task_id,start,end,updated_at
             FROM planned_sessions WHERE deleted_at IS NULL ORDER BY start,id",
        )?;
        let sessions = statement
            .query_map([], |row| {
                Ok(PlannedSession {
                    id: row.get(0)?,
                    task_id: row.get(1)?,
                    start: row.get(2)?,
                    end: row.get(3)?,
                    updated_at: row.get(4)?,
                    deleted_at: None,
                })
            })?
            .collect();
        sessions
    }

    pub fn add_planned_session(
        &self,
        task_id: &str,
        start: i64,
        end: i64,
    ) -> rusqlite::Result<Option<PlannedSession>> {
        let eligible = self
            .conn
            .query_row(
                "SELECT EXISTS(
                   SELECT 1 FROM tasks
                   WHERE id=?1 AND deleted_at IS NULL AND done IS NULL AND cadence IS NULL
                 )",
                params![task_id],
                |row| row.get::<_, bool>(0),
            )
            .optional()?
            .unwrap_or(false);
        if !eligible || end <= start || end <= now_ms() {
            return Ok(None);
        }
        let planned = PlannedSession {
            id: new_id(),
            task_id: task_id.to_string(),
            start,
            end,
            updated_at: now_ms(),
            deleted_at: None,
        };
        self.conn.execute(
            "INSERT INTO planned_sessions(id,task_id,start,end,updated_at)
             VALUES(?1,?2,?3,?4,?5)",
            params![
                planned.id,
                planned.task_id,
                planned.start,
                planned.end,
                planned.updated_at
            ],
        )?;
        Ok(Some(planned))
    }

    pub fn add_planned_session_suggestions(
        &self,
        suggestions: &[AutomaticPlanSuggestion],
    ) -> rusqlite::Result<Option<Vec<PlannedSession>>> {
        if suggestions.is_empty() || suggestions.len() > AUTOMATIC_PLANNER_MAX_SUGGESTIONS {
            return Ok(None);
        }
        let mut ordered = suggestions.to_vec();
        ordered.sort_by_key(|item| (item.start, item.end, item.task_id.clone()));
        if ordered
            .windows(2)
            .any(|items| items[0].end > items[1].start)
        {
            return Ok(None);
        }
        let transaction = self.conn.unchecked_transaction()?;
        let now = now_ms();
        let mut created = Vec::with_capacity(ordered.len());
        for suggestion in ordered {
            let eligible = transaction.query_row(
                "SELECT EXISTS(
                   SELECT 1 FROM tasks
                   WHERE id=?1 AND deleted_at IS NULL AND done IS NULL AND cadence IS NULL
                 )",
                params![suggestion.task_id],
                |row| row.get::<_, bool>(0),
            )?;
            let collides = transaction.query_row(
                "SELECT EXISTS(
                   SELECT 1 FROM planned_sessions
                   WHERE deleted_at IS NULL AND start<?1 AND end>?2
                 )",
                params![suggestion.end, suggestion.start],
                |row| row.get::<_, bool>(0),
            )?;
            if !eligible || collides || suggestion.end <= suggestion.start || suggestion.end <= now
            {
                return Ok(None);
            }
            let planned = PlannedSession {
                id: new_id(),
                task_id: suggestion.task_id,
                start: suggestion.start,
                end: suggestion.end,
                updated_at: now,
                deleted_at: None,
            };
            transaction.execute(
                "INSERT INTO planned_sessions(id,task_id,start,end,updated_at)
                 VALUES(?1,?2,?3,?4,?5)",
                params![
                    planned.id,
                    planned.task_id,
                    planned.start,
                    planned.end,
                    planned.updated_at
                ],
            )?;
            created.push(planned);
        }
        transaction.commit()?;
        Ok(Some(created))
    }

    pub fn update_planned_session(
        &self,
        id: &str,
        task_id: Option<&str>,
        start: i64,
        end: i64,
    ) -> rusqlite::Result<bool> {
        if end <= start || end <= now_ms() {
            return Ok(false);
        }
        if let Some(task_id) = task_id {
            let eligible = self.conn.query_row(
                "SELECT EXISTS(
                   SELECT 1 FROM tasks
                   WHERE id=?1 AND deleted_at IS NULL AND done IS NULL AND cadence IS NULL
                 )",
                params![task_id],
                |row| row.get::<_, bool>(0),
            )?;
            if !eligible {
                return Ok(false);
            }
        }
        Ok(self.conn.execute(
            "UPDATE planned_sessions SET task_id=COALESCE(?1,task_id),start=?2,end=?3,updated_at=?4
             WHERE id=?5 AND deleted_at IS NULL",
            params![task_id, start, end, now_ms(), id],
        )? > 0)
    }

    pub fn delete_planned_session(&self, id: &str) -> rusqlite::Result<bool> {
        Ok(self.conn.execute(
            "UPDATE planned_sessions SET deleted_at=?1,updated_at=?1
             WHERE id=?2 AND deleted_at IS NULL",
            params![now_ms(), id],
        )? > 0)
    }

    pub fn planned_sessions_dirty_since(
        &self,
        timestamp: i64,
    ) -> rusqlite::Result<Vec<PlannedSession>> {
        let mut statement = self.conn.prepare(
            "SELECT id,task_id,start,end,updated_at,deleted_at
             FROM planned_sessions WHERE updated_at>?1 ORDER BY updated_at,id",
        )?;
        let sessions = statement
            .query_map(params![timestamp], |row| {
                Ok(PlannedSession {
                    id: row.get(0)?,
                    task_id: row.get(1)?,
                    start: row.get(2)?,
                    end: row.get(3)?,
                    updated_at: row.get(4)?,
                    deleted_at: row.get(5)?,
                })
            })?
            .collect();
        sessions
    }

    pub fn upsert_planned_sessions_from_remote(
        &self,
        sessions: &[PlannedSession],
        force: bool,
    ) -> rusqlite::Result<()> {
        let transaction = self.conn.unchecked_transaction()?;
        for planned in sessions {
            let guard = if force {
                ""
            } else {
                " WHERE excluded.updated_at > planned_sessions.updated_at"
            };
            transaction.execute(
                &format!(
                    "INSERT INTO planned_sessions(id,task_id,start,end,updated_at,deleted_at)
                     VALUES(?1,?2,?3,?4,?5,?6)
                     ON CONFLICT(id) DO UPDATE SET task_id=excluded.task_id,
                       start=excluded.start,end=excluded.end,updated_at=excluded.updated_at,
                       deleted_at=excluded.deleted_at{guard}"
                ),
                params![
                    planned.id,
                    planned.task_id,
                    planned.start,
                    planned.end,
                    planned.updated_at,
                    planned.deleted_at
                ],
            )?;
        }
        transaction.commit()
    }
}
