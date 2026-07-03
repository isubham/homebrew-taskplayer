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

    fn migrate(&self) -> rusqlite::Result<()> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS lists(id TEXT PRIMARY KEY, name TEXT NOT NULL, emoji TEXT, color TEXT, ord INTEGER);
             CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, list_id TEXT NOT NULL, name TEXT NOT NULL, depth TEXT, ord INTEGER, est INTEGER, done INTEGER, descr TEXT);
             CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, task_id TEXT NOT NULL, start INTEGER NOT NULL, end INTEGER);
             CREATE INDEX IF NOT EXISTS idx_tasks_list ON tasks(list_id);
             CREATE INDEX IF NOT EXISTS idx_sessions_task ON sessions(task_id);
             CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);",
        )?;
        // add columns to databases created before these features (errors if the
        // column already exists — safe to ignore)
        let _ = self.conn.execute("ALTER TABLE tasks ADD COLUMN est INTEGER", []);
        let _ = self.conn.execute("ALTER TABLE tasks ADD COLUMN done INTEGER", []);
        let _ = self.conn.execute("ALTER TABLE tasks ADD COLUMN descr TEXT", []);
        Ok(())
    }

    // ---- Lists ----
    pub fn lists(&self) -> rusqlite::Result<Vec<TaskList>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id,name,emoji,color,ord FROM lists ORDER BY ord")?;
        let rows = stmt.query_map([], |r| {
            Ok(TaskList {
                id: r.get(0)?,
                name: r.get(1)?,
                emoji: r.get(2)?,
                color: r.get(3)?,
                order: r.get(4)?,
            })
        })?;
        rows.collect()
    }

    pub fn add_list(&self, name: &str) -> rusqlite::Result<TaskList> {
        let order = self.lists()?.len() as i64;
        let color = PALETTE[(order as usize) % PALETTE.len()].to_string();
        let l = TaskList { id: new_id(), name: name.to_string(), emoji: "📁".into(), color, order };
        self.conn.execute(
            "INSERT INTO lists(id,name,emoji,color,ord) VALUES(?1,?2,?3,?4,?5)",
            params![l.id, l.name, l.emoji, l.color, l.order],
        )?;
        Ok(l)
    }

    pub fn rename_list(&self, id: &str, name: &str) -> rusqlite::Result<()> {
        self.conn
            .execute("UPDATE lists SET name=?1 WHERE id=?2", params![name, id])?;
        Ok(())
    }

    pub fn delete_list(&self, id: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "DELETE FROM sessions WHERE task_id IN (SELECT id FROM tasks WHERE list_id=?1)",
            params![id],
        )?;
        self.conn.execute("DELETE FROM tasks WHERE list_id=?1", params![id])?;
        self.conn.execute("DELETE FROM lists WHERE id=?1", params![id])?;
        Ok(())
    }

    // ---- Tasks ----
    pub fn tasks(&self) -> rusqlite::Result<Vec<Task>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id,list_id,name,depth,ord,est,done,descr FROM tasks ORDER BY ord")?;
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
            })
        })?;
        rows.collect()
    }

    pub fn add_task(&self, list_id: &str, name: &str) -> rusqlite::Result<Task> {
        let order: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM tasks WHERE list_id=?1",
            params![list_id],
            |r| r.get(0),
        )?;
        let t = Task { id: new_id(), list_id: list_id.to_string(), name: name.to_string(), depth: None, order, estimate_min: None, completed_at: None, description: None };
        self.conn.execute(
            "INSERT INTO tasks(id,list_id,name,depth,ord,est,done,descr) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
            params![t.id, t.list_id, t.name, t.depth, t.order, t.estimate_min, t.completed_at, t.description],
        )?;
        Ok(t)
    }

    pub fn rename_task(&self, id: &str, name: &str) -> rusqlite::Result<()> {
        self.conn
            .execute("UPDATE tasks SET name=?1 WHERE id=?2", params![name, id])?;
        Ok(())
    }

    pub fn set_depth(&self, id: &str, depth: Option<&str>) -> rusqlite::Result<()> {
        self.conn
            .execute("UPDATE tasks SET depth=?1 WHERE id=?2", params![depth, id])?;
        Ok(())
    }

    pub fn set_estimate(&self, id: &str, est_min: Option<i64>) -> rusqlite::Result<()> {
        self.conn
            .execute("UPDATE tasks SET est=?1 WHERE id=?2", params![est_min, id])?;
        Ok(())
    }

    pub fn set_completed(&self, id: &str, at: Option<i64>) -> rusqlite::Result<()> {
        self.conn
            .execute("UPDATE tasks SET done=?1 WHERE id=?2", params![at, id])?;
        Ok(())
    }

    pub fn set_description(&self, id: &str, descr: Option<&str>) -> rusqlite::Result<()> {
        self.conn
            .execute("UPDATE tasks SET descr=?1 WHERE id=?2", params![descr, id])?;
        Ok(())
    }

    /// Move a task to another list, placing it at the end of the target list.
    pub fn move_task(&self, id: &str, list_id: &str) -> rusqlite::Result<()> {
        let order: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM tasks WHERE list_id=?1",
            params![list_id],
            |r| r.get(0),
        )?;
        self.conn.execute(
            "UPDATE tasks SET list_id=?1, ord=?2 WHERE id=?3",
            params![list_id, order, id],
        )?;
        Ok(())
    }

    pub fn delete_task(&self, id: &str) -> rusqlite::Result<()> {
        self.conn.execute("DELETE FROM sessions WHERE task_id=?1", params![id])?;
        self.conn.execute("DELETE FROM tasks WHERE id=?1", params![id])?;
        Ok(())
    }

    // ---- Sessions ----
    pub fn sessions(&self) -> rusqlite::Result<Vec<Session>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id,task_id,start,end FROM sessions ORDER BY start")?;
        let rows = stmt.query_map([], |r| {
            Ok(Session { id: r.get(0)?, task_id: r.get(1)?, start: r.get(2)?, end: r.get(3)? })
        })?;
        rows.collect()
    }

    pub fn add_session(&self, log: &SessionLog) -> rusqlite::Result<Session> {
        let s = Session { id: new_id(), task_id: log.task_id.clone(), start: log.start, end: Some(log.end) };
        self.conn.execute(
            "INSERT INTO sessions(id,task_id,start,end) VALUES(?1,?2,?3,?4)",
            params![s.id, s.task_id, s.start, s.end],
        )?;
        Ok(s)
    }

    pub fn delete_session(&self, id: &str) -> rusqlite::Result<()> {
        self.conn
            .execute("DELETE FROM sessions WHERE id=?1", params![id])?;
        Ok(())
    }

    /// Task ids ordered by most-recently-played first (by latest session).
    pub fn recent_task_ids(&self, limit: usize) -> Vec<String> {
        let mut stmt = match self.conn.prepare(
            "SELECT task_id FROM sessions GROUP BY task_id ORDER BY MAX(COALESCE(end,start)) DESC LIMIT ?1",
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
                "INSERT INTO lists(id,name,emoji,color,ord) VALUES(?1,?2,?3,?4,?5)",
                params![l.id, l.name, l.emoji, l.color, l.order],
            )?;
        }
        for t in tasks {
            tx.execute(
                "INSERT INTO tasks(id,list_id,name,depth,ord,est,done,descr) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
                params![t.id, t.list_id, t.name, t.depth, t.order, t.estimate_min, t.completed_at, t.description],
            )?;
        }
        for s in sessions {
            tx.execute(
                "INSERT INTO sessions(id,task_id,start,end) VALUES(?1,?2,?3,?4)",
                params![s.id, s.task_id, s.start, s.end],
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

    pub fn get_run(&self) -> RunState {
        self.get_meta("run")
            .and_then(|v| serde_json::from_str(&v).ok())
            .unwrap_or_default()
    }

    pub fn set_run(&self, r: &RunState) -> rusqlite::Result<()> {
        self.set_meta("run", &serde_json::to_string(r).unwrap_or_default())
    }

    // ---- Snapshot ----
    pub fn snapshot(&self) -> rusqlite::Result<Snapshot> {
        Ok(Snapshot {
            lists: self.lists()?,
            tasks: self.tasks()?,
            sessions: self.sessions()?,
            config: self.get_config(),
            run: self.get_run(),
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

        let t1 = self.add_task(&deep.id, "Write Q3 strategy doc")?;
        self.set_depth(&t1.id, Some("deep"))?;
        let t2 = self.add_task(&deep.id, "Code review: player module")?;
        self.set_depth(&t2.id, Some("deep"))?;
        self.add_task(&deep.id, "Design data model")?;
        let t4 = self.add_task(&admin.id, "Expense report")?;
        self.set_depth(&t4.id, Some("shallow"))?;
        self.add_task(&admin.id, "Inbox zero")?;

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
        let t = db.add_task(&l.id, "Task A").unwrap();
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
        let t = db.add_task(&l.id, "T").unwrap();

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
        let t = db.add_task(&l.id, "T").unwrap();
        db.add_session(&SessionLog { task_id: t.id.clone(), start: 0, end: 100 }).unwrap();
        db.delete_list(&l.id).unwrap();
        assert_eq!(db.lists().unwrap().len(), 0);
        assert_eq!(db.tasks().unwrap().len(), 0);
        assert_eq!(db.sessions().unwrap().len(), 0);
    }
}
