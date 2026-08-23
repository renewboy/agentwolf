import type Database from 'better-sqlite3'

export function migrateDatabase(database: Database.Database): void {
  const version = database.pragma('user_version', { simple: true }) as number
  if (version > 3) throw new Error(`Database schema ${version} is newer than this server`)
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
        updated_at TEXT NOT NULL
      );
      CREATE INDEX agent_profiles_tool_id ON agent_profiles(tool_id);
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
      ${trajectoryTables()}
      PRAGMA user_version = 3;
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
  `
}
