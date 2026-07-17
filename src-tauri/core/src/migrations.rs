//! Ordered, named schema migrations — replaces the old approach of piling
//! `let _ = conn.execute("ALTER TABLE ...")` calls into one function and
//! swallowing every error (including real ones, not just "column already
//! exists"). Each migration here runs at most once per database, tracked via
//! SQLite's built-in `PRAGMA user_version`.
//!
//! Every migration is written to be safe to re-run anyway (`CREATE TABLE IF
//! NOT EXISTS`, and a real "does this column exist" check before any `ALTER
//! TABLE ... ADD COLUMN` — SQLite has no `ADD COLUMN IF NOT EXISTS`). That's
//! deliberate defense in depth: databases created before this migration
//! system existed have no meaningful `user_version` yet (it defaults to 0),
//! so on their first run under this system every migration below executes
//! once — and needs to be a no-op for whatever part of the schema that
//! database already has.
//!
//! To add a new migration: add a new entry to `MIGRATIONS`, keep every
//! existing entry's position unchanged (the index+1 *is* its version
//! number), and write its `run` fn so it's harmless if already applied.

use rusqlite::{params, Connection};

pub struct Migration {
    pub name: &'static str,
    pub run: fn(&Connection) -> rusqlite::Result<()>,
}

fn has_column(conn: &Connection, table: &str, column: &str) -> rusqlite::Result<bool> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let name: String = row.get(1)?;
        if name == column {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Adds `column` to `table` only if it isn't already there.
fn add_column(conn: &Connection, table: &str, column: &str, decl: &str) -> rusqlite::Result<()> {
    if !has_column(conn, table, column)? {
        conn.execute(
            &format!("ALTER TABLE {table} ADD COLUMN {column} {decl}"),
            [],
        )?;
    }
    Ok(())
}

pub const MIGRATIONS: &[Migration] = &[
    Migration {
        name: "001_init",
        run: |conn| conn.execute_batch(include_str!("migrations/001_init.sql")),
    },
    Migration {
        name: "002_task_extras",
        // Covers databases from before `est`/`done`/`descr` existed at all
        // (001_init's CREATE TABLE already includes them for anything new).
        run: |conn| {
            add_column(conn, "tasks", "est", "INTEGER")?;
            add_column(conn, "tasks", "done", "INTEGER")?;
            add_column(conn, "tasks", "descr", "TEXT")
        },
    },
    Migration {
        name: "003_sync_columns",
        // `updated_at`/`deleted_at` power last-write-wins cross-device sync.
        // ALTER TABLE ADD COLUMN leaves existing rows NULL, not defaulted —
        // backfill so `updated_at` (non-nullable in the Rust model) never
        // fails to deserialize for a database that predates this migration.
        run: |conn| {
            add_column(conn, "lists", "updated_at", "INTEGER")?;
            add_column(conn, "lists", "deleted_at", "INTEGER")?;
            add_column(conn, "tasks", "updated_at", "INTEGER")?;
            add_column(conn, "tasks", "deleted_at", "INTEGER")?;
            add_column(conn, "sessions", "updated_at", "INTEGER")?;
            add_column(conn, "sessions", "deleted_at", "INTEGER")?;
            let now = crate::models::now_ms();
            conn.execute(
                "UPDATE lists SET updated_at=?1 WHERE updated_at IS NULL",
                params![now],
            )?;
            conn.execute(
                "UPDATE tasks SET updated_at=?1 WHERE updated_at IS NULL",
                params![now],
            )?;
            conn.execute(
                "UPDATE sessions SET updated_at=?1 WHERE updated_at IS NULL",
                params![now],
            )?;
            Ok(())
        },
    },
    Migration {
        name: "004_task_album",
        // Lets related tasks within one list share an "album", the way
        // songs by an artist group into albums.
        run: |conn| add_column(conn, "tasks", "album", "TEXT"),
    },
    Migration {
        name: "005_list_life_tag",
        // Powers the Home page's life-balance radar chart: each list can
        // optionally be tagged with a life area + whether it counts for or
        // against that area.
        run: |conn| {
            add_column(conn, "lists", "life_area", "TEXT")?;
            add_column(conn, "lists", "life_direction", "TEXT")
        },
    },
    Migration {
        name: "006_impact_and_task_areas",
        // Powers the gamification layer (jewels/vitality/mana/rank — see
        // utils.js on the frontend): a task can now carry its own weighted
        // split across the same 7 life areas a list can be tagged with
        // (`task_areas`, many-to-many, replacing the old "a task silently
        // inherits its list's single life_area" behavior — a gym session can
        // now count 70% toward health and 30% toward wellbeing instead of
        // only one or the other), plus a per-task "impact tier" that's
        // independent of how long the task takes (a 5-minute task can be
        // tagged `severe` while a 2-hour one is `low`).
        run: |conn| {
            add_column(conn, "tasks", "impact_tier", "TEXT")?;
            // 1 = positive/for the area, -1 = negative/against it. Defaults
            // to 1 (matches `default_impact_sign()` in models.rs) so every
            // task created before this migration reads as a plain positive
            // task rather than a null the frontend has to special-case.
            add_column(conn, "tasks", "impact_sign", "INTEGER")?;
            conn.execute(
                "UPDATE tasks SET impact_sign=1 WHERE impact_sign IS NULL",
                [],
            )?;
            conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS task_areas(
                   task_id TEXT NOT NULL,
                   area TEXT NOT NULL,
                   weight INTEGER NOT NULL,
                   PRIMARY KEY(task_id, area)
                 );
                 CREATE INDEX IF NOT EXISTS idx_task_areas_task ON task_areas(task_id);",
            )
        },
    },
    Migration {
        name: "007_drop_task_areas",
        // The weighted multi-area split from 006 turned out to be more
        // machinery than it was worth: distilled down, a task just needs a
        // single impact tier + for/against sign (kept, still on `tasks`),
        // and its life area comes from its list's existing single
        // `life_area` tag (kept, from 005) rather than a per-task weighted
        // split across all 7. `task_areas` is dropped outright rather than
        // just left unused, since nothing writes to it anymore.
        run: |conn| conn.execute_batch("DROP TABLE IF EXISTS task_areas;"),
    },
    Migration {
        name: "008_drop_severe_tier",
        // `severe` (weight 8) is retired as an impact tier — `high` (weight
        // 4) is now the top of the scale. Existing rows already tagged
        // `severe` are remapped to `high` rather than left as an
        // unrecognized string: IMPACT_TIERS on the frontend no longer has a
        // `severe` entry, so an untouched row would silently stop paying
        // out jewels and drop out of the life-balance radar the next time
        // this task completes — remapping keeps it counted as the (now)
        // top tier instead of quietly losing its weight.
        run: |conn| {
            conn.execute(
                "UPDATE tasks SET impact_tier='high' WHERE impact_tier='severe'",
                [],
            )?;
            Ok(())
        },
    },
    Migration {
        name: "009_task_deadline",
        // Powers the Home page's "Now" section (see
        // docs/homepage-now-spec.md): an optional per-task deadline,
        // independent of impact_tier/estimate_min. NULL = no deadline set,
        // same "weightless until tagged" convention as impact_tier.
        run: |conn| add_column(conn, "tasks", "deadline_at", "INTEGER"),
    },
    Migration {
        name: "010_merge_wellbeing_into_health",
        // "Mental Wellbeing" is folded into "Health & Fitness" as a single
        // "Health & Wellbeing" area (see LIFE_AREAS in utils.js). The `health`
        // key survives; lists tagged with the retired `wellbeing` key are
        // remapped to `health` rather than left as an unrecognized string —
        // same reasoning as 008's severe->high remap: an untouched row would
        // otherwise drop out of the sidebar's area grouping (into "Unsorted")
        // and out of the life-balance radar. Direction (for/against) is on the
        // list already and is unaffected.
        run: |conn| {
            conn.execute(
                "UPDATE lists SET life_area='health' WHERE life_area='wellbeing'",
                [],
            )?;
            Ok(())
        },
    },
    Migration {
        name: "011_task_cadence",
        // None = one-time (existing behavior, untouched). "daily" = repeating
        // — see the comment atop `Task::cadence` in models.rs for what that
        // changes. Independent of impact_tier/deadline_at, same
        // "weightless/inert until set" convention as every optional column
        // added since impact_tier's own migration.
        run: |conn| add_column(conn, "tasks", "cadence", "TEXT"),
    },
    Migration {
        name: "012_planner_fields",
        // Weekly schedules are stored as small JSON arrays on their owning
        // rows: list availability and fixed daily occurrences are edited and
        // synced as a unit. Session range is scalar task configuration.
        run: |conn| {
            add_column(
                conn,
                "lists",
                "availability_windows",
                "TEXT NOT NULL DEFAULT '[]'",
            )?;
            add_column(conn, "tasks", "daily_windows", "TEXT NOT NULL DEFAULT '[]'")?;
            add_column(conn, "tasks", "min_session_min", "INTEGER")?;
            add_column(conn, "tasks", "max_session_min", "INTEGER")
        },
    },
    Migration {
        name: "013_life_area_priorities",
        // Fixed life-area definitions remain in the app. This table stores
        // only the user's top-to-bottom planning precedence and its sync
        // timestamp. Unsorted is intentionally not part of the order.
        run: |conn| {
            conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS life_area_priorities(
                   area_key TEXT PRIMARY KEY,
                   priority_rank INTEGER NOT NULL,
                   updated_at INTEGER NOT NULL
                 );",
            )?;
            let now = crate::models::now_ms();
            for (rank, key) in [
                "career",
                "health",
                "relationships",
                "growth",
                "finance",
                "recreation",
            ]
            .iter()
            .enumerate()
            {
                conn.execute(
                    "INSERT OR IGNORE INTO life_area_priorities(area_key,priority_rank,updated_at) VALUES(?1,?2,?3)",
                    params![key, rank as i64 + 1, now],
                )?;
            }
            Ok(())
        },
    },
    Migration {
        name: "014_planner_sync_backfill",
        // Clients predating planner fields may already have advanced their
        // pull cursor after reading the same remote rows while ignoring
        // columns they did not understand. Mark one remote-first field
        // backfill so the upgraded client does not rely on those rows
        // becoming newer again. The sync layer clears this only on success.
        run: |conn| {
            conn.execute(
                "INSERT INTO meta(key,value) VALUES('sync_schema_backfill','planner_v1')
                 ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                [],
            )?;
            Ok(())
        },
    },
    Migration {
        name: "015_merge_growth_into_health",
        // Personal Growth is retired as a separate filing decision and folded
        // into Health & Wellbeing. Preserve every list and its direction while
        // moving the tag to a value supported by old and new clients. Bumping
        // updated_at makes the normalization sync outward instead of letting a
        // stale remote `growth` value immediately win it back. The priority row
        // has no meaning once the category is gone, so it is retired locally;
        // the remote table/value remain accepted during the support window.
        run: |conn| {
            let now = crate::models::now_ms();
            conn.execute(
                "UPDATE lists
                 SET life_area='health', color='#2f9e8f', updated_at=?1
                 WHERE life_area='growth'",
                params![now],
            )?;
            conn.execute(
                "DELETE FROM life_area_priorities WHERE area_key='growth'",
                [],
            )?;
            Ok(())
        },
    },
    Migration {
        name: "016_music_favorites",
        run: |conn| {
            conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS music_favorites(
                   track_id TEXT PRIMARY KEY,
                   title TEXT NOT NULL,
                   artist TEXT NOT NULL,
                   artwork_urls TEXT NOT NULL DEFAULT '[]',
                   permalink TEXT,
                   source_type TEXT NOT NULL,
                   updated_at INTEGER NOT NULL,
                   deleted_at INTEGER
                 );
                 CREATE INDEX IF NOT EXISTS idx_music_favorites_updated
                   ON music_favorites(updated_at);",
            )?;
            // An older client may have moved its pull cursor past favorites
            // created remotely by a newer device. Preserve a still-pending
            // planner backfill when upgrading several schema versions at once.
            conn.execute(
                "INSERT INTO meta(key,value) VALUES('sync_schema_backfill','music_favorites_v1')
                 ON CONFLICT(key) DO UPDATE SET value=CASE
                   WHEN value='planner_v1' THEN 'planner_music_v1'
                   ELSE 'music_favorites_v1'
                 END",
                [],
            )?;
            Ok(())
        },
    },
    Migration {
        name: "017_user_settings",
        run: |conn| {
            conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS user_settings(
                   id INTEGER PRIMARY KEY CHECK(id=1),
                   pause_for_other_audio INTEGER NOT NULL DEFAULT 1,
                   updated_at INTEGER NOT NULL DEFAULT 0
                 );
                 INSERT OR IGNORE INTO user_settings(id,pause_for_other_audio,updated_at)
                   VALUES(1,1,0);",
            )?;
            conn.execute(
                "INSERT INTO meta(key,value) VALUES('sync_schema_backfill','user_settings_v1')
                 ON CONFLICT(key) DO UPDATE SET value=CASE
                   WHEN value='planner_v1' THEN 'planner_user_settings_v1'
                   WHEN value='music_favorites_v1' THEN 'music_user_settings_v1'
                   WHEN value='planner_music_v1' THEN 'planner_music_user_settings_v1'
                   ELSE 'user_settings_v1'
                 END",
                [],
            )?;
            Ok(())
        },
    },
    Migration {
        name: "018_apple_music_takeover",
        run: |conn| {
            add_column(
                conn,
                "user_settings",
                "take_over_apple_music",
                "INTEGER NOT NULL DEFAULT 0",
            )?;
            conn.execute(
                "INSERT INTO meta(key,value) VALUES(
                   'sync_schema_backfill','apple_music_takeover_v1'
                 ) ON CONFLICT(key) DO UPDATE SET value=CASE
                   WHEN instr(value,'user_settings') > 0 THEN value
                   ELSE 'apple_music_takeover_v1'
                 END",
                [],
            )?;
            Ok(())
        },
    },
    Migration {
        name: "019_music_player_takeover",
        run: |conn| {
            add_column(
                conn,
                "user_settings",
                "take_over_music_players",
                "INTEGER NOT NULL DEFAULT 0",
            )?;
            conn.execute(
                "INSERT INTO meta(key,value) VALUES(
                   'sync_schema_backfill','music_player_takeover_v2'
                 ) ON CONFLICT(key) DO UPDATE SET value=CASE
                   WHEN instr(value,'user_settings') > 0 THEN value
                   ELSE 'music_player_takeover_v2'
                 END",
                [],
            )?;
            Ok(())
        },
    },
];

/// Runs every migration newer than the database's current `user_version`, in
/// order, bumping `user_version` after each one so it isn't re-attempted on
/// the next launch. Stops (and returns the error) at the first failure,
/// leaving `user_version` at the last successfully-applied migration.
pub fn run(conn: &Connection) -> rusqlite::Result<()> {
    let current: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    for (i, migration) in MIGRATIONS.iter().enumerate() {
        let version = (i + 1) as i64;
        if version <= current {
            continue;
        }
        (migration.run)(conn).map_err(|e| {
            eprintln!("migration {} ({}) failed: {e}", version, migration.name);
            e
        })?;
        conn.execute_batch(&format!("PRAGMA user_version = {version};"))?;
    }
    Ok(())
}

#[cfg(test)]
mod compatibility_tests {
    use super::*;

    fn user_version(conn: &Connection) -> i64 {
        conn.query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap()
    }

    #[test]
    fn upgrades_a_version_one_database_without_losing_user_data() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE lists(
               id TEXT PRIMARY KEY,
               name TEXT NOT NULL,
               emoji TEXT,
               color TEXT,
               ord INTEGER
             );
             CREATE TABLE tasks(
               id TEXT PRIMARY KEY,
               list_id TEXT NOT NULL,
               name TEXT NOT NULL,
               depth TEXT,
               ord INTEGER,
               est INTEGER,
               done INTEGER,
               descr TEXT
             );
             CREATE TABLE sessions(
               id TEXT PRIMARY KEY,
               task_id TEXT NOT NULL,
               start INTEGER NOT NULL,
               end INTEGER
             );
             CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
             INSERT INTO lists(id,name,emoji,color,ord)
               VALUES('list-old','Old list','📦','#123456',1);
             INSERT INTO tasks(id,list_id,name,depth,ord,est,done,descr)
               VALUES('task-old','list-old','Old task','deep',1,30,NULL,'Keep me');
             INSERT INTO sessions(id,task_id,start,end)
               VALUES('session-old','task-old',1000,2000);
             PRAGMA user_version = 1;",
        )
        .unwrap();

        run(&conn).unwrap();

        assert_eq!(user_version(&conn), MIGRATIONS.len() as i64);
        assert_eq!(
            conn.query_row("SELECT name FROM lists WHERE id='list-old'", [], |row| {
                row.get::<_, String>(0)
            })
            .unwrap(),
            "Old list"
        );
        assert_eq!(
            conn.query_row("SELECT descr FROM tasks WHERE id='task-old'", [], |row| row
                .get::<_, String>(0))
                .unwrap(),
            "Keep me"
        );
        assert_eq!(
            conn.query_row(
                "SELECT end FROM sessions WHERE id='session-old'",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            2000
        );
        assert!(has_column(&conn, "tasks", "daily_windows").unwrap());
        assert!(has_column(&conn, "lists", "availability_windows").unwrap());
        assert_eq!(
            conn.query_row(
                "SELECT value FROM meta WHERE key='sync_schema_backfill'",
                [],
                |row| row.get::<_, String>(0)
            )
            .unwrap(),
            "planner_music_user_settings_v1"
        );
    }

    #[test]
    fn running_current_migrations_again_is_a_no_op() {
        let conn = Connection::open_in_memory().unwrap();

        run(&conn).unwrap();
        let version = user_version(&conn);
        run(&conn).unwrap();

        assert_eq!(version, MIGRATIONS.len() as i64);
        assert_eq!(user_version(&conn), version);
    }

    #[test]
    fn folds_personal_growth_lists_into_health_without_losing_the_list() {
        let conn = Connection::open_in_memory().unwrap();
        run(&conn).unwrap();
        conn.execute(
            "INSERT INTO lists(id,name,emoji,color,ord,updated_at,life_area,life_direction)
             VALUES('growth-list','Read','📚','#8d67ab',0,1,'growth','increase')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO life_area_priorities(area_key,priority_rank,updated_at)
             VALUES('growth',4,1)",
            [],
        )
        .unwrap();
        conn.execute_batch("PRAGMA user_version = 14;").unwrap();

        run(&conn).unwrap();

        let (area, color, direction): (String, String, String) = conn
            .query_row(
                "SELECT life_area,color,life_direction FROM lists WHERE id='growth-list'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(area, "health");
        assert_eq!(color, "#2f9e8f");
        assert_eq!(direction, "increase");
        assert_eq!(
            conn.query_row(
                "SELECT COUNT(*) FROM life_area_priorities WHERE area_key='growth'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .unwrap(),
            0
        );
    }
}
