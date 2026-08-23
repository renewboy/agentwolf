import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import {
  AgentProfileSchema,
  AgentToolSchema,
  BoardIdSchema,
  CreateMatchRequestSchema,
  GameEventSchema,
  MatchIdSchema,
  type AgentProfile,
  type AgentProfileId,
  type AgentTool,
  type AgentToolId,
  type BoardId,
  type CreateMatchRequest,
  type GameEvent,
  type MatchId,
  type MatchStatus,
  type PlayerId,
} from '@agentwolf/contracts'
import type { DeliveryLedgerSnapshot } from '@agentwolf/acp'

export interface MatchRecord {
  readonly id: MatchId
  readonly boardId: BoardId
  readonly status: MatchStatus
  readonly setup: CreateMatchRequest
  readonly createdAt: string
  readonly updatedAt: string
  readonly pausedReason: string | null
}

interface DatabaseRow {
  readonly json: string
}

interface MatchRow {
  readonly id: string
  readonly board_id: string
  readonly status: MatchStatus
  readonly setup_json: string
  readonly created_at: string
  readonly updated_at: string
  readonly paused_reason: string | null
}

export class SqliteRepository {
  readonly #database: Database.Database

  public constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true })
    this.#database = new Database(path)
    this.#database.pragma('journal_mode = WAL')
    this.#database.pragma('foreign_keys = ON')
    this.#migrate()
  }

  public close(): void {
    this.#database.close()
  }

  public listCustomTools(): AgentTool[] {
    const rows = this.#database
      .prepare('SELECT json FROM agent_tools ORDER BY updated_at DESC')
      .all() as DatabaseRow[]
    return rows.map((row) => AgentToolSchema.parse(JSON.parse(row.json)))
  }

  public getCustomTool(id: AgentToolId): AgentTool | null {
    const row = this.#database.prepare('SELECT json FROM agent_tools WHERE id = ?').get(id) as
      | DatabaseRow
      | undefined
    return row ? AgentToolSchema.parse(JSON.parse(row.json)) : null
  }

  public saveCustomTool(tool: AgentTool): void {
    if (tool.builtIn) throw new Error('Built-in Agent Tools are read-only')
    const now = new Date().toISOString()
    this.#database
      .prepare(
        `INSERT INTO agent_tools (id, json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`,
      )
      .run(tool.id, JSON.stringify(AgentToolSchema.parse(tool)), now)
  }

  public deleteCustomTool(id: AgentToolId): boolean {
    return this.#database.prepare('DELETE FROM agent_tools WHERE id = ?').run(id).changes > 0
  }

  public listProfiles(): AgentProfile[] {
    const rows = this.#database
      .prepare('SELECT json FROM agent_profiles ORDER BY updated_at DESC')
      .all() as DatabaseRow[]
    return rows.map((row) => AgentProfileSchema.parse(JSON.parse(row.json)))
  }

  public getProfile(id: AgentProfileId): AgentProfile | null {
    const row = this.#database.prepare('SELECT json FROM agent_profiles WHERE id = ?').get(id) as
      | DatabaseRow
      | undefined
    return row ? AgentProfileSchema.parse(JSON.parse(row.json)) : null
  }

  public saveProfile(profile: AgentProfile): void {
    const parsed = AgentProfileSchema.parse(profile)
    this.#database
      .prepare(
        `INSERT INTO agent_profiles (id, tool_id, json, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           tool_id = excluded.tool_id,
           json = excluded.json,
           updated_at = excluded.updated_at`,
      )
      .run(parsed.id, parsed.toolId, JSON.stringify(parsed), parsed.updatedAt)
  }

  public deleteProfile(id: AgentProfileId): boolean {
    return this.#database.prepare('DELETE FROM agent_profiles WHERE id = ?').run(id).changes > 0
  }

  public createMatch(record: MatchRecord, initialEvents: readonly GameEvent[]): void {
    this.#database.transaction(() => {
      this.#database
        .prepare(
          `INSERT INTO matches
            (id, board_id, status, setup_json, created_at, updated_at, paused_reason)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          record.id,
          record.boardId,
          record.status,
          JSON.stringify(record.setup),
          record.createdAt,
          record.updatedAt,
          record.pausedReason,
        )
      this.#insertEvents(initialEvents)
    })()
  }

  public appendEvents(events: readonly GameEvent[]): void {
    if (events.length === 0) return
    this.#database.transaction(() => this.#insertEvents(events))()
  }

  public listMatchEvents(matchId: MatchId): GameEvent[] {
    const rows = this.#database
      .prepare('SELECT json FROM match_events WHERE match_id = ? ORDER BY sequence ASC')
      .all(matchId) as DatabaseRow[]
    return rows.map((row) => GameEventSchema.parse(JSON.parse(row.json)))
  }

  public getMatch(id: MatchId): MatchRecord | null {
    const row = this.#database.prepare('SELECT * FROM matches WHERE id = ?').get(id) as
      | MatchRow
      | undefined
    return row ? this.#matchRecord(row) : null
  }

  public listMatches(): MatchRecord[] {
    const rows = this.#database
      .prepare('SELECT * FROM matches ORDER BY created_at DESC')
      .all() as MatchRow[]
    return rows.map((row) => this.#matchRecord(row))
  }

  public deleteMatch(id: MatchId): boolean {
    return this.#database.prepare('DELETE FROM matches WHERE id = ?').run(id).changes > 0
  }

  public updateMatchStatus(
    id: MatchId,
    status: MatchStatus,
    pausedReason: string | null = null,
  ): void {
    this.#database
      .prepare('UPDATE matches SET status = ?, paused_reason = ?, updated_at = ? WHERE id = ?')
      .run(status, pausedReason, new Date().toISOString(), id)
  }

  public saveDeliveryLedger(
    matchId: MatchId,
    playerId: PlayerId,
    snapshot: DeliveryLedgerSnapshot,
  ): void {
    this.#database
      .prepare(
        `INSERT INTO delivery_ledgers (match_id, player_id, json, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(match_id, player_id) DO UPDATE SET
           json = excluded.json,
           updated_at = excluded.updated_at`,
      )
      .run(matchId, playerId, JSON.stringify(snapshot), new Date().toISOString())
  }

  public getDeliveryLedger(matchId: MatchId, playerId: PlayerId): DeliveryLedgerSnapshot | null {
    const row = this.#database
      .prepare('SELECT json FROM delivery_ledgers WHERE match_id = ? AND player_id = ?')
      .get(matchId, playerId) as DatabaseRow | undefined
    return row ? (JSON.parse(row.json) as DeliveryLedgerSnapshot) : null
  }

  public markInterruptedMatchesPaused(): number {
    return this.#database
      .prepare(
        `UPDATE matches
         SET status = 'paused', paused_reason = ?, updated_at = ?
         WHERE status IN ('starting', 'running')`,
      )
      .run('server-restarted-session-not-replayable', new Date().toISOString()).changes
  }

  #insertEvents(events: readonly GameEvent[]): void {
    const insert = this.#database.prepare(
      'INSERT INTO match_events (match_id, sequence, json) VALUES (?, ?, ?)',
    )
    for (const event of events) {
      const parsed = GameEventSchema.parse(event)
      insert.run(parsed.matchId, parsed.sequence, JSON.stringify(parsed))
    }
  }

  #matchRecord(row: MatchRow): MatchRecord {
    return {
      id: MatchIdSchema.parse(row.id),
      boardId: BoardIdSchema.parse(row.board_id),
      status: row.status,
      setup: CreateMatchRequestSchema.parse(JSON.parse(row.setup_json)),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      pausedReason: row.paused_reason,
    }
  }

  #migrate(): void {
    const version = this.#database.pragma('user_version', { simple: true }) as number
    if (version > 1) throw new Error(`Database schema ${version} is newer than this server`)
    if (version === 0) {
      this.#database.exec(`
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
    }
  }
}
