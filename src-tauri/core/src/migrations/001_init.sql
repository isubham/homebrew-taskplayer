-- Initial schema. Safe to run against an existing database (every statement
-- is IF NOT EXISTS), so this always runs first regardless of whether the
-- database is brand new or predates this migration system.
CREATE TABLE IF NOT EXISTS lists(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT,
  color TEXT,
  ord INTEGER
);

CREATE TABLE IF NOT EXISTS tasks(
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  name TEXT NOT NULL,
  depth TEXT,
  ord INTEGER,
  est INTEGER,
  done INTEGER,
  descr TEXT
);

CREATE TABLE IF NOT EXISTS sessions(
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  start INTEGER NOT NULL,
  end INTEGER
);

CREATE INDEX IF NOT EXISTS idx_tasks_list ON tasks(list_id);
CREATE INDEX IF NOT EXISTS idx_sessions_task ON sessions(task_id);

CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
