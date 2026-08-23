import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { buildServer, type AgentWolfServer } from '../src/app.js'

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
      setup: { speechCharacterLimit: 300 },
    })
    expect(server.repository.getGlobalSettings()).toEqual({ speechCharacterLimit: 300 })
  })
})
