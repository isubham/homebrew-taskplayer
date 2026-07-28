use rusqlite::{params, OptionalExtension};

use super::Db;
use crate::{
    new_id, now_ms, Goal, GoalTaskLink, GOAL_STATUS_ACTIVE, GOAL_STATUS_ARCHIVED,
    GOAL_STATUS_COMPLETED,
};

fn valid_status(status: &str) -> bool {
    matches!(
        status,
        GOAL_STATUS_ACTIVE | GOAL_STATUS_COMPLETED | GOAL_STATUS_ARCHIVED
    )
}

impl Db {
    pub fn goals(&self) -> rusqlite::Result<Vec<Goal>> {
        self.goal_rows(
            "WHERE deleted_at IS NULL ORDER BY is_current_focus DESC,updated_at DESC",
            [],
        )
    }

    pub fn goal_task_links(&self) -> rusqlite::Result<Vec<GoalTaskLink>> {
        self.goal_link_rows(
            "WHERE deleted_at IS NULL ORDER BY updated_at,goal_id,task_id",
            [],
        )
    }

    pub fn save_goal(
        &self,
        id: Option<&str>,
        life_area: &str,
        title: &str,
        description: Option<&str>,
        status: &str,
        is_current_focus: bool,
        next_task_id: Option<&str>,
        task_ids: &[String],
    ) -> rusqlite::Result<Goal> {
        if title.trim().is_empty() || !valid_status(status) {
            return Err(rusqlite::Error::InvalidParameterName("goal".into()));
        }
        let id = id.map(str::to_string).unwrap_or_else(new_id);
        let now = now_ms();
        let valid_task_ids = task_ids
            .iter()
            .filter_map(|task_id| {
                self.conn
                    .query_row(
                        "SELECT tasks.id FROM tasks
                         JOIN lists ON lists.id=tasks.list_id
                         WHERE tasks.id=?1 AND tasks.deleted_at IS NULL
                           AND lists.deleted_at IS NULL AND lists.life_area=?2",
                        params![task_id, life_area],
                        |row| row.get::<_, String>(0),
                    )
                    .optional()
                    .ok()
                    .flatten()
            })
            .collect::<Vec<_>>();
        let transaction = self.conn.unchecked_transaction()?;
        if is_current_focus {
            transaction.execute(
                "UPDATE goals SET is_current_focus=0,updated_at=?1
                 WHERE life_area=?2 AND id<>?3 AND deleted_at IS NULL",
                params![now, life_area, id],
            )?;
        }
        let next_task_id =
            next_task_id.filter(|candidate| valid_task_ids.iter().any(|id| id == candidate));
        transaction.execute(
            "INSERT INTO goals(id,life_area,title,description,status,is_current_focus,next_task_id,updated_at,deleted_at)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,NULL)
             ON CONFLICT(id) DO UPDATE SET life_area=excluded.life_area,title=excluded.title,
               description=excluded.description,status=excluded.status,
               is_current_focus=excluded.is_current_focus,next_task_id=excluded.next_task_id,
               updated_at=excluded.updated_at,deleted_at=NULL",
            params![id, life_area, title.trim(), description, status, is_current_focus, next_task_id, now],
        )?;
        transaction.execute(
            "UPDATE goal_task_links SET deleted_at=?1,updated_at=?1
             WHERE goal_id=?2 AND deleted_at IS NULL",
            params![now, id],
        )?;
        for task_id in &valid_task_ids {
            transaction.execute(
                "INSERT INTO goal_task_links(goal_id,task_id,updated_at,deleted_at)
                 VALUES(?1,?2,?3,NULL)
                 ON CONFLICT(goal_id,task_id) DO UPDATE SET updated_at=excluded.updated_at,deleted_at=NULL",
                params![id, task_id, now],
            )?;
        }
        transaction.commit()?;
        Ok(Goal {
            id,
            life_area: life_area.to_string(),
            title: title.trim().to_string(),
            description: description.map(str::to_string),
            status: status.to_string(),
            is_current_focus,
            next_task_id: next_task_id.map(str::to_string),
            updated_at: now,
            deleted_at: None,
        })
    }

    pub fn archive_goal(&self, id: &str) -> rusqlite::Result<()> {
        let now = now_ms();
        self.conn.execute(
            "UPDATE goals SET status=?1,is_current_focus=0,updated_at=?2 WHERE id=?3",
            params![GOAL_STATUS_ARCHIVED, now, id],
        )?;
        Ok(())
    }

    pub fn goals_dirty_since(&self, timestamp: i64) -> rusqlite::Result<Vec<Goal>> {
        self.goal_rows("WHERE updated_at>?1 ORDER BY updated_at,id", [timestamp])
    }

    pub fn goal_task_links_dirty_since(
        &self,
        timestamp: i64,
    ) -> rusqlite::Result<Vec<GoalTaskLink>> {
        self.goal_link_rows(
            "WHERE updated_at>?1 ORDER BY updated_at,goal_id,task_id",
            [timestamp],
        )
    }

    pub fn upsert_goals_from_remote(&self, goals: &[Goal], force: bool) -> rusqlite::Result<()> {
        for goal in goals {
            let guard = if force {
                ""
            } else {
                " WHERE excluded.updated_at > goals.updated_at"
            };
            self.conn.execute(
                &format!(
                    "INSERT INTO goals(id,life_area,title,description,status,is_current_focus,next_task_id,updated_at,deleted_at)
                     VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)
                     ON CONFLICT(id) DO UPDATE SET life_area=excluded.life_area,title=excluded.title,
                       description=excluded.description,status=excluded.status,
                       is_current_focus=excluded.is_current_focus,next_task_id=excluded.next_task_id,
                       updated_at=excluded.updated_at,deleted_at=excluded.deleted_at{guard}"
                ),
                params![goal.id,goal.life_area,goal.title,goal.description,goal.status,
                    goal.is_current_focus,goal.next_task_id,goal.updated_at,goal.deleted_at],
            )?;
        }
        Ok(())
    }

    pub fn upsert_goal_task_links_from_remote(
        &self,
        links: &[GoalTaskLink],
        force: bool,
    ) -> rusqlite::Result<()> {
        for link in links {
            let guard = if force {
                ""
            } else {
                " WHERE excluded.updated_at > goal_task_links.updated_at"
            };
            self.conn.execute(
                &format!(
                    "INSERT INTO goal_task_links(goal_id,task_id,updated_at,deleted_at)
                     VALUES(?1,?2,?3,?4)
                     ON CONFLICT(goal_id,task_id) DO UPDATE SET updated_at=excluded.updated_at,
                       deleted_at=excluded.deleted_at{guard}"
                ),
                params![link.goal_id, link.task_id, link.updated_at, link.deleted_at],
            )?;
        }
        Ok(())
    }

    fn goal_rows<P>(&self, suffix: &str, params: P) -> rusqlite::Result<Vec<Goal>>
    where
        P: rusqlite::Params,
    {
        let sql = format!(
            "SELECT id,life_area,title,description,status,is_current_focus,next_task_id,updated_at,deleted_at
             FROM goals {suffix}"
        );
        self.conn
            .prepare(&sql)?
            .query_map(params, |row| {
                Ok(Goal {
                    id: row.get(0)?,
                    life_area: row.get(1)?,
                    title: row.get(2)?,
                    description: row.get(3)?,
                    status: row.get(4)?,
                    is_current_focus: row.get(5)?,
                    next_task_id: row.get(6)?,
                    updated_at: row.get(7)?,
                    deleted_at: row.get(8)?,
                })
            })?
            .collect()
    }

    fn goal_link_rows<P>(&self, suffix: &str, params: P) -> rusqlite::Result<Vec<GoalTaskLink>>
    where
        P: rusqlite::Params,
    {
        let sql =
            format!("SELECT goal_id,task_id,updated_at,deleted_at FROM goal_task_links {suffix}");
        self.conn
            .prepare(&sql)?
            .query_map(params, |row| {
                Ok(GoalTaskLink {
                    goal_id: row.get(0)?,
                    task_id: row.get(1)?,
                    updated_at: row.get(2)?,
                    deleted_at: row.get(3)?,
                })
            })?
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saves_links_and_cleans_a_deleted_next_action() {
        let db = Db::open_in_memory().unwrap();
        let list = db.add_list("Health").unwrap();
        db.set_list_life_tag(&list.id, Some("health"), Some("increase"))
            .unwrap();
        let first = db.add_task(&list.id, "Walk", None).unwrap();
        let second = db.add_task(&list.id, "Book checkup", None).unwrap();
        db.save_goal(
            None,
            "health",
            "Feel stronger",
            None,
            GOAL_STATUS_ACTIVE,
            true,
            Some(&first.id),
            &[first.id.clone(), second.id.clone()],
        )
        .unwrap();

        assert_eq!(db.goal_task_links().unwrap().len(), 2);
        db.delete_task(&first.id).unwrap();
        assert_eq!(db.goals().unwrap()[0].next_task_id, None);
        assert_eq!(db.goal_task_links().unwrap().len(), 1);
    }

    #[test]
    fn a_new_focus_clears_the_previous_focus() {
        let db = Db::open_in_memory().unwrap();
        let first = db
            .save_goal(
                None,
                "health",
                "Sleep",
                None,
                GOAL_STATUS_ACTIVE,
                true,
                None,
                &[],
            )
            .unwrap();
        db.save_goal(
            None,
            "health",
            "Move",
            None,
            GOAL_STATUS_ACTIVE,
            true,
            None,
            &[],
        )
        .unwrap();

        let goals = db.goals().unwrap();
        assert_eq!(goals.iter().filter(|goal| goal.is_current_focus).count(), 1);
        assert!(
            !goals
                .iter()
                .find(|goal| goal.id == first.id)
                .unwrap()
                .is_current_focus
        );
    }
}
