import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { AgentProfileSchema } from '@agentwolf/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { buildServer, type AgentWolfServer } from '../src/app.js'
import { migrateDatabase } from '../src/database-schema.js'
import { SqliteRepository } from '../src/repository.js'

const roots: string[] = []
const servers: AgentWolfServer[] = []

afterEach(async () => {
  await Promise.allSettled(servers.splice(0).map((server) => server.close()))
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('database migration', () => {
  it('upgrades schema one and backfills immutable board snapshots without changing matches', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-migration-'))
    roots.push(root)
    const databasePath = resolve(root, 'agentwolf.sqlite')
    const legacy = new Database(databasePath)
    legacy.exec(`
      CREATE TABLE agent_tools (id TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE agent_profiles (id TEXT PRIMARY KEY, tool_id TEXT NOT NULL, json TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE matches (
        id TEXT PRIMARY KEY,
        board_id TEXT NOT NULL,
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
      PRAGMA user_version = 1;
    `)
    const setup = {
      boardId: 'board-quick-6',
      roleAssignment: 'random',
      seats: Array.from({ length: 6 }, (_, index) => ({
        seat: index + 1,
        name: `Legacy seat ${index + 1}`,
        profileId: 'profile-legacy-player',
      })),
    }
    legacy
      .prepare(
        `INSERT INTO matches
          (id, board_id, status, setup_json, created_at, updated_at, paused_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'match-legacy-preserved',
        'board-quick-6',
        'ended',
        JSON.stringify(setup),
        '2026-08-23T00:00:00.000Z',
        '2026-08-23T00:01:00.000Z',
        null,
      )
    legacy.close()

    const server = await buildServer({
      config: {
        host: '127.0.0.1',
        port: 4310,
        dataDirectory: root,
        databasePath,
        publicBaseUrl: 'http://127.0.0.1:4310',
        projectRoot: process.cwd(),
        webDistPath: resolve(root, 'missing'),
        developerMode: false,
      },
    })
    servers.push(server)
    expect(server.repository.getMatch('match-legacy-preserved')).toMatchObject({
      id: 'match-legacy-preserved',
      boardId: 'board-quick-6',
      status: 'ended',
      boardSnapshot: {
        id: 'board-quick-6',
        name: '6 人快速场',
        playerCount: 6,
      },
      setup: {
        speechCharacterLimit: 300,
        seats: expect.arrayContaining([expect.objectContaining({ character: null })]),
      },
    })
    expect(server.repository.getGlobalSettings()).toEqual({ speechCharacterLimit: 300 })
  })

  it('upgrades schema three with the current visible Agent Profile order', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-profile-order-migration-'))
    roots.push(root)
    const databasePath = resolve(root, 'agentwolf.sqlite')
    const legacy = new Database(databasePath)
    legacy.exec(`
      CREATE TABLE agent_profiles (
        id TEXT PRIMARY KEY,
        tool_id TEXT NOT NULL,
        json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      PRAGMA user_version = 3;
    `)
    const older = AgentProfileSchema.parse({
      id: 'profile-older-player',
      name: 'Older player',
      toolId: 'tool-trae-cli',
      model: 'older-model',
      promptTimeoutMs: 10_000,
      connection: {},
      createdAt: '2026-08-20T00:00:00.000Z',
      updatedAt: '2026-08-21T00:00:00.000Z',
    })
    const newer = AgentProfileSchema.parse({
      id: 'profile-newer-player',
      name: 'Newer player',
      toolId: 'tool-trae-cli',
      model: 'newer-model',
      promptTimeoutMs: 10_000,
      connection: {},
      createdAt: '2026-08-21T00:00:00.000Z',
      updatedAt: '2026-08-22T00:00:00.000Z',
    })
    const insert = legacy.prepare(
      'INSERT INTO agent_profiles (id, tool_id, json, updated_at) VALUES (?, ?, ?, ?)',
    )
    for (const profile of [older, newer]) {
      insert.run(profile.id, profile.toolId, JSON.stringify(profile), profile.updatedAt)
    }
    legacy.close()

    const repository = new SqliteRepository(databasePath)
    expect(repository.listProfiles().map(({ id }) => id)).toEqual([newer.id, older.id])
    repository.reorderProfiles([older.id, newer.id])
    repository.close()

    const reopened = new SqliteRepository(databasePath)
    expect(reopened.listProfiles().map(({ id }) => id)).toEqual([older.id, newer.id])
    reopened.close()
    const migrated = new Database(databasePath)
    expect(migrated.pragma('user_version', { simple: true })).toBe(8)
    expect(
      migrated
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('custom_characters', 'character_assets') ORDER BY name",
        )
        .all(),
    ).toEqual([{ name: 'character_assets' }, { name: 'custom_characters' }])
    migrated.close()
  })

  it('adds the trajectory Turn lookup index to schema four', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-trajectory-index-migration-'))
    roots.push(root)
    const databasePath = resolve(root, 'agentwolf.sqlite')
    const legacy = new Database(databasePath)
    legacy.exec(`
      CREATE TABLE matches (id TEXT PRIMARY KEY);
      CREATE TABLE trajectory_turns (
        match_id TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        PRIMARY KEY(match_id, turn_id)
      );
      CREATE TABLE trajectory_records (
        match_id TEXT NOT NULL,
        record_id TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        revision INTEGER NOT NULL,
        json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(match_id, record_id)
      );
      PRAGMA user_version = 4;
    `)
    legacy.close()

    const repository = new SqliteRepository(databasePath)
    repository.close()

    const migrated = new Database(databasePath)
    expect(migrated.pragma('user_version', { simple: true })).toBe(8)
    const indexes = migrated
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ?")
      .all('trajectory_records') as Array<{ name: string }>
    expect(indexes.map(({ name }) => name)).toContain('trajectory_records_turn')
    expect(
      migrated
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('custom_characters', 'character_assets') ORDER BY name",
        )
        .all(),
    ).toEqual([{ name: 'character_assets' }, { name: 'custom_characters' }])
    migrated.close()
  })

  it('converges both schema-five branches on Character tables and the trajectory index', async () => {
    for (const state of ['characters-only', 'trajectory-index-only'] as const) {
      const root = await mkdtemp(resolve(tmpdir(), `agentwolf-schema-five-${state}-`))
      roots.push(root)
      const databasePath = resolve(root, 'agentwolf.sqlite')
      const legacy = new Database(databasePath)
      legacy.exec(`
        CREATE TABLE trajectory_records (
          match_id TEXT NOT NULL,
          record_id TEXT NOT NULL,
          turn_id TEXT NOT NULL,
          owner_id TEXT NOT NULL,
          ordinal INTEGER NOT NULL,
          revision INTEGER NOT NULL,
          json TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY(match_id, record_id)
        );
        ${
          state === 'characters-only'
            ? `CREATE TABLE custom_characters (
                 id TEXT PRIMARY KEY,
                 json TEXT NOT NULL,
                 updated_at TEXT NOT NULL
               );
               CREATE TABLE character_assets (
                 id TEXT PRIMARY KEY,
                 json TEXT NOT NULL,
                 created_at TEXT NOT NULL
               );`
            : 'CREATE INDEX trajectory_records_turn ON trajectory_records(match_id, turn_id, ordinal);'
        }
        PRAGMA user_version = 5;
      `)
      legacy.close()

      const repository = new SqliteRepository(databasePath)
      repository.close()

      const migrated = new Database(databasePath)
      expect(migrated.pragma('user_version', { simple: true })).toBe(8)
      const tables = migrated
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('custom_characters', 'character_assets') ORDER BY name",
        )
        .all()
      expect(tables).toEqual([{ name: 'character_assets' }, { name: 'custom_characters' }])
      const indexes = migrated
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ?")
        .all('trajectory_records') as Array<{ name: string }>
      expect(indexes.map(({ name }) => name)).toContain('trajectory_records_turn')
      migrated.close()
    }
  })

  it('upgrades schema six with durable Player Session bindings', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-session-binding-migration-'))
    roots.push(root)
    const databasePath = resolve(root, 'agentwolf.sqlite')
    const legacy = new Database(databasePath)
    legacy.exec(`
      CREATE TABLE matches (id TEXT PRIMARY KEY);
      PRAGMA user_version = 6;
    `)
    legacy.close()

    const repository = new SqliteRepository(databasePath)
    repository.close()

    const migrated = new Database(databasePath)
    expect(migrated.pragma('user_version', { simple: true })).toBe(8)
    expect(
      migrated
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'player_session_bindings'",
        )
        .get(),
    ).toEqual({ name: 'player_session_bindings' })
    const foreignKeys = migrated.pragma('foreign_key_list(player_session_bindings)') as Array<{
      table: string
      on_delete: string
    }>
    expect(foreignKeys).toEqual(
      expect.arrayContaining([expect.objectContaining({ table: 'matches', on_delete: 'CASCADE' })]),
    )
    migrated.close()
  })

  it('removes legacy Prompt metadata without changing exact stored Prompt records', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-prompt-metadata-migration-'))
    roots.push(root)
    const databasePath = resolve(root, 'agentwolf.sqlite')
    const database = new Database(databasePath)
    database.exec(`
      CREATE TABLE trajectory_turns (
        match_id TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        json TEXT NOT NULL,
        PRIMARY KEY(match_id, turn_id)
      );
      CREATE TABLE trajectory_records (
        match_id TEXT NOT NULL,
        record_id TEXT NOT NULL,
        json TEXT NOT NULL,
        PRIMARY KEY(match_id, record_id)
      );
      PRAGMA user_version = 7;
    `)
    const promptRecordJson = JSON.stringify({
      kind: 'prompt',
      text: '原样保留的精确 Prompt。\n第二行也保持不变。',
    })
    database
      .prepare('INSERT INTO trajectory_turns (match_id, turn_id, json) VALUES (?, ?, ?)')
      .run(
        'match-prompt-metadata',
        'delivery-prompt-metadata',
        JSON.stringify({ status: 'completed', promptVersion: 20 }),
      )
    database
      .prepare('INSERT INTO trajectory_records (match_id, record_id, json) VALUES (?, ?, ?)')
      .run('match-prompt-metadata', 'prompt-record', promptRecordJson)

    migrateDatabase(database)
    const turn = database
      .prepare('SELECT json FROM trajectory_turns WHERE turn_id = ?')
      .get('delivery-prompt-metadata') as { json: string }
    const prompt = database
      .prepare('SELECT json FROM trajectory_records WHERE record_id = ?')
      .get('prompt-record') as { json: string }
    expect(database.pragma('user_version', { simple: true })).toBe(8)
    expect(JSON.parse(turn.json)).toEqual({ status: 'completed' })
    expect(prompt.json).toBe(promptRecordJson)
    database.close()
  })
})
