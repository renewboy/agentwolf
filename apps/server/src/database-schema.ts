import type Database from 'better-sqlite3'

export function migrateDatabase(database: Database.Database): void {
  const version = database.pragma('user_version', { simple: true }) as number
  if (version > 8) throw new Error(`Database schema ${version} is newer than this server`)
  if (version === 0) {
    database.exec(`
      CREATE TABLE agent_tools (
        id TEXT PRIMARY KEY,
        json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE agent_profiles (
        id TEXT PRIMARY KEY,
        tool_id TEXT NOT NULL,
        json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        sort_order INTEGER NOT NULL
      );
      CREATE INDEX agent_profiles_tool_id ON agent_profiles(tool_id);
      CREATE INDEX agent_profiles_sort_order ON agent_profiles(sort_order);
      CREATE TABLE custom_boards (
        id TEXT PRIMARY KEY,
        json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE global_settings (
        id TEXT PRIMARY KEY CHECK (id = 'global'),
        json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      ${characterTables()}
      CREATE TABLE matches (
        id TEXT PRIMARY KEY,
        board_id TEXT NOT NULL,
        board_snapshot_json TEXT,
        status TEXT NOT NULL,
        setup_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        paused_reason TEXT
      );
      CREATE TABLE match_events (
        match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL,
        json TEXT NOT NULL,
        PRIMARY KEY(match_id, sequence)
      );
      CREATE TABLE delivery_ledgers (
        match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
        player_id TEXT NOT NULL,
        json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(match_id, player_id)
      );
      ${playerSessionTables()}
      ${trajectoryTables()}
      ${postgameReviewTables()}
      PRAGMA user_version = 8;
    `)
  }
  if (version === 1) {
    database.exec(`
      ALTER TABLE matches ADD COLUMN board_snapshot_json TEXT;
      CREATE TABLE custom_boards (
        id TEXT PRIMARY KEY,
        json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE global_settings (
        id TEXT PRIMARY KEY CHECK (id = 'global'),
        json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      ${trajectoryTables()}
      PRAGMA user_version = 3;
    `)
  }
  if (version === 2) {
    database.exec(`
      CREATE TABLE global_settings (
        id TEXT PRIMARY KEY CHECK (id = 'global'),
        json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      PRAGMA user_version = 3;
    `)
  }
  if (version >= 1 && version <= 3) {
    database.exec(`
      ALTER TABLE agent_profiles ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
      WITH ranked_profiles AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY updated_at DESC, id ASC) - 1 AS position
        FROM agent_profiles
      )
      UPDATE agent_profiles
      SET sort_order = (
        SELECT position FROM ranked_profiles WHERE ranked_profiles.id = agent_profiles.id
      );
      CREATE INDEX agent_profiles_sort_order ON agent_profiles(sort_order);
      PRAGMA user_version = 4;
    `)
  }
  if (version >= 1 && version <= 5) {
    const trajectoryRecords = database
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'trajectory_records'")
      .get()
    if (trajectoryRecords) {
      database.exec(
        'CREATE INDEX IF NOT EXISTS trajectory_records_turn ON trajectory_records(match_id, turn_id, ordinal)',
      )
    }
    database.exec(characterTables())
    database.pragma('user_version = 6')
  }
  const migratedVersion = database.pragma('user_version', { simple: true }) as number
  if (migratedVersion === 6) {
    database.exec(playerSessionTables())
    database.pragma('user_version = 7')
  }
  const sessionSchemaVersion = database.pragma('user_version', { simple: true }) as number
  if (sessionSchemaVersion === 7) {
    const trajectoryTurnColumns = database
      .prepare("SELECT name FROM pragma_table_info('trajectory_turns')")
      .all() as Array<{ name: string }>
    if (trajectoryTurnColumns.some((column) => column.name === 'json')) {
      database.exec(`
        UPDATE trajectory_turns
        SET json = json_remove(json, '$.promptVersion')
        WHERE json_type(json, '$.promptVersion') IS NOT NULL;
      `)
    }
    database.pragma('user_version = 8')
  }
}

function playerSessionTables(): string {
  return `
    CREATE TABLE IF NOT EXISTS player_session_bindings (
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL,
      json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(match_id, player_id)
    );
  `
}

function characterTables(): string {
  return `
    CREATE TABLE IF NOT EXISTS custom_characters (
      id TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS character_assets (
      id TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `
}

function trajectoryTables(): string {
  return `
    CREATE TABLE trajectory_revisions (
      match_id TEXT PRIMARY KEY REFERENCES matches(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL
    );
    CREATE TABLE trajectory_turns (
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      turn_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      ordinal INTEGER NOT NULL,
      revision INTEGER NOT NULL,
      json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(match_id, turn_id)
    );
    CREATE INDEX trajectory_turns_owner ON trajectory_turns(match_id, owner_id, ordinal);
    CREATE TABLE trajectory_records (
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      record_id TEXT NOT NULL,
      turn_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      ordinal INTEGER NOT NULL,
      revision INTEGER NOT NULL,
      json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(match_id, record_id),
      FOREIGN KEY(match_id, turn_id) REFERENCES trajectory_turns(match_id, turn_id) ON DELETE CASCADE
    );
    CREATE INDEX trajectory_records_owner ON trajectory_records(match_id, owner_id, ordinal);
    CREATE INDEX trajectory_records_turn ON trajectory_records(match_id, turn_id, ordinal);
  `
}

function postgameReviewTables(): string {
  return `
    CREATE TABLE IF NOT EXISTS postgame_reviews (
      match_id TEXT PRIMARY KEY REFERENCES matches(id) ON DELETE CASCADE,
      json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS postgame_review_submissions (
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      reviewer_id TEXT NOT NULL,
      json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(match_id, reviewer_id)
    );
    CREATE TABLE IF NOT EXISTS postgame_review_reflections (
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL,
      ordinal INTEGER NOT NULL,
      json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(match_id, player_id),
      UNIQUE(match_id, ordinal)
    );
    CREATE TABLE IF NOT EXISTS postgame_review_turns (
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(match_id, player_id, kind)
    );
  `
}
