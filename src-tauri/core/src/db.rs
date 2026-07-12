use crate::models::*;
use rusqlite::{params, Connection};

const PALETTE: [&str; 8] = [
    "#1db954", "#e13300", "#8d67ab", "#e8115b", "#509bf5", "#f59b23", "#ba5d07", "#27856a",
];

pub struct Db {
    conn: Connection,
}

impl Db {
    pub fn open(path: &str) -> rusqlite::Result<Db> {
        let db = Db { conn: Connection::open(path)? };
        db.migrate()?;
        db.seed_if_empty()?;
        Ok(db)
    }

    pub fn open_in_memory() -> rusqlite::Result<Db> {
        let db = Db { conn: Connection::open_in_memory()? };
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
            .prepare("SELECT id,name,emoji,color,ord,updated_at,life_area,life_direction FROM lists WHERE deleted_at IS NULL ORDER BY ord")?;
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
                deleted_at: None,
            })
        })?;
        rows.collect()
    }

    pub fn add_list(&self, name: &str) -> rusqlite::Result<TaskList> {
        let order = self.lists()?.len() as i64;
        let color = PALETTE[(order as usize) % PALETTE.len()].to_string();
        let l = TaskList { id: new_id(), name: name.to_string(), emoji: "📁".into(), color, order, updated_at: now_ms(), life_area: None, life_direction: None, deleted_at: None };
        self.conn.execute(
            "INSERT INTO lists(id,name,emoji,color,ord,updated_at) VALUES(?1,?2,?3,?4,?5,?6)",
            params![l.id, l.name, l.emoji, l.color, l.order, l.updated_at],
        )?;
        Ok(l)
    }

    pub fn rename_list(&self, id: &str, name: &str) -> rusqlite::Result<()> {
        self.conn
            .execute("UPDATE lists SET name=?1, updated_at=?2 WHERE id=?3", params![name, now_ms(), id])?;
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
    pub fn set_list_life_tag(&self, id: &str, area: Option<&str>, direction: Option<&str>) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE lists SET life_area=?1, life_direction=?2, updated_at=?3 WHERE id=?4",
            params![area, direction, now_ms(), id],
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

    pub fn delete_list(&self, id: &str) -> rusqlite::Result<()> {
        let now = now_ms();
        self.conn.execute(
            "UPDATE sessions SET deleted_at=?1, updated_at=?1 WHERE task_id IN (SELECT id FROM tasks WHERE list_id=?2)",
            params![now, id],
        )?;
        self.conn.execute("UPDATE tasks SET deleted_at=?1, updated_at=?1 WHERE list_id=?2", params![now, id])?;
        self.conn.execute("UPDATE lists SET deleted_at=?1, updated_at=?1 WHERE id=?2", params![now, id])?;
        Ok(())
    }

    // ---- Tasks ----
    pub fn tasks(&self) -> rusqlite::Result<Vec<Task>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id,list_id,name,depth,ord,est,done,descr,updated_at,album,impact_tier,impact_sign,deadline_at FROM tasks WHERE deleted_at IS NULL ORDER BY ord")?;
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
                deleted_at: None,
            })
        })?;
        rows.collect()
    }

    pub fn add_task(&self, list_id: &str, name: &str, estimate_min: Option<i64>) -> rusqlite::Result<Task> {
        let order: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM tasks WHERE list_id=?1 AND deleted_at IS NULL",
            params![list_id],
            |r| r.get(0),
        )?;
        let t = Task { id: new_id(), list_id: list_id.to_string(), name: name.to_string(), depth: None, order, estimate_min, album: None, completed_at: None, description: None, updated_at: now_ms(), impact_tier: None, impact_sign: 1, deadline_at: None, deleted_at: None };
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
        self.conn
            .execute("UPDATE tasks SET name=?1, updated_at=?2 WHERE id=?3", params![name, now_ms(), id])?;
        Ok(())
    }

    pub fn set_depth(&self, id: &str, depth: Option<&str>) -> rusqlite::Result<()> {
        self.conn
            .execute("UPDATE tasks SET depth=?1, updated_at=?2 WHERE id=?3", params![depth, now_ms(), id])?;
        Ok(())
    }

    pub fn set_estimate(&self, id: &str, est_min: Option<i64>) -> rusqlite::Result<()> {
        self.conn
            .execute("UPDATE tasks SET est=?1, updated_at=?2 WHERE id=?3", params![est_min, now_ms(), id])?;
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
        self.conn
            .execute("UPDATE tasks SET done=?1, updated_at=?2 WHERE id=?3", params![at, now_ms(), id])?;
        Ok(())
    }

    pub fn set_description(&self, id: &str, descr: Option<&str>) -> rusqlite::Result<()> {
        self.conn
            .execute("UPDATE tasks SET descr=?1, updated_at=?2 WHERE id=?3", params![descr, now_ms(), id])?;
        Ok(())
    }

    /// Set (or clear, with `None`) which album a task belongs to. A blank
    /// string is normalized to `None` so clearing the field in the UI (an
    /// empty text input) reads back as "no album" rather than an empty tag.
    pub fn set_album(&self, id: &str, album: Option<&str>) -> rusqlite::Result<()> {
        let album = album.map(str::trim).filter(|s| !s.is_empty());
        self.conn
            .execute("UPDATE tasks SET album=?1, updated_at=?2 WHERE id=?3", params![album, now_ms(), id])?;
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
        self.conn.execute("UPDATE sessions SET deleted_at=?1, updated_at=?1 WHERE task_id=?2", params![now, id])?;
        self.conn.execute("UPDATE tasks SET deleted_at=?1, updated_at=?1 WHERE id=?2", params![now, id])?;
        Ok(())
    }

    // ---- Sessions ----
    pub fn sessions(&self) -> rusqlite::Result<Vec<Session>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id,task_id,start,end,updated_at FROM sessions WHERE deleted_at IS NULL ORDER BY start")?;
        let rows = stmt.query_map([], |r| {
            Ok(Session { id: r.get(0)?, task_id: r.get(1)?, start: r.get(2)?, end: r.get(3)?, updated_at: r.get(4)?, deleted_at: None })
        })?;
        rows.collect()
    }

    pub fn add_session(&self, log: &SessionLog) -> rusqlite::Result<Session> {
        let s = Session { id: new_id(), task_id: log.task_id.clone(), start: log.start, end: Some(log.end), updated_at: now_ms(), deleted_at: None };
        self.conn.execute(
            "INSERT INTO sessions(id,task_id,start,end,updated_at) VALUES(?1,?2,?3,?4,?5)",
            params![s.id, s.task_id, s.start, s.end, s.updated_at],
        )?;
        Ok(s)
    }

    pub fn delete_session(&self, id: &str) -> rusqlite::Result<()> {
        self.conn
            .execute("UPDATE sessions SET deleted_at=?1, updated_at=?1 WHERE id=?2", params![now_ms(), id])?;
        Ok(())
    }

    pub fn update_session(&self, id: &str, start: i64, end: i64) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE sessions SET start=?1, end=?2, updated_at=?3 WHERE id=?4 AND deleted_at IS NULL",
            params![start, end, now_ms(), id],
        )?;
        Ok(())
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

    /// All rows (including soft-deleted tombstones) changed since `ts`, for
    /// pushing to the remote. Unlike `lists()`/`tasks()`/`sessions()`, this
    /// intentionally does not filter `deleted_at` — a delete has to reach the
    /// other device too.
    pub fn dirty_since(&self, ts: i64) -> rusqlite::Result<(Vec<TaskList>, Vec<Task>, Vec<Session>)> {
        let mut lstmt = self.conn.prepare(
            "SELECT id,name,emoji,color,ord,updated_at,deleted_at,life_area,life_direction FROM lists WHERE updated_at > ?1",
        )?;
        let lists = lstmt
            .query_map(params![ts], |r| {
                Ok(TaskList {
                    id: r.get(0)?, name: r.get(1)?, emoji: r.get(2)?, color: r.get(3)?, order: r.get(4)?,
                    updated_at: r.get(5)?, deleted_at: r.get(6)?, life_area: r.get(7)?, life_direction: r.get(8)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        let mut tstmt = self.conn.prepare(
            "SELECT id,list_id,name,depth,ord,est,done,descr,updated_at,deleted_at,album,impact_tier,impact_sign,deadline_at FROM tasks WHERE updated_at > ?1",
        )?;
        let tasks = tstmt
            .query_map(params![ts], |r| {
                Ok(Task {
                    id: r.get(0)?, list_id: r.get(1)?, name: r.get(2)?, depth: r.get(3)?, order: r.get(4)?,
                    estimate_min: r.get(5)?, completed_at: r.get(6)?, description: r.get(7)?,
                    updated_at: r.get(8)?, deleted_at: r.get(9)?, album: r.get(10)?,
                    impact_tier: r.get(11)?, impact_sign: r.get::<_, Option<i64>>(12)?.unwrap_or(1),
                    deadline_at: r.get(13)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        let mut sstmt = self.conn.prepare(
            "SELECT id,task_id,start,end,updated_at,deleted_at FROM sessions WHERE updated_at > ?1",
        )?;
        let sessions = sstmt
            .query_map(params![ts], |r| {
                Ok(Session {
                    id: r.get(0)?, task_id: r.get(1)?, start: r.get(2)?, end: r.get(3)?,
                    updated_at: r.get(4)?, deleted_at: r.get(5)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok((lists, tasks, sessions))
    }

    /// Apply rows pulled from the remote. Same last-write-wins rule as the
    /// Postgres-side `lww_guard` trigger: a row only overwrites the local
    /// copy if its `updated_at` is strictly newer.
    pub fn upsert_from_remote(&self, lists: &[TaskList], tasks: &[Task], sessions: &[Session]) -> rusqlite::Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        for l in lists {
            tx.execute(
                "INSERT INTO lists(id,name,emoji,color,ord,updated_at,deleted_at,life_area,life_direction) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)
                 ON CONFLICT(id) DO UPDATE SET name=excluded.name, emoji=excluded.emoji, color=excluded.color,
                   ord=excluded.ord, updated_at=excluded.updated_at, deleted_at=excluded.deleted_at,
                   life_area=excluded.life_area, life_direction=excluded.life_direction
                 WHERE excluded.updated_at > lists.updated_at",
                params![l.id, l.name, l.emoji, l.color, l.order, l.updated_at, l.deleted_at, l.life_area, l.life_direction],
            )?;
        }
        for t in tasks {
            // impact_tier/impact_sign/deadline_at now round-trip through
            // Supabase like every other field (see sync.rs's RemoteTask) —
            // the Supabase `tasks` table needs the matching columns added
            // first (see the `alter table` note in db.sql) for a remote row
            // to actually carry a real value here instead of the
            // pre-migration default.
            tx.execute(
                "INSERT INTO tasks(id,list_id,name,depth,ord,est,done,descr,updated_at,deleted_at,album,impact_tier,impact_sign,deadline_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)
                 ON CONFLICT(id) DO UPDATE SET list_id=excluded.list_id, name=excluded.name, depth=excluded.depth,
                   ord=excluded.ord, est=excluded.est, done=excluded.done, descr=excluded.descr,
                   updated_at=excluded.updated_at, deleted_at=excluded.deleted_at, album=excluded.album,
                   impact_tier=excluded.impact_tier, impact_sign=excluded.impact_sign, deadline_at=excluded.deadline_at
                 WHERE excluded.updated_at > tasks.updated_at",
                params![t.id, t.list_id, t.name, t.depth, t.order, t.estimate_min, t.completed_at, t.description, t.updated_at, t.deleted_at, t.album, t.impact_tier, t.impact_sign, t.deadline_at],
            )?;
        }
        for s in sessions {
            tx.execute(
                "INSERT INTO sessions(id,task_id,start,end,updated_at,deleted_at) VALUES(?1,?2,?3,?4,?5,?6)
                 ON CONFLICT(id) DO UPDATE SET task_id=excluded.task_id, start=excluded.start, end=excluded.end,
                   updated_at=excluded.updated_at, deleted_at=excluded.deleted_at
                 WHERE excluded.updated_at > sessions.updated_at",
                params![s.id, s.task_id, s.start, s.end, s.updated_at, s.deleted_at],
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
        config: Option<&SessionConfig>,
    ) -> rusqlite::Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        tx.execute("DELETE FROM sessions", [])?;
        tx.execute("DELETE FROM tasks", [])?;
        tx.execute("DELETE FROM lists", [])?;
        for l in lists {
            tx.execute(
                "INSERT INTO lists(id,name,emoji,color,ord,updated_at,life_area,life_direction) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
                params![l.id, l.name, l.emoji, l.color, l.order, l.updated_at, l.life_area, l.life_direction],
            )?;
        }
        for t in tasks {
            tx.execute(
                "INSERT INTO tasks(id,list_id,name,depth,ord,est,done,descr,updated_at,album,impact_tier,impact_sign,deadline_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
                params![t.id, t.list_id, t.name, t.depth, t.order, t.estimate_min, t.completed_at, t.description, t.updated_at, t.album, t.impact_tier, t.impact_sign, t.deadline_at],
            )?;
        }
        for s in sessions {
            tx.execute(
                "INSERT INTO sessions(id,task_id,start,end,updated_at) VALUES(?1,?2,?3,?4,?5)",
                params![s.id, s.task_id, s.start, s.end, s.updated_at],
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
            .query_row("SELECT value FROM meta WHERE key=?1", params![key], |r| r.get::<_, String>(0))
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
        self.conn.execute("DELETE FROM meta WHERE key=?1", params![key])?;
        Ok(())
    }

    /// Cached, non-secret Google/Supabase profile info. The actual refresh
    /// token lives in the OS Keychain (see `src-tauri/src/auth.rs`), never here.
    pub fn get_account(&self) -> Option<AccountInfo> {
        self.get_meta("account").and_then(|v| serde_json::from_str(&v).ok())
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
        self.get_meta("sync_push_cursor").and_then(|v| v.parse().ok()).unwrap_or(0)
    }

    pub fn set_push_cursor(&self, ts: i64) -> rusqlite::Result<()> {
        self.set_meta("sync_push_cursor", &ts.to_string())
    }

    pub fn get_pull_cursor(&self) -> i64 {
        self.get_meta("sync_pull_cursor").and_then(|v| v.parse().ok()).unwrap_or(0)
    }

    pub fn set_pull_cursor(&self, ts: i64) -> rusqlite::Result<()> {
        self.set_meta("sync_pull_cursor", &ts.to_string())
    }

    // ---- Snapshot ----
    pub fn snapshot(&self) -> rusqlite::Result<Snapshot> {
        Ok(Snapshot {
            lists: self.lists()?,
            tasks: self.tasks()?,
            sessions: self.sessions()?,
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
        let count: i64 = self.conn.query_row("SELECT COUNT(*) FROM lists", [], |r| r.get(0))?;
        if count > 0 {
            return Ok(());
        }
        let now = now_ms();
        let deep = self.add_list("Deep Work")?;
        // give the seeded list a signature color/emoji
        self.conn.execute(
            "UPDATE lists SET emoji='🎯', color='#1db954' WHERE id=?1",
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

        self.add_session(&SessionLog { task_id: t1.id.clone(), start: now - 86_400_000, end: now - 86_400_000 + 3_600_000 })?;
        self.add_session(&SessionLog { task_id: t1.id.clone(), start: now - 3_600_000, end: now - 3_600_000 + 1_500_000 })?;
        self.add_session(&SessionLog { task_id: t2.id.clone(), start: now - 7_200_000, end: now - 7_200_000 + 2_100_000 })?;
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
        assert_eq!(db.lists().iter().flatten().find(|x| x.id == l.id).unwrap().name, "Renamed");
    }

    #[test]
    fn play_stop_logs_session_via_timer() {
        let db = Db::open_in_memory().unwrap();
        let l = db.add_list("L").unwrap();
        let t = db.add_task(&l.id, "T", None).unwrap();

        let (run, _) = timer::play(&RunState::default(), &t.id, 1_000);
        db.set_run(&run).unwrap();
        let (run2, log) = timer::stop(&db.get_run(), 5_000);
        db.set_run(&run2).unwrap();
        let s = db.add_session(&log.unwrap()).unwrap();
        assert_eq!(s.end.unwrap() - s.start, 4_000);
        assert_eq!(db.sessions().unwrap().len(), 1);
        assert!(db.get_run().active_task_id.is_none());
    }

    #[test]
    fn delete_list_cascades() {
        let db = Db::open_in_memory().unwrap();
        let l = db.add_list("L").unwrap();
        let t = db.add_task(&l.id, "T", None).unwrap();
        db.add_session(&SessionLog { task_id: t.id.clone(), start: 0, end: 100 }).unwrap();
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
        let dirty = tasks.iter().find(|task| task.id == t.id).expect("tombstone should be visible to dirty_since");
        assert!(dirty.deleted_at.is_some());
        assert!(dirty.updated_at > 0);
    }

    #[test]
    fn mutators_stamp_updated_at() {
        let db = Db::open_in_memory().unwrap();
        let l = db.add_list("L").unwrap();
        let t = db.add_task(&l.id, "T", None).unwrap();
        let before = db.tasks().unwrap().into_iter().find(|x| x.id == t.id).unwrap().updated_at;
        std::thread::sleep(std::time::Duration::from_millis(2));
        db.rename_task(&t.id, "T2").unwrap();
        let after = db.tasks().unwrap().into_iter().find(|x| x.id == t.id).unwrap().updated_at;
        assert!(after > before);
    }

    #[test]
    fn upsert_from_remote_is_last_write_wins() {
        let db = Db::open_in_memory().unwrap();
        let l = db.add_list("L").unwrap();
        let local = db.lists().unwrap().into_iter().find(|x| x.id == l.id).unwrap();

        // Stale remote row (older updated_at) must not clobber the local one.
        let mut stale = local.clone();
        stale.name = "Stale".into();
        stale.updated_at = local.updated_at - 1000;
        db.upsert_from_remote(&[stale], &[], &[]).unwrap();
        assert_eq!(db.lists().unwrap().into_iter().find(|x| x.id == l.id).unwrap().name, "L");

        // Newer remote row must win.
        let mut newer = local.clone();
        newer.name = "Newer".into();
        newer.updated_at = local.updated_at + 1000;
        db.upsert_from_remote(&[newer], &[], &[]).unwrap();
        assert_eq!(db.lists().unwrap().into_iter().find(|x| x.id == l.id).unwrap().name, "Newer");
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
        let reloaded = db.tasks().unwrap().into_iter().find(|x| x.id == t.id).unwrap();
        assert_eq!(reloaded.impact_tier.as_deref(), Some("high"));
        assert_eq!(reloaded.impact_sign, -1);

        // clearing the tier keeps the row (not deleted), just untagged again.
        db.set_task_impact(&t.id, None, 1).unwrap();
        let cleared = db.tasks().unwrap().into_iter().find(|x| x.id == t.id).unwrap();
        assert_eq!(cleared.impact_tier, None);
        assert_eq!(cleared.impact_sign, 1);
    }

}
