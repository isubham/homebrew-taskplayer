use crate::models::*;
use rusqlite::{params, types::Type, Connection, OptionalExtension, Row};

mod planned_sessions;

const PALETTE: [&str; 8] = [
    "#2f9e8f", "#e13300", "#8d67ab", "#e8115b", "#509bf5", "#f59b23", "#ba5d07", "#27856a",
];

fn read_windows(row: &Row<'_>, index: usize) -> rusqlite::Result<Vec<WeeklyTimeWindow>> {
    let raw = row
        .get::<_, Option<String>>(index)?
        .unwrap_or_else(|| "[]".to_string());
    serde_json::from_str(&raw).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(index, Type::Text, Box::new(error))
    })
}

fn windows_json(windows: &[WeeklyTimeWindow]) -> rusqlite::Result<String> {
    serde_json::to_string(windows)
        .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))
}

pub struct Db {
    conn: Connection,
}

impl Db {
    pub fn open(path: &str) -> rusqlite::Result<Db> {
        let db = Db {
            conn: Connection::open(path)?,
        };
        db.migrate()?;
        db.seed_if_empty()?;
        Ok(db)
    }

    pub fn open_in_memory() -> rusqlite::Result<Db> {
        let db = Db {
            conn: Connection::open_in_memory()?,
        };
        db.migrate()?;
        Ok(db)
    }

    /// Runs the ordered migration list in `crate::migrations` — see that
    /// module for how versioning + idempotency work. Replaces what used to
    /// be a single growing function of `let _ = conn.execute("ALTER TABLE
    /// ...")` calls that silently swallowed every error, real ones included.
    fn migrate(&self) -> rusqlite::Result<()> {
        crate::migrations::run(&self.conn)
    }

    // ---- Lists ----
    pub fn lists(&self) -> rusqlite::Result<Vec<TaskList>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id,name,emoji,color,ord,updated_at,life_area,life_direction,availability_windows FROM lists WHERE deleted_at IS NULL ORDER BY ord")?;
        let rows = stmt.query_map([], |r| {
            Ok(TaskList {
                id: r.get(0)?,
                name: r.get(1)?,
                emoji: r.get(2)?,
                color: r.get(3)?,
                order: r.get(4)?,
                updated_at: r.get(5)?,
                life_area: r.get(6)?,
                life_direction: r.get(7)?,
                availability_windows: read_windows(r, 8)?,
                deleted_at: None,
            })
        })?;
        rows.collect()
    }

    pub fn add_list(&self, name: &str) -> rusqlite::Result<TaskList> {
        let order = self.lists()?.len() as i64;
        let color = PALETTE[(order as usize) % PALETTE.len()].to_string();
        let l = TaskList {
            id: new_id(),
            name: name.to_string(),
            emoji: "📁".into(),
            color,
            order,
            updated_at: now_ms(),
            life_area: None,
            life_direction: None,
            availability_windows: Vec::new(),
            deleted_at: None,
        };
        self.conn.execute(
            "INSERT INTO lists(id,name,emoji,color,ord,updated_at) VALUES(?1,?2,?3,?4,?5,?6)",
            params![l.id, l.name, l.emoji, l.color, l.order, l.updated_at],
        )?;
        Ok(l)
    }

    pub fn rename_list(&self, id: &str, name: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE lists SET name=?1, updated_at=?2 WHERE id=?3",
            params![name, now_ms(), id],
        )?;
        Ok(())
    }

    /// User-chosen emoji + background color for a list, set together from
    /// the same "Edit list" dialog — separate from `rename_list` since the
    /// name field submits independently of these two.
    pub fn set_list_style(&self, id: &str, emoji: &str, color: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE lists SET emoji=?1, color=?2, updated_at=?3 WHERE id=?4",
            params![emoji, color, now_ms(), id],
        )?;
        Ok(())
    }

    /// Life-balance tag (see the Home page's radar chart) — also settable
    /// from the "New list" dialog, not just "Edit list", so a list can be
    /// tagged right at creation. `area`/`direction` of `None` clears the
    /// tag (an untagged list simply doesn't factor into any radar axis).
    pub fn set_list_life_tag(
        &self,
        id: &str,
        area: Option<&str>,
        direction: Option<&str>,
    ) -> rusqlite::Result<()> {
        let area = canonical_life_area(area);
        self.conn.execute(
            "UPDATE lists SET life_area=?1, life_direction=?2, updated_at=?3 WHERE id=?4",
            params![area, direction, now_ms(), id],
        )?;
        Ok(())
    }

    pub fn set_list_availability(
        &self,
        id: &str,
        windows: &[WeeklyTimeWindow],
    ) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE lists SET availability_windows=?1, updated_at=?2 WHERE id=?3",
            params![windows_json(windows)?, now_ms(), id],
        )?;
        Ok(())
    }

    /// Persist a new top-to-bottom order for the sidebar lists, after a
    /// drag-and-drop reorder in the UI. `ordered_ids` is the full list of
    /// list-ids in their new order; each gets `ord` = its index. Ids that
    /// don't exist (or are already deleted) are silently skipped, mirroring
    /// `reorder_tasks`.
    pub fn reorder_lists(&self, ordered_ids: &[String]) -> rusqlite::Result<()> {
        let now = now_ms();
        for (i, id) in ordered_ids.iter().enumerate() {
            self.conn.execute(
                "UPDATE lists SET ord=?1, updated_at=?2 WHERE id=?3 AND deleted_at IS NULL",
                params![i as i64, now, id],
            )?;
        }
        Ok(())
    }

    // ---- Life-area planning priority ----
    pub fn life_area_priorities(&self) -> rusqlite::Result<Vec<LifeAreaPriority>> {
        let mut stmt = self.conn.prepare(
            "SELECT area_key,priority_rank,updated_at FROM life_area_priorities
             WHERE area_key!='growth' ORDER BY priority_rank,area_key",
        )?;
        let priorities = stmt
            .query_map([], |r| {
                Ok(LifeAreaPriority {
                    area_key: r.get(0)?,
                    priority_rank: r.get(1)?,
                    updated_at: r.get(2)?,
                })
            })?
            .collect();
        priorities
    }

    pub fn reorder_life_areas(&self, ordered_area_keys: &[String]) -> rusqlite::Result<()> {
        let latest: i64 = self.conn.query_row(
            "SELECT COALESCE(MAX(updated_at),0) FROM life_area_priorities",
            [],
            |row| row.get(0),
        )?;
        let now = now_ms().max(latest + 1);
        let tx = self.conn.unchecked_transaction()?;
        for (index, key) in ordered_area_keys.iter().enumerate() {
            tx.execute(
                "UPDATE life_area_priorities SET priority_rank=?1,updated_at=?2 WHERE area_key=?3",
                params![index as i64 + 1, now, key],
            )?;
        }
        tx.commit()
    }

    pub fn life_area_priorities_dirty_since(
        &self,
        ts: i64,
    ) -> rusqlite::Result<Vec<LifeAreaPriority>> {
        let mut stmt = self.conn.prepare(
            "SELECT area_key,priority_rank,updated_at FROM life_area_priorities
             WHERE updated_at > ?1 AND area_key!='growth' ORDER BY priority_rank,area_key",
        )?;
        let priorities = stmt
            .query_map(params![ts], |r| {
                Ok(LifeAreaPriority {
                    area_key: r.get(0)?,
                    priority_rank: r.get(1)?,
                    updated_at: r.get(2)?,
                })
            })?
            .collect();
        priorities
    }

    pub fn upsert_life_area_priorities_from_remote(
        &self,
        priorities: &[LifeAreaPriority],
        force: bool,
    ) -> rusqlite::Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        for priority in priorities {
            // Supported older clients may still sync the retired category.
            // Keep the remote value compatible, but do not recreate a local
            // planning choice this client no longer presents.
            if priority.area_key == "growth" {
                continue;
            }
            let sql = if force {
                "INSERT INTO life_area_priorities(area_key,priority_rank,updated_at) VALUES(?1,?2,?3)
                 ON CONFLICT(area_key) DO UPDATE SET priority_rank=excluded.priority_rank,updated_at=excluded.updated_at"
            } else {
                "INSERT INTO life_area_priorities(area_key,priority_rank,updated_at) VALUES(?1,?2,?3)
                 ON CONFLICT(area_key) DO UPDATE SET priority_rank=excluded.priority_rank,updated_at=excluded.updated_at
                 WHERE excluded.updated_at > life_area_priorities.updated_at"
            };
            tx.execute(
                sql,
                params![
                    priority.area_key,
                    priority.priority_rank,
                    priority.updated_at
                ],
            )?;
        }
        tx.commit()
    }

    /// One-time field-level recovery after planner columns are introduced on
    /// a client whose pull cursor may already be newer than the remote rows.
    /// Normal LWW first handles remote-newer/missing rows; the second pass
    /// fills only planner values absent locally, without changing local row
    /// timestamps or unrelated fields.
    pub fn backfill_planner_fields_from_remote(
        &self,
        lists: &[TaskList],
        tasks: &[Task],
        priorities: &[LifeAreaPriority],
    ) -> rusqlite::Result<bool> {
        self.upsert_from_remote(lists, tasks, &[])?;

        let mut changed = !lists.is_empty() || !tasks.is_empty();
        let tx = self.conn.unchecked_transaction()?;
        for list in lists {
            if list.availability_windows.is_empty() {
                continue;
            }
            changed |= tx.execute(
                "UPDATE lists SET availability_windows=?1
                 WHERE id=?2 AND deleted_at IS NULL
                   AND COALESCE(availability_windows,'[]')='[]'",
                params![windows_json(&list.availability_windows)?, list.id],
            )? > 0;
        }
        for task in tasks {
            if let Some(cadence) = task.cadence.as_deref() {
                changed |= tx.execute(
                    "UPDATE tasks SET cadence=?1
                     WHERE id=?2 AND deleted_at IS NULL AND cadence IS NULL",
                    params![cadence, task.id],
                )? > 0;
            }
            if !task.daily_windows.is_empty() {
                changed |= tx.execute(
                    "UPDATE tasks SET daily_windows=?1
                     WHERE id=?2 AND deleted_at IS NULL
                       AND COALESCE(daily_windows,'[]')='[]'",
                    params![windows_json(&task.daily_windows)?, task.id],
                )? > 0;
            }
            if let Some(minimum) = task.min_session_min {
                changed |= tx.execute(
                    "UPDATE tasks SET min_session_min=?1
                     WHERE id=?2 AND deleted_at IS NULL AND min_session_min IS NULL",
                    params![minimum, task.id],
                )? > 0;
            }
            if let Some(maximum) = task.max_session_min {
                changed |= tx.execute(
                    "UPDATE tasks SET max_session_min=?1
                     WHERE id=?2 AND deleted_at IS NULL AND max_session_min IS NULL",
                    params![maximum, task.id],
                )? > 0;
            }
        }
        tx.commit()?;

        if !priorities.is_empty() {
            let current = self.life_area_priorities()?;
            let default_order = ["career", "health", "relationships", "finance", "recreation"];
            let local_is_default = current.len() == default_order.len()
                && current
                    .iter()
                    .zip(default_order)
                    .all(|(priority, expected)| priority.area_key == expected);
            self.upsert_life_area_priorities_from_remote(priorities, local_is_default)?;
            changed = true;
        }

        Ok(changed)
    }

    /// One-time field-level recovery for logical-session columns when the
    /// pull cursor or a newer local edit would otherwise hide older remote
    /// values. Existing non-null grouping data and unrelated local fields
    /// remain authoritative.
    pub fn backfill_logical_session_fields_from_remote(
        &self,
        sessions: &[Session],
    ) -> rusqlite::Result<bool> {
        self.upsert_from_remote(&[], &[], sessions)?;

        let mut changed = !sessions.is_empty();
        let tx = self.conn.unchecked_transaction()?;
        for session in sessions {
            if let Some(logical_session_id) = session.logical_session_id.as_deref() {
                changed |= tx.execute(
                    "UPDATE sessions SET logical_session_id=?1
                     WHERE id=?2 AND logical_session_id IS NULL",
                    params![logical_session_id, session.id],
                )? > 0;
            }
            if let Some(finished_at) = session.session_finished_at {
                changed |= tx.execute(
                    "UPDATE sessions SET session_finished_at=?1
                     WHERE id=?2 AND session_finished_at IS NULL",
                    params![finished_at, session.id],
                )? > 0;
            }
        }
        tx.commit()?;
        Ok(changed)
    }

    pub fn delete_list(&self, id: &str) -> rusqlite::Result<()> {
        let now = now_ms();
        self.conn.execute(
            "UPDATE planned_sessions SET deleted_at=?1, updated_at=?1
             WHERE task_id IN (SELECT id FROM tasks WHERE list_id=?2)",
            params![now, id],
        )?;
        self.conn.execute(
            "UPDATE sessions SET deleted_at=?1, updated_at=?1 WHERE task_id IN (SELECT id FROM tasks WHERE list_id=?2)",
            params![now, id],
        )?;
        self.conn.execute(
            "UPDATE tasks SET deleted_at=?1, updated_at=?1 WHERE list_id=?2",
            params![now, id],
        )?;
        self.conn.execute(
            "UPDATE lists SET deleted_at=?1, updated_at=?1 WHERE id=?2",
            params![now, id],
        )?;
        Ok(())
    }

    // ---- Tasks ----
    pub fn tasks(&self) -> rusqlite::Result<Vec<Task>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id,list_id,name,depth,ord,est,done,descr,updated_at,album,impact_tier,impact_sign,deadline_at,cadence,daily_windows,min_session_min,max_session_min FROM tasks WHERE deleted_at IS NULL ORDER BY ord")?;
        let rows = stmt.query_map([], |r| {
            Ok(Task {
                id: r.get(0)?,
                list_id: r.get(1)?,
                name: r.get(2)?,
                depth: r.get(3)?,
                order: r.get(4)?,
                estimate_min: r.get(5)?,
                completed_at: r.get(6)?,
                description: r.get(7)?,
                updated_at: r.get(8)?,
                album: r.get(9)?,
                impact_tier: r.get(10)?,
                impact_sign: r.get::<_, Option<i64>>(11)?.unwrap_or(1),
                deadline_at: r.get(12)?,
                cadence: r.get(13)?,
                daily_windows: read_windows(r, 14)?,
                min_session_min: r.get(15)?,
                max_session_min: r.get(16)?,
                deleted_at: None,
            })
        })?;
        rows.collect()
    }

    pub fn add_task(
        &self,
        list_id: &str,
        name: &str,
        estimate_min: Option<i64>,
    ) -> rusqlite::Result<Task> {
        let order: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM tasks WHERE list_id=?1 AND deleted_at IS NULL",
            params![list_id],
            |r| r.get(0),
        )?;
        let t = Task {
            id: new_id(),
            list_id: list_id.to_string(),
            name: name.to_string(),
            depth: None,
            order,
            estimate_min,
            album: None,
            completed_at: None,
            description: None,
            updated_at: now_ms(),
            impact_tier: None,
            impact_sign: 1,
            deadline_at: None,
            cadence: None,
            daily_windows: Vec::new(),
            min_session_min: None,
            max_session_min: None,
            deleted_at: None,
        };
        self.conn.execute(
            "INSERT INTO tasks(id,list_id,name,depth,ord,est,done,descr,updated_at,impact_sign) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
            params![t.id, t.list_id, t.name, t.depth, t.order, t.estimate_min, t.completed_at, t.description, t.updated_at, t.impact_sign],
        )?;
        Ok(t)
    }

    /// Sets a task's impact tier ("low"|"medium"|"high"|None) and
    /// sign (1 = for its list's tagged life area, -1 = against it) — see
    /// `Task`'s doc comments. This, not `estimate_min`, is what the jewel
    /// payout and life-balance radar contribution are weighed by.
    pub fn set_task_impact(&self, id: &str, tier: Option<&str>, sign: i64) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE tasks SET impact_tier=?1, impact_sign=?2, updated_at=?3 WHERE id=?4",
            params![tier, sign, now_ms(), id],
        )?;
        Ok(())
    }

    pub fn rename_task(&self, id: &str, name: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE tasks SET name=?1, updated_at=?2 WHERE id=?3",
            params![name, now_ms(), id],
        )?;
        Ok(())
    }

    pub fn set_depth(&self, id: &str, depth: Option<&str>) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE tasks SET depth=?1, updated_at=?2 WHERE id=?3",
            params![depth, now_ms(), id],
        )?;
        Ok(())
    }

    /// None = one-time (default), "daily" = repeating — see `Task::cadence`'s
    /// doc comment. Doesn't touch `completed_at`/`impact_tier` — a task
    /// switched to "daily" keeps whatever those already were; the frontend's
    /// aggregation just stops reading `completed_at` for it going forward.
    pub fn set_cadence(&self, id: &str, cadence: Option<&str>) -> rusqlite::Result<()> {
        let now = now_ms();
        if cadence.is_some() {
            self.conn.execute(
                "UPDATE planned_sessions SET deleted_at=?1, updated_at=?1
                 WHERE task_id=?2 AND deleted_at IS NULL",
                params![now, id],
            )?;
        }
        self.conn.execute(
            "UPDATE tasks SET cadence=?1, updated_at=?2 WHERE id=?3",
            params![cadence, now, id],
        )?;
        Ok(())
    }

    pub fn set_daily_windows(
        &self,
        id: &str,
        windows: &[WeeklyTimeWindow],
    ) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE tasks SET daily_windows=?1, updated_at=?2 WHERE id=?3",
            params![windows_json(windows)?, now_ms(), id],
        )?;
        Ok(())
    }

    pub fn set_session_range(
        &self,
        id: &str,
        min_minutes: Option<i64>,
        max_minutes: Option<i64>,
    ) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE tasks SET min_session_min=?1, max_session_min=?2, updated_at=?3 WHERE id=?4",
            params![min_minutes, max_minutes, now_ms(), id],
        )?;
        Ok(())
    }

    pub fn set_estimate(&self, id: &str, est_min: Option<i64>) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE tasks SET est=?1, updated_at=?2 WHERE id=?3",
            params![est_min, now_ms(), id],
        )?;
        Ok(())
    }

    /// Sets (or clears, with `None`) a task's deadline — see `Task::deadline_at`'s
    /// doc comment. Powers the Home page's "Now" section
    /// (docs/homepage-now-spec.md); has no effect on its own until the task
    /// also carries an `impact_tier` of at least medium.
    pub fn set_deadline(&self, id: &str, deadline_at: Option<i64>) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE tasks SET deadline_at=?1, updated_at=?2 WHERE id=?3",
            params![deadline_at, now_ms(), id],
        )?;
        Ok(())
    }

    pub fn set_completed(&self, id: &str, at: Option<i64>) -> rusqlite::Result<()> {
        let now = now_ms();
        if at.is_some() {
            self.conn.execute(
                "UPDATE planned_sessions SET deleted_at=?1, updated_at=?1
                 WHERE task_id=?2 AND deleted_at IS NULL",
                params![now, id],
            )?;
        }
        self.conn.execute(
            "UPDATE tasks SET done=?1, updated_at=?2 WHERE id=?3",
            params![at, now, id],
        )?;
        Ok(())
    }

    pub fn set_description(&self, id: &str, descr: Option<&str>) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE tasks SET descr=?1, updated_at=?2 WHERE id=?3",
            params![descr, now_ms(), id],
        )?;
        Ok(())
    }

    /// Set (or clear, with `None`) which album a task belongs to. A blank
    /// string is normalized to `None` so clearing the field in the UI (an
    /// empty text input) reads back as "no album" rather than an empty tag.
    pub fn set_album(&self, id: &str, album: Option<&str>) -> rusqlite::Result<()> {
        let album = album.map(str::trim).filter(|s| !s.is_empty());
        self.conn.execute(
            "UPDATE tasks SET album=?1, updated_at=?2 WHERE id=?3",
            params![album, now_ms(), id],
        )?;
        Ok(())
    }

    /// Persist a new relative order for a set of tasks within one list, after a
    /// drag-and-drop reorder in the UI. `ordered_ids` is the full to-do list for
    /// `list_id` in its new top-to-bottom order; each gets `ord` = its index.
    /// Ids that don't belong to `list_id` (or are already deleted) are silently
    /// skipped so a stale payload can't corrupt another list's ordering.
    pub fn reorder_tasks(&self, list_id: &str, ordered_ids: &[String]) -> rusqlite::Result<()> {
        let now = now_ms();
        for (i, id) in ordered_ids.iter().enumerate() {
            self.conn.execute(
                "UPDATE tasks SET ord=?1, updated_at=?2 WHERE id=?3 AND list_id=?4 AND deleted_at IS NULL",
                params![i as i64, now, id, list_id],
            )?;
        }
        Ok(())
    }

    /// Move a task to another list, placing it at the end of the target list.
    pub fn move_task(&self, id: &str, list_id: &str) -> rusqlite::Result<()> {
        let order: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM tasks WHERE list_id=?1 AND deleted_at IS NULL",
            params![list_id],
            |r| r.get(0),
        )?;
        self.conn.execute(
            "UPDATE tasks SET list_id=?1, ord=?2, updated_at=?3 WHERE id=?4",
            params![list_id, order, now_ms(), id],
        )?;
        Ok(())
    }

    pub fn delete_task(&self, id: &str) -> rusqlite::Result<()> {
        let now = now_ms();
        self.conn.execute(
            "UPDATE planned_sessions SET deleted_at=?1, updated_at=?1 WHERE task_id=?2",
            params![now, id],
        )?;
        self.conn.execute(
            "UPDATE sessions SET deleted_at=?1, updated_at=?1 WHERE task_id=?2",
            params![now, id],
        )?;
        self.conn.execute(
            "UPDATE tasks SET deleted_at=?1, updated_at=?1 WHERE id=?2",
            params![now, id],
        )?;
        Ok(())
    }

    // ---- Sessions ----
    pub fn sessions(&self) -> rusqlite::Result<Vec<Session>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id,task_id,start,end,updated_at,logical_session_id,session_finished_at FROM sessions WHERE deleted_at IS NULL ORDER BY start")?;
        let rows = stmt.query_map([], |r| {
            Ok(Session {
                id: r.get(0)?,
                task_id: r.get(1)?,
                start: r.get(2)?,
                end: r.get(3)?,
                updated_at: r.get(4)?,
                logical_session_id: r.get(5)?,
                session_finished_at: r.get(6)?,
                deleted_at: None,
            })
        })?;
        rows.collect()
    }

    pub fn add_session(&self, log: &SessionLog) -> rusqlite::Result<Session> {
        self.add_session_interval(log, None, None)
    }

    pub fn add_session_interval(
        &self,
        log: &SessionLog,
        logical_session_id: Option<&str>,
        session_finished_at: Option<i64>,
    ) -> rusqlite::Result<Session> {
        let s = Session {
            id: new_id(),
            task_id: log.task_id.clone(),
            start: log.start,
            end: Some(log.end),
            logical_session_id: logical_session_id.map(str::to_string),
            session_finished_at,
            updated_at: now_ms(),
            deleted_at: None,
        };
        self.conn.execute(
            "INSERT INTO sessions(id,task_id,start,end,updated_at,logical_session_id,session_finished_at)
             VALUES(?1,?2,?3,?4,?5,?6,?7)",
            params![
                s.id,
                s.task_id,
                s.start,
                s.end,
                s.updated_at,
                s.logical_session_id,
                s.session_finished_at
            ],
        )?;
        Ok(s)
    }

    pub fn finish_logical_session(
        &self,
        logical_session_id: &str,
        finished_at: i64,
    ) -> rusqlite::Result<usize> {
        self.conn.execute(
            "UPDATE sessions
             SET session_finished_at=?1,updated_at=?2
             WHERE logical_session_id=?3 AND deleted_at IS NULL",
            params![finished_at, now_ms(), logical_session_id],
        )
    }

    pub fn delete_logical_session(&self, logical_session_id: &str) -> rusqlite::Result<()> {
        let now = now_ms();
        self.conn.execute(
            "UPDATE sessions SET deleted_at=?1,updated_at=?1
             WHERE logical_session_id=?2 AND deleted_at IS NULL",
            params![now, logical_session_id],
        )?;
        Ok(())
    }

    pub fn add_recorded_session(
        &self,
        log: &SessionLog,
        now: i64,
    ) -> rusqlite::Result<Option<Session>> {
        if log.end <= log.start || log.end > now {
            return Ok(None);
        }
        let session = Session {
            id: new_id(),
            task_id: log.task_id.clone(),
            start: log.start,
            end: Some(log.end),
            logical_session_id: None,
            session_finished_at: Some(log.end),
            updated_at: now_ms(),
            deleted_at: None,
        };
        let logical_session_id = session.id.clone();
        let inserted = self.conn.execute(
            "INSERT INTO sessions(id,task_id,start,end,updated_at,logical_session_id,session_finished_at)
             SELECT ?1,?2,?3,?4,?5,?6,?7
             WHERE NOT EXISTS(
               SELECT 1 FROM sessions
               WHERE deleted_at IS NULL AND start<?4 AND COALESCE(end,?8)>?3
             )",
            params![
                session.id,
                session.task_id,
                session.start,
                session.end,
                session.updated_at,
                logical_session_id,
                session.session_finished_at,
                now
            ],
        )?;
        Ok((inserted > 0).then(|| Session {
            logical_session_id: Some(logical_session_id),
            ..session
        }))
    }

    pub fn delete_session(&self, id: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE sessions SET deleted_at=?1, updated_at=?1 WHERE id=?2",
            params![now_ms(), id],
        )?;
        Ok(())
    }

    pub fn update_session(
        &self,
        id: &str,
        task_id: Option<&str>,
        start: i64,
        end: i64,
    ) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE sessions SET task_id=COALESCE(?1,task_id), start=?2, end=?3, updated_at=?4
             WHERE id=?5 AND deleted_at IS NULL",
            params![task_id, start, end, now_ms(), id],
        )?;
        Ok(())
    }

    pub fn update_recorded_session(
        &self,
        id: &str,
        task_id: Option<&str>,
        start: i64,
        end: i64,
        now: i64,
    ) -> rusqlite::Result<bool> {
        if end <= start || end > now {
            return Ok(false);
        }
        let tx = self.conn.unchecked_transaction()?;
        let updated_at = now_ms();
        let updated = tx.execute(
            "UPDATE sessions
             SET task_id=COALESCE(?1,task_id),start=?2,end=?3,updated_at=?4
             WHERE id=?5 AND deleted_at IS NULL
               AND NOT EXISTS(
                 SELECT 1 FROM sessions AS other
                 WHERE other.deleted_at IS NULL AND other.id<>?5
                   AND other.start<?3 AND COALESCE(other.end,?6)>?2
               )",
            params![task_id, start, end, updated_at, id, now],
        )? > 0;
        if updated {
            let group_end: Option<i64> = tx.query_row(
                "SELECT MAX(COALESCE(end,start)) FROM sessions
                 WHERE logical_session_id=(
                   SELECT logical_session_id FROM sessions WHERE id=?1
                 ) AND deleted_at IS NULL",
                params![id],
                |row| row.get(0),
            )?;
            let finish_floor = group_end.unwrap_or(end).max(end);
            tx.execute(
                "UPDATE sessions
                 SET task_id=COALESCE(?1,task_id),
                     session_finished_at=CASE
                       WHEN (SELECT COUNT(*) FROM sessions AS grouped
                             WHERE grouped.logical_session_id=sessions.logical_session_id
                               AND grouped.deleted_at IS NULL)=1 THEN ?2
                       WHEN session_finished_at IS NULL OR session_finished_at<?2 THEN ?2
                       ELSE session_finished_at
                     END,
                     updated_at=?3
                 WHERE logical_session_id=(
                   SELECT logical_session_id FROM sessions WHERE id=?4
                 ) AND deleted_at IS NULL",
                params![task_id, finish_floor, updated_at, id],
            )?;
            tx.commit()?;
        }
        Ok(updated)
    }

    /// Task ids ordered by most-recently-played first (by latest session).
    pub fn recent_task_ids(&self, limit: usize) -> Vec<String> {
        let mut stmt = match self.conn.prepare(
            "SELECT task_id FROM sessions WHERE deleted_at IS NULL GROUP BY task_id ORDER BY MAX(COALESCE(end,start)) DESC LIMIT ?1",
        ) {
            Ok(s) => s,
            Err(_) => return Vec::new(),
        };
        let rows = stmt.query_map([limit as i64], |r| r.get::<_, String>(0));
        match rows {
            Ok(it) => it.filter_map(Result::ok).collect(),
            Err(_) => Vec::new(),
        }
    }

    // ---- Sync support (Phase 3 will call these; pure DB logic, no network) ----

    pub fn music_favorites(&self) -> rusqlite::Result<Vec<MusicFavorite>> {
        let mut stmt = self.conn.prepare(
            "SELECT track_id,title,artist,artwork_urls,permalink,source_type,updated_at
             FROM music_favorites WHERE deleted_at IS NULL ORDER BY updated_at",
        )?;
        let favorites = stmt
            .query_map([], |r| {
                let artwork_json: String = r.get(3)?;
                Ok(MusicFavorite {
                    track_id: r.get(0)?,
                    title: r.get(1)?,
                    artist: r.get(2)?,
                    artwork_urls: serde_json::from_str(&artwork_json).unwrap_or_default(),
                    permalink: r.get(4)?,
                    source_type: r.get(5)?,
                    updated_at: r.get(6)?,
                    deleted_at: None,
                })
            })?
            .collect();
        favorites
    }

    pub fn toggle_music_favorite(&self, track: &MusicFavoriteInput) -> rusqlite::Result<()> {
        let existing: Option<Option<i64>> = self
            .conn
            .query_row(
                "SELECT deleted_at FROM music_favorites WHERE track_id=?1",
                params![track.track_id],
                |r| r.get(0),
            )
            .optional()?;
        let now = now_ms();
        if matches!(existing, Some(None)) {
            self.conn.execute(
                "UPDATE music_favorites SET deleted_at=?1,updated_at=?1 WHERE track_id=?2",
                params![now, track.track_id],
            )?;
        } else {
            self.save_music_favorite(track, now)?;
        }
        Ok(())
    }

    pub fn import_music_favorites(&self, tracks: &[MusicFavoriteInput]) -> rusqlite::Result<()> {
        let now = now_ms();
        for (offset, track) in tracks.iter().enumerate() {
            let exists: bool = self.conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM music_favorites WHERE track_id=?1)",
                params![track.track_id],
                |r| r.get(0),
            )?;
            if !exists {
                self.save_music_favorite(track, now + offset as i64)?;
            }
        }
        Ok(())
    }

    fn save_music_favorite(
        &self,
        track: &MusicFavoriteInput,
        updated_at: i64,
    ) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT INTO music_favorites(track_id,title,artist,artwork_urls,permalink,source_type,updated_at,deleted_at)
             VALUES(?1,?2,?3,?4,?5,?6,?7,NULL)
             ON CONFLICT(track_id) DO UPDATE SET title=excluded.title,artist=excluded.artist,
               artwork_urls=excluded.artwork_urls,permalink=excluded.permalink,
               source_type=excluded.source_type,updated_at=excluded.updated_at,deleted_at=NULL",
            params![track.track_id, track.title, track.artist, serde_json::to_string(&track.artwork_urls).unwrap_or_else(|_| "[]".into()), track.permalink, track.source_type, updated_at],
        )?;
        Ok(())
    }

    pub fn music_favorites_dirty_since(&self, ts: i64) -> rusqlite::Result<Vec<MusicFavorite>> {
        let mut stmt = self.conn.prepare(
            "SELECT track_id,title,artist,artwork_urls,permalink,source_type,updated_at,deleted_at
             FROM music_favorites WHERE updated_at>?1",
        )?;
        let favorites = stmt
            .query_map(params![ts], |r| {
                let artwork_json: String = r.get(3)?;
                Ok(MusicFavorite {
                    track_id: r.get(0)?,
                    title: r.get(1)?,
                    artist: r.get(2)?,
                    artwork_urls: serde_json::from_str(&artwork_json).unwrap_or_default(),
                    permalink: r.get(4)?,
                    source_type: r.get(5)?,
                    updated_at: r.get(6)?,
                    deleted_at: r.get(7)?,
                })
            })?
            .collect();
        favorites
    }

    pub fn upsert_music_favorites_from_remote(
        &self,
        favorites: &[MusicFavorite],
        force: bool,
    ) -> rusqlite::Result<()> {
        for favorite in favorites {
            self.conn.execute(
                &format!("INSERT INTO music_favorites(track_id,title,artist,artwork_urls,permalink,source_type,updated_at,deleted_at)
                  VALUES(?1,?2,?3,?4,?5,?6,?7,?8)
                  ON CONFLICT(track_id) DO UPDATE SET title=excluded.title,artist=excluded.artist,
                    artwork_urls=excluded.artwork_urls,permalink=excluded.permalink,source_type=excluded.source_type,
                    updated_at=excluded.updated_at,deleted_at=excluded.deleted_at{}",
                    if force { "" } else { " WHERE excluded.updated_at > music_favorites.updated_at" }),
                params![favorite.track_id, favorite.title, favorite.artist, serde_json::to_string(&favorite.artwork_urls).unwrap_or_else(|_| "[]".into()), favorite.permalink, favorite.source_type, favorite.updated_at, favorite.deleted_at],
            )?;
        }
        Ok(())
    }

    /// All rows (including soft-deleted tombstones) changed since `ts`, for
    /// pushing to the remote. Unlike `lists()`/`tasks()`/`sessions()`, this
    /// intentionally does not filter `deleted_at` — a delete has to reach the
    /// other device too.
    pub fn dirty_since(
        &self,
        ts: i64,
    ) -> rusqlite::Result<(Vec<TaskList>, Vec<Task>, Vec<Session>)> {
        let mut lstmt = self.conn.prepare(
            "SELECT id,name,emoji,color,ord,updated_at,deleted_at,life_area,life_direction,availability_windows FROM lists WHERE updated_at > ?1",
        )?;
        let lists = lstmt
            .query_map(params![ts], |r| {
                Ok(TaskList {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    emoji: r.get(2)?,
                    color: r.get(3)?,
                    order: r.get(4)?,
                    updated_at: r.get(5)?,
                    deleted_at: r.get(6)?,
                    life_area: r.get(7)?,
                    life_direction: r.get(8)?,
                    availability_windows: read_windows(r, 9)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        let mut tstmt = self.conn.prepare(
            "SELECT id,list_id,name,depth,ord,est,done,descr,updated_at,deleted_at,album,impact_tier,impact_sign,deadline_at,cadence,daily_windows,min_session_min,max_session_min FROM tasks WHERE updated_at > ?1",
        )?;
        let tasks = tstmt
            .query_map(params![ts], |r| {
                Ok(Task {
                    id: r.get(0)?,
                    list_id: r.get(1)?,
                    name: r.get(2)?,
                    depth: r.get(3)?,
                    order: r.get(4)?,
                    estimate_min: r.get(5)?,
                    completed_at: r.get(6)?,
                    description: r.get(7)?,
                    updated_at: r.get(8)?,
                    deleted_at: r.get(9)?,
                    album: r.get(10)?,
                    impact_tier: r.get(11)?,
                    impact_sign: r.get::<_, Option<i64>>(12)?.unwrap_or(1),
                    deadline_at: r.get(13)?,
                    cadence: r.get(14)?,
                    daily_windows: read_windows(r, 15)?,
                    min_session_min: r.get(16)?,
                    max_session_min: r.get(17)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        let mut sstmt = self.conn.prepare(
            "SELECT id,task_id,start,end,updated_at,deleted_at,logical_session_id,session_finished_at
             FROM sessions WHERE updated_at > ?1",
        )?;
        let sessions = sstmt
            .query_map(params![ts], |r| {
                Ok(Session {
                    id: r.get(0)?,
                    task_id: r.get(1)?,
                    start: r.get(2)?,
                    end: r.get(3)?,
                    updated_at: r.get(4)?,
                    deleted_at: r.get(5)?,
                    logical_session_id: r.get(6)?,
                    session_finished_at: r.get(7)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok((lists, tasks, sessions))
    }

    /// Apply rows pulled from the remote. Same last-write-wins rule as the
    /// Postgres-side `lww_guard` trigger: a row only overwrites the local
    /// copy if its `updated_at` is strictly newer.
    pub fn upsert_from_remote(
        &self,
        lists: &[TaskList],
        tasks: &[Task],
        sessions: &[Session],
    ) -> rusqlite::Result<()> {
        self.upsert_from_remote_inner(lists, tasks, sessions, false)
    }

    /// Same as `upsert_from_remote`, but applies every row unconditionally —
    /// skips the `WHERE excluded.updated_at > x.updated_at` last-write-wins
    /// guard entirely, so remote wins even over a *newer* local row.
    ///
    /// Used exactly once per sign-in (see `sync::sync_login` / `main.rs`'s
    /// `run_login_sync`), never for the normal periodic/manual sync cycle.
    /// Rationale: local edits made while signed out (deletes included) are
    /// still real SQLite writes — signing out only clears the auth session,
    /// it doesn't sandbox local editing — so by the time the next sign-in
    /// happens, a local delete can easily be *newer* than the last known
    /// remote state. Plain LWW would then treat that delete as "the latest
    /// truth" and push it, silently tombstoning the account's real data on
    /// the very next sync. Forcing remote to win specifically at sign-in
    /// time is what stops that: any row that still exists on the server
    /// overwrites the local copy outright, regardless of which one is
    /// newer. A row that's genuinely local-only (no remote counterpart at
    /// all) is untouched here and still syncs up normally afterward via the
    /// regular push path.
    pub fn upsert_from_remote_force(
        &self,
        lists: &[TaskList],
        tasks: &[Task],
        sessions: &[Session],
    ) -> rusqlite::Result<()> {
        self.upsert_from_remote_inner(lists, tasks, sessions, true)
    }

    fn upsert_from_remote_inner(
        &self,
        lists: &[TaskList],
        tasks: &[Task],
        sessions: &[Session],
        force: bool,
    ) -> rusqlite::Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        for l in lists {
            let was_retired_growth = l.life_area.as_deref() == Some("growth");
            let life_area = canonical_life_area(l.life_area.as_deref());
            let color = if was_retired_growth {
                "#2f9e8f"
            } else {
                &l.color
            };
            let sql = if force {
                "INSERT INTO lists(id,name,emoji,color,ord,updated_at,deleted_at,life_area,life_direction,availability_windows) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
                 ON CONFLICT(id) DO UPDATE SET name=excluded.name, emoji=excluded.emoji, color=excluded.color,
                   ord=excluded.ord, updated_at=excluded.updated_at, deleted_at=excluded.deleted_at,
                   life_area=excluded.life_area, life_direction=excluded.life_direction,
                   availability_windows=excluded.availability_windows"
            } else {
                "INSERT INTO lists(id,name,emoji,color,ord,updated_at,deleted_at,life_area,life_direction,availability_windows) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
                 ON CONFLICT(id) DO UPDATE SET name=excluded.name, emoji=excluded.emoji, color=excluded.color,
                   ord=excluded.ord, updated_at=excluded.updated_at, deleted_at=excluded.deleted_at,
                   life_area=excluded.life_area, life_direction=excluded.life_direction,
                   availability_windows=excluded.availability_windows
                 WHERE excluded.updated_at > lists.updated_at"
            };
            tx.execute(
                sql,
                params![
                    l.id,
                    l.name,
                    l.emoji,
                    color,
                    l.order,
                    l.updated_at,
                    l.deleted_at,
                    life_area,
                    l.life_direction,
                    windows_json(&l.availability_windows)?
                ],
            )?;
        }
        for t in tasks {
            // impact_tier/impact_sign/deadline_at now round-trip through
            // Supabase like every other field (see sync.rs's RemoteTask) —
            // the Supabase `tasks` table needs the matching columns added
            // first (see the `alter table` note in db.sql) for a remote row
            // to actually carry a real value here instead of the
            // pre-migration default.
            let sql = if force {
                "INSERT INTO tasks(id,list_id,name,depth,ord,est,done,descr,updated_at,deleted_at,album,impact_tier,impact_sign,deadline_at,cadence,daily_windows,min_session_min,max_session_min) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)
                 ON CONFLICT(id) DO UPDATE SET list_id=excluded.list_id, name=excluded.name, depth=excluded.depth,
                   ord=excluded.ord, est=excluded.est, done=excluded.done, descr=excluded.descr,
                   updated_at=excluded.updated_at, deleted_at=excluded.deleted_at, album=excluded.album,
                   impact_tier=excluded.impact_tier, impact_sign=excluded.impact_sign, deadline_at=excluded.deadline_at,
                   cadence=excluded.cadence, daily_windows=excluded.daily_windows,
                   min_session_min=excluded.min_session_min, max_session_min=excluded.max_session_min"
            } else {
                "INSERT INTO tasks(id,list_id,name,depth,ord,est,done,descr,updated_at,deleted_at,album,impact_tier,impact_sign,deadline_at,cadence,daily_windows,min_session_min,max_session_min) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)
                 ON CONFLICT(id) DO UPDATE SET list_id=excluded.list_id, name=excluded.name, depth=excluded.depth,
                   ord=excluded.ord, est=excluded.est, done=excluded.done, descr=excluded.descr,
                   updated_at=excluded.updated_at, deleted_at=excluded.deleted_at, album=excluded.album,
                   impact_tier=excluded.impact_tier, impact_sign=excluded.impact_sign, deadline_at=excluded.deadline_at,
                   cadence=excluded.cadence, daily_windows=excluded.daily_windows,
                   min_session_min=excluded.min_session_min, max_session_min=excluded.max_session_min
                 WHERE excluded.updated_at > tasks.updated_at"
            };
            tx.execute(
                sql,
                params![
                    t.id,
                    t.list_id,
                    t.name,
                    t.depth,
                    t.order,
                    t.estimate_min,
                    t.completed_at,
                    t.description,
                    t.updated_at,
                    t.deleted_at,
                    t.album,
                    t.impact_tier,
                    t.impact_sign,
                    t.deadline_at,
                    t.cadence,
                    windows_json(&t.daily_windows)?,
                    t.min_session_min,
                    t.max_session_min
                ],
            )?;
        }
        for s in sessions {
            let sql = if force {
                "INSERT INTO sessions(id,task_id,start,end,updated_at,deleted_at,logical_session_id,session_finished_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)
                 ON CONFLICT(id) DO UPDATE SET task_id=excluded.task_id, start=excluded.start, end=excluded.end,
                   updated_at=excluded.updated_at, deleted_at=excluded.deleted_at,
                   logical_session_id=excluded.logical_session_id,session_finished_at=excluded.session_finished_at"
            } else {
                "INSERT INTO sessions(id,task_id,start,end,updated_at,deleted_at,logical_session_id,session_finished_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)
                 ON CONFLICT(id) DO UPDATE SET task_id=excluded.task_id, start=excluded.start, end=excluded.end,
                   updated_at=excluded.updated_at, deleted_at=excluded.deleted_at,
                   logical_session_id=excluded.logical_session_id,session_finished_at=excluded.session_finished_at
                 WHERE excluded.updated_at > sessions.updated_at"
            };
            tx.execute(
                sql,
                params![
                    s.id,
                    s.task_id,
                    s.start,
                    s.end,
                    s.updated_at,
                    s.deleted_at,
                    s.logical_session_id,
                    s.session_finished_at
                ],
            )?;
        }
        tx.commit()
    }

    // ---- Import / export ----
    /// Replace ALL data with the provided rows, preserving ids and order so
    /// sessions stay linked to their tasks. Runs in a transaction so a bad
    /// import can't leave the database half-written.
    pub fn import_replace(
        &self,
        lists: &[TaskList],
        tasks: &[Task],
        sessions: &[Session],
        planned_sessions: &[PlannedSession],
        config: Option<&SessionConfig>,
    ) -> rusqlite::Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        tx.execute("DELETE FROM planned_sessions", [])?;
        tx.execute("DELETE FROM sessions", [])?;
        tx.execute("DELETE FROM tasks", [])?;
        tx.execute("DELETE FROM lists", [])?;
        for l in lists {
            let was_retired_growth = l.life_area.as_deref() == Some("growth");
            let life_area = canonical_life_area(l.life_area.as_deref());
            let color = if was_retired_growth {
                "#2f9e8f"
            } else {
                &l.color
            };
            tx.execute(
                "INSERT INTO lists(id,name,emoji,color,ord,updated_at,life_area,life_direction,availability_windows) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                params![l.id, l.name, l.emoji, color, l.order, l.updated_at, life_area, l.life_direction, windows_json(&l.availability_windows)?],
            )?;
        }
        for t in tasks {
            tx.execute(
                "INSERT INTO tasks(id,list_id,name,depth,ord,est,done,descr,updated_at,album,impact_tier,impact_sign,deadline_at,cadence,daily_windows,min_session_min,max_session_min) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)",
                params![t.id, t.list_id, t.name, t.depth, t.order, t.estimate_min, t.completed_at, t.description, t.updated_at, t.album, t.impact_tier, t.impact_sign, t.deadline_at, t.cadence, windows_json(&t.daily_windows)?, t.min_session_min, t.max_session_min],
            )?;
        }
        for s in sessions {
            tx.execute(
                "INSERT INTO sessions(id,task_id,start,end,updated_at,logical_session_id,session_finished_at)
                 VALUES(?1,?2,?3,?4,?5,?6,?7)",
                params![
                    s.id,
                    s.task_id,
                    s.start,
                    s.end,
                    s.updated_at,
                    s.logical_session_id,
                    s.session_finished_at
                ],
            )?;
        }
        for planned in planned_sessions {
            tx.execute(
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
        }
        tx.commit()?;
        if let Some(c) = config {
            self.set_config(c)?;
        }
        Ok(())
    }

    // ---- Meta (config + run state, stored as JSON) ----
    fn get_meta(&self, key: &str) -> Option<String> {
        self.conn
            .query_row("SELECT value FROM meta WHERE key=?1", params![key], |r| {
                r.get::<_, String>(0)
            })
            .ok()
    }

    fn set_meta(&self, key: &str, value: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT INTO meta(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=?2",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn get_config(&self) -> SessionConfig {
        self.get_meta("config")
            .and_then(|v| serde_json::from_str(&v).ok())
            .unwrap_or_default()
    }

    pub fn set_config(&self, c: &SessionConfig) -> rusqlite::Result<()> {
        self.set_meta("config", &serde_json::to_string(c).unwrap_or_default())
    }

    /// Applies a `SessionConfig` pulled from the remote `config` row, but
    /// only if it's actually newer than what's already stored locally — same
    /// `updated_at`-guarded last-write-wins rule as `upsert_run_from_remote`,
    /// for the same reason (`config`, like `run_state`, is a singleton JSON
    /// blob in `meta`, not a real local SQL table). Returns `true` if the
    /// local config actually changed.
    pub fn upsert_config_from_remote(&self, remote: &SessionConfig) -> rusqlite::Result<bool> {
        let current = self.get_config();
        if remote.updated_at > current.updated_at {
            self.set_config(remote)?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub fn get_user_settings(&self) -> UserSettings {
        self.conn
            .query_row(
                "SELECT pause_for_other_audio,take_over_apple_music,
                        take_over_music_players,updated_at
                 FROM user_settings WHERE id=1",
                [],
                |row| {
                    Ok(UserSettings {
                        pause_for_other_audio: row.get(0)?,
                        take_over_apple_music: row.get(1)?,
                        take_over_music_players: row.get(2)?,
                        updated_at: row.get(3)?,
                    })
                },
            )
            .unwrap_or_default()
    }

    pub fn set_user_settings(&self, settings: &UserSettings) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT INTO user_settings(
               id,pause_for_other_audio,take_over_apple_music,
               take_over_music_players,updated_at
             ) VALUES(1,?1,?2,?3,?4)
             ON CONFLICT(id) DO UPDATE SET
               pause_for_other_audio=excluded.pause_for_other_audio,
               take_over_apple_music=excluded.take_over_apple_music,
               take_over_music_players=excluded.take_over_music_players,
               updated_at=excluded.updated_at",
            params![
                settings.pause_for_other_audio,
                settings.take_over_apple_music,
                settings.take_over_music_players,
                settings.updated_at
            ],
        )?;
        Ok(())
    }

    pub fn upsert_user_settings_from_remote(
        &self,
        remote: &UserSettings,
        force: bool,
    ) -> rusqlite::Result<bool> {
        let current = self.get_user_settings();
        if force || remote.updated_at > current.updated_at {
            self.set_user_settings(remote)?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub fn get_run(&self) -> RunState {
        self.get_meta("run")
            .and_then(|v| serde_json::from_str(&v).ok())
            .unwrap_or_default()
    }

    pub fn set_run(&self, r: &RunState) -> rusqlite::Result<()> {
        self.set_meta("run", &serde_json::to_string(r).unwrap_or_default())
    }

    /// Stable per-install id for cross-device session sync (see
    /// docs/session-sync-design.md) — generated once on first access and
    /// persisted in `meta`, so it survives every later launch of this
    /// install. Not secret; used only to tell "my session" from "a session
    /// owned by another of this account's devices."
    pub fn get_device_id(&self) -> String {
        if let Some(id) = self.get_meta("device_id") {
            return id;
        }
        let id = new_id();
        let _ = self.set_meta("device_id", &id);
        id
    }

    /// Applies a `RunState` pulled from the remote `run_state` row, but only
    /// if it's actually newer than what's already stored locally — the same
    /// `updated_at`-guarded last-write-wins rule the Postgres-side
    /// `lww_guard` trigger enforces for `lists`/`tasks`/`sessions`, just done
    /// here in Rust since `run_state` isn't a real local SQL table (it's the
    /// single `run` JSON blob in `meta`, same as `get_run`/`set_run`).
    /// Returns `true` if the local run state actually changed.
    pub fn upsert_run_from_remote(&self, remote: &RunState) -> rusqlite::Result<bool> {
        let current = self.get_run();
        if remote.updated_at > current.updated_at {
            self.set_run(remote)?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    fn delete_meta(&self, key: &str) -> rusqlite::Result<()> {
        self.conn
            .execute("DELETE FROM meta WHERE key=?1", params![key])?;
        Ok(())
    }

    /// Cached, non-secret Google/Supabase profile info. The actual refresh
    /// token lives in the OS Keychain (see `src-tauri/src/auth.rs`), never here.
    pub fn get_account(&self) -> Option<AccountInfo> {
        self.get_meta("account")
            .and_then(|v| serde_json::from_str(&v).ok())
    }

    pub fn set_account(&self, account: Option<&AccountInfo>) -> rusqlite::Result<()> {
        match account {
            Some(a) => self.set_meta("account", &serde_json::to_string(a).unwrap_or_default()),
            None => self.delete_meta("account"),
        }
    }

    /// ms epoch of the last successful push/pull — drives `dirty_since`/the
    /// remote `updated_at=gt.<cursor>` filter. 0 (never synced) pulls/pushes
    /// everything on the first run.
    pub fn get_push_cursor(&self) -> i64 {
        self.get_meta("sync_push_cursor")
            .and_then(|v| v.parse().ok())
            .unwrap_or(0)
    }

    pub fn set_push_cursor(&self, ts: i64) -> rusqlite::Result<()> {
        self.set_meta("sync_push_cursor", &ts.to_string())
    }

    pub fn get_pull_cursor(&self) -> i64 {
        self.get_meta("sync_pull_cursor")
            .and_then(|v| v.parse().ok())
            .unwrap_or(0)
    }

    pub fn set_pull_cursor(&self, ts: i64) -> rusqlite::Result<()> {
        self.set_meta("sync_pull_cursor", &ts.to_string())
    }

    pub fn sync_schema_backfill(&self) -> Option<String> {
        self.get_meta("sync_schema_backfill")
    }

    pub fn clear_sync_schema_backfill(&self) -> rusqlite::Result<()> {
        self.delete_meta("sync_schema_backfill")
    }

    pub fn clear_all_data(&self) -> rusqlite::Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        tx.execute("DELETE FROM tasks", [])?;
        tx.execute("DELETE FROM lists", [])?;
        tx.execute("DELETE FROM sessions", [])?;
        tx.execute("DELETE FROM planned_sessions", [])?;
        tx.execute("DELETE FROM life_area_priorities", [])?;
        tx.execute("DELETE FROM music_favorites", [])?;
        tx.execute("DELETE FROM meta WHERE key IN ('user_settings', 'config', 'sync_pull_cursor', 'sync_schema_backfill', 'sync_push_cursor', 'push_cursor')", [])?;
        tx.commit()
    }

    // ---- Snapshot ----
    pub fn snapshot(&self) -> rusqlite::Result<Snapshot> {
        Ok(Snapshot {
            lists: self.lists()?,
            life_area_priorities: self.life_area_priorities()?,
            tasks: self.tasks()?,
            sessions: self.sessions()?,
            planned_sessions: self.planned_sessions()?,
            music_favorites: self.music_favorites()?,
            user_settings: self.get_user_settings(),
            config: self.get_config(),
            run: self.get_run(),
            device_id: self.get_device_id(),
            account: self.get_account(),
            // `syncing`/`last_synced_at`/`last_sync_error` are live, in-memory
            // AppState — Db has no way to know them; main.rs's
            // build_snapshot() (the one actually used at runtime) fills in
            // the real values.
            syncing: false,
            last_synced_at: None,
            last_sync_error: None,
            // Same story as syncing/last_synced_at: this constructor is
            // test-only (main.rs's build_snapshot() is the real runtime
            // path), so there's no meaningful app version to report here —
            // using this crate's own version would be misleading, since
            // `taskplayer-core` is versioned independently of the app binary.
            app_version: String::new(),
        })
    }

    fn seed_if_empty(&self) -> rusqlite::Result<()> {
        let count: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM lists", [], |r| r.get(0))?;
        if count > 0 {
            return Ok(());
        }
        let now = now_ms();
        let deep = self.add_list("Deep Work")?;
        // give the seeded list a signature color/emoji
        self.conn.execute(
            "UPDATE lists SET emoji='🎯', color='#2f9e8f' WHERE id=?1",
            params![deep.id],
        )?;
        let admin = self.add_list("Admin & Errands")?;
        self.conn.execute(
            "UPDATE lists SET emoji='🗂️', color='#509bf5' WHERE id=?1",
            params![admin.id],
        )?;

        let t1 = self.add_task(&deep.id, "Write Q3 strategy doc", None)?;
        self.set_depth(&t1.id, Some("deep"))?;
        let t2 = self.add_task(&deep.id, "Code review: player module", None)?;
        self.set_depth(&t2.id, Some("deep"))?;
        self.add_task(&deep.id, "Design data model", None)?;
        let t4 = self.add_task(&admin.id, "Expense report", None)?;
        self.set_depth(&t4.id, Some("shallow"))?;
        self.add_task(&admin.id, "Inbox zero", None)?;

        self.add_session(&SessionLog {
            task_id: t1.id.clone(),
            start: now - 86_400_000,
            end: now - 86_400_000 + 3_600_000,
        })?;
        self.add_session(&SessionLog {
            task_id: t1.id.clone(),
            start: now - 3_600_000,
            end: now - 3_600_000 + 1_500_000,
        })?;
        self.add_session(&SessionLog {
            task_id: t2.id.clone(),
            start: now - 7_200_000,
            end: now - 7_200_000 + 2_100_000,
        })?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::timer;

    #[test]
    fn seed_and_snapshot() {
        let db = Db::open_in_memory().unwrap();
        db.seed_if_empty().unwrap();
        let snap = db.snapshot().unwrap();
        assert_eq!(snap.lists.len(), 2);
        assert_eq!(snap.tasks.len(), 5);
        assert_eq!(snap.sessions.len(), 3);
    }

    #[test]
    fn music_favorites_toggle_import_and_remote_lww() {
        let db = Db::open_in_memory().unwrap();
        let input = MusicFavoriteInput {
            track_id: "track-1".into(),
            title: "Focus".into(),
            artist: "Artist".into(),
            artwork_urls: vec!["https://example.test/art.jpg".into()],
            permalink: Some("https://example.test/track".into()),
            source_type: "audius".into(),
        };

        db.import_music_favorites(std::slice::from_ref(&input))
            .unwrap();
        db.import_music_favorites(std::slice::from_ref(&input))
            .unwrap();
        assert_eq!(db.music_favorites().unwrap().len(), 1);

        let local_updated_at = db.music_favorites().unwrap()[0].updated_at;
        db.upsert_music_favorites_from_remote(
            &[MusicFavorite {
                track_id: input.track_id.clone(),
                title: "Stale title".into(),
                artist: input.artist.clone(),
                artwork_urls: Vec::new(),
                permalink: None,
                source_type: input.source_type.clone(),
                updated_at: local_updated_at - 1,
                deleted_at: None,
            }],
            false,
        )
        .unwrap();
        assert_eq!(db.music_favorites().unwrap()[0].title, input.title);

        db.toggle_music_favorite(&input).unwrap();
        assert!(db.music_favorites().unwrap().is_empty());
        assert_eq!(db.music_favorites_dirty_since(0).unwrap().len(), 1);
    }

    #[test]
    fn crud_roundtrip() {
        let db = Db::open_in_memory().unwrap();
        let l = db.add_list("Test").unwrap();
        let t = db.add_task(&l.id, "Task A", None).unwrap();
        db.rename_task(&t.id, "Task A2").unwrap();
        db.set_depth(&t.id, Some("deep")).unwrap();
        let tasks = db.tasks().unwrap();
        assert_eq!(tasks[0].name, "Task A2");
        assert_eq!(tasks[0].depth.as_deref(), Some("deep"));

        db.rename_list(&l.id, "Renamed").unwrap();
        assert_eq!(
            db.lists()
                .iter()
                .flatten()
                .find(|x| x.id == l.id)
                .unwrap()
                .name,
            "Renamed"
        );
    }

    #[test]
    fn pause_logs_session_interval_via_timer() {
        let db = Db::open_in_memory().unwrap();
        let l = db.add_list("L").unwrap();
        let t = db.add_task(&l.id, "T", None).unwrap();

        let run = timer::begin(&RunState::default(), &t.id, "logical-a", 1_000);
        db.set_run(&run).unwrap();
        let (run2, log) = timer::pause(&db.get_run(), 5_000);
        db.set_run(&run2).unwrap();
        let s = db.add_session(&log.unwrap()).unwrap();
        assert_eq!(s.end.unwrap() - s.start, 4_000);
        assert_eq!(db.sessions().unwrap().len(), 1);
        assert!(db.get_run().active_task_id.is_none());
    }

    #[test]
    fn update_session_can_reassign_its_task() {
        let db = Db::open_in_memory().unwrap();
        let list = db.add_list("L").unwrap();
        let first = db.add_task(&list.id, "First", None).unwrap();
        let second = db.add_task(&list.id, "Second", None).unwrap();
        let session = db
            .add_session(&SessionLog {
                task_id: first.id,
                start: 100,
                end: 200,
            })
            .unwrap();

        db.update_session(&session.id, Some(&second.id), 300, 500)
            .unwrap();
        let updated = db.sessions().unwrap().remove(0);

        assert_eq!(updated.task_id, second.id);
        assert_eq!(updated.start, 300);
        assert_eq!(updated.end, Some(500));

        db.update_session(&session.id, None, 600, 900).unwrap();
        let updated_without_task = db.sessions().unwrap().remove(0);
        assert_eq!(updated_without_task.task_id, second.id);
    }

    #[test]
    fn recorded_session_writes_recheck_overlap_and_allow_adjacent_boundaries() {
        let db = Db::open_in_memory().unwrap();
        let list = db.add_list("L").unwrap();
        let task = db.add_task(&list.id, "Task", None).unwrap();
        let first = db
            .add_recorded_session(
                &SessionLog {
                    task_id: task.id.clone(),
                    start: 100,
                    end: 200,
                },
                1_000,
            )
            .unwrap()
            .unwrap();

        assert!(db
            .add_recorded_session(
                &SessionLog {
                    task_id: task.id.clone(),
                    start: 150,
                    end: 250,
                },
                1_000,
            )
            .unwrap()
            .is_none());
        assert!(db
            .add_recorded_session(
                &SessionLog {
                    task_id: task.id.clone(),
                    start: 1_000,
                    end: 1_100,
                },
                1_000,
            )
            .unwrap()
            .is_none());
        let adjacent = db
            .add_recorded_session(
                &SessionLog {
                    task_id: task.id,
                    start: 200,
                    end: 300,
                },
                1_000,
            )
            .unwrap()
            .unwrap();
        assert!(!db
            .update_recorded_session(&first.id, None, 250, 350, 1_000)
            .unwrap());
        assert!(db
            .update_recorded_session(&first.id, None, 0, 100, 1_000)
            .unwrap());
        let sessions = db.sessions().unwrap();
        assert_eq!(sessions.len(), 2);
        assert_eq!(
            sessions
                .iter()
                .find(|session| session.id == first.id)
                .and_then(|session| session.session_finished_at),
            Some(100)
        );
        assert_eq!(adjacent.start, 200);
    }

    #[test]
    fn logical_session_groups_focus_intervals_and_moves_or_deletes_together() {
        let db = Db::open_in_memory().unwrap();
        let list = db.add_list("L").unwrap();
        let first_task = db.add_task(&list.id, "First", None).unwrap();
        let second_task = db.add_task(&list.id, "Second", None).unwrap();
        let logical_id = "logical-1";
        let first = db
            .add_session_interval(
                &SessionLog {
                    task_id: first_task.id.clone(),
                    start: 100,
                    end: 200,
                },
                Some(logical_id),
                None,
            )
            .unwrap();
        db.add_session_interval(
            &SessionLog {
                task_id: first_task.id,
                start: 300,
                end: 400,
            },
            Some(logical_id),
            None,
        )
        .unwrap();

        assert_eq!(db.finish_logical_session(logical_id, 450).unwrap(), 2);
        assert!(db
            .update_recorded_session(&first.id, Some(&second_task.id), 100, 200, 1_000)
            .unwrap());
        let rows = db.sessions().unwrap();
        assert_eq!(rows.len(), 2);
        assert!(rows.iter().all(|row| {
            row.logical_session_id.as_deref() == Some(logical_id)
                && row.session_finished_at == Some(450)
                && row.task_id == second_task.id
        }));

        db.delete_logical_session(logical_id).unwrap();
        assert!(db.sessions().unwrap().is_empty());
    }

    #[test]
    fn logical_session_backfill_preserves_newer_local_interval_edits() {
        let db = Db::open_in_memory().unwrap();
        let list = db.add_list("L").unwrap();
        let task = db.add_task(&list.id, "Local task", None).unwrap();
        let local = db
            .add_session(&SessionLog {
                task_id: task.id,
                start: 100,
                end: 200,
            })
            .unwrap();
        let remote = Session {
            task_id: "remote-task".into(),
            start: 500,
            end: Some(600),
            updated_at: local.updated_at.saturating_sub(1),
            logical_session_id: Some("logical-remote".into()),
            session_finished_at: Some(700),
            ..local.clone()
        };

        assert!(db
            .backfill_logical_session_fields_from_remote(&[remote])
            .unwrap());
        let merged = db.sessions().unwrap().pop().unwrap();
        assert_eq!(merged.task_id, local.task_id);
        assert_eq!(merged.start, local.start);
        assert_eq!(merged.end, local.end);
        assert_eq!(merged.updated_at, local.updated_at);
        assert_eq!(merged.logical_session_id.as_deref(), Some("logical-remote"));
        assert_eq!(merged.session_finished_at, Some(700));
    }

    #[test]
    fn delete_list_cascades() {
        let db = Db::open_in_memory().unwrap();
        let l = db.add_list("L").unwrap();
        let t = db.add_task(&l.id, "T", None).unwrap();
        db.add_session(&SessionLog {
            task_id: t.id.clone(),
            start: 0,
            end: 100,
        })
        .unwrap();
        db.delete_list(&l.id).unwrap();
        assert_eq!(db.lists().unwrap().len(), 0);
        assert_eq!(db.tasks().unwrap().len(), 0);
        assert_eq!(db.sessions().unwrap().len(), 0);
    }

    #[test]
    fn deletes_are_soft_and_visible_to_sync() {
        let db = Db::open_in_memory().unwrap();
        let l = db.add_list("L").unwrap();
        let t = db.add_task(&l.id, "T", None).unwrap();
        db.delete_task(&t.id).unwrap();

        // hidden from normal reads...
        assert_eq!(db.tasks().unwrap().len(), 0);
        // ...but present as a tombstone for sync to push.
        let (_, tasks, _) = db.dirty_since(0).unwrap();
        let dirty = tasks
            .iter()
            .find(|task| task.id == t.id)
            .expect("tombstone should be visible to dirty_since");
        assert!(dirty.deleted_at.is_some());
        assert!(dirty.updated_at > 0);
    }

    #[test]
    fn mutators_stamp_updated_at() {
        let db = Db::open_in_memory().unwrap();
        let l = db.add_list("L").unwrap();
        let t = db.add_task(&l.id, "T", None).unwrap();
        let before = db
            .tasks()
            .unwrap()
            .into_iter()
            .find(|x| x.id == t.id)
            .unwrap()
            .updated_at;
        std::thread::sleep(std::time::Duration::from_millis(2));
        db.rename_task(&t.id, "T2").unwrap();
        let after = db
            .tasks()
            .unwrap()
            .into_iter()
            .find(|x| x.id == t.id)
            .unwrap()
            .updated_at;
        assert!(after > before);
    }

    #[test]
    fn upsert_from_remote_is_last_write_wins() {
        let db = Db::open_in_memory().unwrap();
        let l = db.add_list("L").unwrap();
        let local = db
            .lists()
            .unwrap()
            .into_iter()
            .find(|x| x.id == l.id)
            .unwrap();

        // Stale remote row (older updated_at) must not clobber the local one.
        let mut stale = local.clone();
        stale.name = "Stale".into();
        stale.updated_at = local.updated_at - 1000;
        db.upsert_from_remote(&[stale], &[], &[]).unwrap();
        assert_eq!(
            db.lists()
                .unwrap()
                .into_iter()
                .find(|x| x.id == l.id)
                .unwrap()
                .name,
            "L"
        );

        // Newer remote row must win.
        let mut newer = local.clone();
        newer.name = "Newer".into();
        newer.updated_at = local.updated_at + 1000;
        db.upsert_from_remote(&[newer], &[], &[]).unwrap();
        assert_eq!(
            db.lists()
                .unwrap()
                .into_iter()
                .find(|x| x.id == l.id)
                .unwrap()
                .name,
            "Newer"
        );
    }

    #[test]
    fn task_impact_roundtrip() {
        let db = Db::open_in_memory().unwrap();
        let l = db.add_list("L").unwrap();
        let t = db.add_task(&l.id, "Smoked a cigarette", None).unwrap();
        // fresh tasks default to weightless/positive, same as a
        // pre-gamification task.
        assert_eq!(t.impact_tier, None);
        assert_eq!(t.impact_sign, 1);

        db.set_task_impact(&t.id, Some("high"), -1).unwrap();
        let reloaded = db
            .tasks()
            .unwrap()
            .into_iter()
            .find(|x| x.id == t.id)
            .unwrap();
        assert_eq!(reloaded.impact_tier.as_deref(), Some("high"));
        assert_eq!(reloaded.impact_sign, -1);

        // clearing the tier keeps the row (not deleted), just untagged again.
        db.set_task_impact(&t.id, None, 1).unwrap();
        let cleared = db
            .tasks()
            .unwrap()
            .into_iter()
            .find(|x| x.id == t.id)
            .unwrap();
        assert_eq!(cleared.impact_tier, None);
        assert_eq!(cleared.impact_sign, 1);
    }

    #[test]
    fn planner_fields_roundtrip() {
        let db = Db::open_in_memory().unwrap();
        let list = db.add_list("Workplace").unwrap();
        let availability = vec![
            WeeklyTimeWindow {
                weekday: 1,
                start_minute: 9 * 60,
                end_minute: 13 * 60,
            },
            WeeklyTimeWindow {
                weekday: 1,
                start_minute: 14 * 60,
                end_minute: 18 * 60,
            },
        ];
        db.set_list_availability(&list.id, &availability).unwrap();

        let task = db
            .add_task(&list.id, "Write proposal", Some(8 * 60))
            .unwrap();
        let daily_windows = vec![WeeklyTimeWindow {
            weekday: 2,
            start_minute: 7 * 60,
            end_minute: 7 * 60 + 45,
        }];
        db.set_daily_windows(&task.id, &daily_windows).unwrap();
        db.set_session_range(&task.id, Some(30), Some(90)).unwrap();

        let reloaded_list = db
            .lists()
            .unwrap()
            .into_iter()
            .find(|item| item.id == list.id)
            .unwrap();
        assert_eq!(reloaded_list.availability_windows, availability);

        let reloaded_task = db
            .tasks()
            .unwrap()
            .into_iter()
            .find(|item| item.id == task.id)
            .unwrap();
        assert_eq!(reloaded_task.daily_windows, daily_windows);
        assert_eq!(reloaded_task.min_session_min, Some(30));
        assert_eq!(reloaded_task.max_session_min, Some(90));
    }

    #[test]
    fn planned_sessions_crud_cascade_and_remote_lww() {
        let db = Db::open_in_memory().unwrap();
        let list = db.add_list("Work").unwrap();
        let task = db.add_task(&list.id, "Write proposal", Some(60)).unwrap();
        let other_task = db.add_task(&list.id, "Review proposal", Some(30)).unwrap();
        let future = now_ms() + 60_000;
        let planned = db
            .add_planned_session(&task.id, future, future + 1_000)
            .unwrap()
            .expect("one-time incomplete task should be plannable");

        assert_eq!(db.planned_sessions().unwrap(), vec![planned.clone()]);
        assert!(db
            .update_planned_session(
                &planned.id,
                Some(&other_task.id),
                future + 500,
                future + 2_000,
            )
            .unwrap());
        let updated = db.planned_sessions().unwrap().remove(0);
        assert_eq!(updated.task_id, other_task.id);
        assert_eq!((updated.start, updated.end), (future + 500, future + 2_000));
        assert!(db
            .update_planned_session(&planned.id, None, future + 600, future + 2_100)
            .unwrap());
        let updated = db.planned_sessions().unwrap().remove(0);
        assert_eq!(updated.task_id, other_task.id);

        let mut stale = updated.clone();
        stale.start = future + 1_000;
        stale.updated_at -= 1;
        db.upsert_planned_sessions_from_remote(&[stale], false)
            .unwrap();
        assert_eq!(db.planned_sessions().unwrap()[0].start, future + 600);

        let mut newer = updated.clone();
        newer.start = future + 1_000;
        newer.end = future + 3_000;
        newer.updated_at += 1;
        db.upsert_planned_sessions_from_remote(&[newer], false)
            .unwrap();
        assert_eq!(db.planned_sessions().unwrap()[0].start, future + 1_000);

        db.set_completed(&other_task.id, Some(now_ms())).unwrap();
        assert!(db.planned_sessions().unwrap().is_empty());
        assert_eq!(db.planned_sessions_dirty_since(0).unwrap().len(), 1);
    }

    #[test]
    fn planned_sessions_reject_repeating_completed_and_invalid_ranges() {
        let db = Db::open_in_memory().unwrap();
        let list = db.add_list("Work").unwrap();
        let future = now_ms() + 60_000;
        let repeating = db.add_task(&list.id, "Routine", None).unwrap();
        db.set_cadence(&repeating.id, Some("daily")).unwrap();
        assert!(db
            .add_planned_session(&repeating.id, future, future + 1_000)
            .unwrap()
            .is_none());

        let completed = db.add_task(&list.id, "Done", None).unwrap();
        db.set_completed(&completed.id, Some(now_ms())).unwrap();
        assert!(db
            .add_planned_session(&completed.id, future, future + 1_000)
            .unwrap()
            .is_none());

        let open = db.add_task(&list.id, "Open", None).unwrap();
        let planned = db
            .add_planned_session(&open.id, future, future + 1_000)
            .unwrap()
            .unwrap();
        assert!(!db
            .update_planned_session(&planned.id, Some(&repeating.id), future, future + 2_000,)
            .unwrap());
        assert!(db
            .add_planned_session(&open.id, 2_000, 1_000)
            .unwrap()
            .is_none());
        assert!(db
            .add_planned_session(&open.id, 1_000, 2_000)
            .unwrap()
            .is_none());
    }

    #[test]
    fn automatic_plan_acceptance_is_atomic_and_task_deletion_removes_plans() {
        use crate::planner::AutomaticPlanSuggestion;

        let db = Db::open_in_memory().unwrap();
        let list = db.add_list("Work").unwrap();
        let first = db.add_task(&list.id, "First", Some(30)).unwrap();
        let second = db.add_task(&list.id, "Second", Some(30)).unwrap();
        let repeating = db.add_task(&list.id, "Routine", Some(30)).unwrap();
        db.set_cadence(&repeating.id, Some("daily")).unwrap();
        let future = now_ms() + 60_000;
        let valid = AutomaticPlanSuggestion {
            task_id: first.id.clone(),
            start: future,
            end: future + 30 * 60_000,
        };
        let invalid = AutomaticPlanSuggestion {
            task_id: repeating.id,
            start: future + 30 * 60_000,
            end: future + 60 * 60_000,
        };

        assert!(db
            .add_planned_session_suggestions(&[valid.clone(), invalid])
            .unwrap()
            .is_none());
        assert!(db.planned_sessions().unwrap().is_empty());

        let second_suggestion = AutomaticPlanSuggestion {
            task_id: second.id,
            start: future + 30 * 60_000,
            end: future + 60 * 60_000,
        };
        assert_eq!(
            db.add_planned_session_suggestions(&[valid, second_suggestion])
                .unwrap()
                .unwrap()
                .len(),
            2
        );
        db.delete_task(&first.id).unwrap();
        assert_eq!(db.planned_sessions().unwrap().len(), 1);
        assert_eq!(db.planned_sessions_dirty_since(0).unwrap().len(), 2);
    }

    #[test]
    fn planner_backfill_fills_new_fields_without_replacing_local_row_edits() {
        let db = Db::open_in_memory().unwrap();
        let local_list = db.add_list("Local list name").unwrap();
        let local_task = db
            .add_task(&local_list.id, "Local task name", Some(45))
            .unwrap();

        let mut remote_list = local_list.clone();
        remote_list.name = "Older remote list name".to_string();
        remote_list.updated_at = local_list.updated_at - 1;
        remote_list.availability_windows = vec![WeeklyTimeWindow {
            weekday: 1,
            start_minute: 9 * 60,
            end_minute: 17 * 60,
        }];

        let mut remote_task = local_task.clone();
        remote_task.name = "Older remote task name".to_string();
        remote_task.updated_at = local_task.updated_at - 1;
        remote_task.cadence = Some("daily".to_string());
        remote_task.daily_windows = vec![WeeklyTimeWindow {
            weekday: 1,
            start_minute: 10 * 60,
            end_minute: 11 * 60,
        }];
        remote_task.min_session_min = Some(20);
        remote_task.max_session_min = Some(45);

        let remote_order = ["relationships", "health", "career", "finance", "recreation"];
        let priorities = remote_order
            .iter()
            .enumerate()
            .map(|(index, area)| LifeAreaPriority {
                area_key: area.to_string(),
                priority_rank: index as i64 + 1,
                updated_at: 1,
            })
            .collect::<Vec<_>>();

        assert!(db
            .backfill_planner_fields_from_remote(&[remote_list], &[remote_task], &priorities)
            .unwrap());

        let merged_list = db
            .lists()
            .unwrap()
            .into_iter()
            .find(|list| list.id == local_list.id)
            .unwrap();
        assert_eq!(merged_list.name, "Local list name");
        assert_eq!(merged_list.updated_at, local_list.updated_at);
        assert_eq!(merged_list.availability_windows.len(), 1);

        let merged_task = db
            .tasks()
            .unwrap()
            .into_iter()
            .find(|task| task.id == local_task.id)
            .unwrap();
        assert_eq!(merged_task.name, "Local task name");
        assert_eq!(merged_task.updated_at, local_task.updated_at);
        assert_eq!(merged_task.cadence.as_deref(), Some("daily"));
        assert_eq!(merged_task.daily_windows.len(), 1);
        assert_eq!(merged_task.min_session_min, Some(20));
        assert_eq!(merged_task.max_session_min, Some(45));
        assert_eq!(
            db.life_area_priorities().unwrap()[0].area_key,
            "relationships"
        );

        assert_eq!(
            db.sync_schema_backfill().as_deref(),
            Some("planner_music_user_settings_v1_planned_sessions_v1_logical_sessions_v1")
        );
        db.clear_sync_schema_backfill().unwrap();
        assert_eq!(db.sync_schema_backfill(), None);
    }

    #[test]
    fn user_settings_default_on_and_remote_lww() {
        let db = Db::open_in_memory().unwrap();
        assert!(db.get_user_settings().pause_for_other_audio);
        assert!(!db.get_user_settings().take_over_apple_music);
        assert!(!db.get_user_settings().take_over_music_players);

        let disabled = UserSettings {
            pause_for_other_audio: false,
            take_over_apple_music: true,
            take_over_music_players: true,
            updated_at: 20,
        };
        assert!(db
            .upsert_user_settings_from_remote(&disabled, false)
            .unwrap());
        assert!(!db.get_user_settings().pause_for_other_audio);
        assert!(db.get_user_settings().take_over_apple_music);
        assert!(db.get_user_settings().take_over_music_players);

        let stale = UserSettings {
            pause_for_other_audio: true,
            take_over_apple_music: false,
            take_over_music_players: false,
            updated_at: 10,
        };
        assert!(!db.upsert_user_settings_from_remote(&stale, false).unwrap());
        assert!(!db.get_user_settings().pause_for_other_audio);
    }

    #[test]
    fn life_area_priority_defaults_reorder_and_sync_guard() {
        let db = Db::open_in_memory().unwrap();
        let defaults = db.life_area_priorities().unwrap();
        assert_eq!(defaults.len(), 5);
        assert_eq!(defaults[0].area_key, "career");

        let order =
            ["relationships", "health", "career", "finance", "recreation"].map(String::from);
        db.reorder_life_areas(&order).unwrap();

        let reordered = db.life_area_priorities().unwrap();
        assert_eq!(reordered[0].area_key, "relationships");
        assert_eq!(reordered[0].priority_rank, 1);
        assert_eq!(db.snapshot().unwrap().life_area_priorities, reordered);

        let mut stale = reordered[0].clone();
        stale.priority_rank = 6;
        stale.updated_at -= 1;
        db.upsert_life_area_priorities_from_remote(&[stale], false)
            .unwrap();
        assert_eq!(
            db.life_area_priorities().unwrap()[0].area_key,
            "relationships"
        );

        let legacy = LifeAreaPriority {
            area_key: "growth".to_string(),
            priority_rank: 1,
            updated_at: now_ms() + 10,
        };
        db.upsert_life_area_priorities_from_remote(&[legacy], false)
            .unwrap();
        assert_eq!(db.life_area_priorities().unwrap().len(), 5);
    }

    #[test]
    fn remote_legacy_growth_tag_is_normalized_to_health() {
        let db = Db::open_in_memory().unwrap();
        let mut remote = db.add_list("Legacy growth list").unwrap();
        remote.life_area = Some("growth".to_string());
        remote.updated_at += 1;

        db.upsert_from_remote(&[remote.clone()], &[], &[]).unwrap();

        let stored = db
            .lists()
            .unwrap()
            .into_iter()
            .find(|list| list.id == remote.id)
            .unwrap();
        assert_eq!(stored.life_area.as_deref(), Some("health"));
        assert_eq!(stored.color, "#2f9e8f");
    }
}
