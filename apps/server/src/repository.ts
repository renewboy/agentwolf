import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import {
  AgentProfileSchema,
  AgentToolSchema,
  BoardIdSchema,
  CustomBoardSchema,
  GameEventSchema,
  GlobalSettingsSchema,
  MatchArchiveSchema,
  MatchBoardSnapshotSchema,
  MatchIdSchema,
  MatchSetupSnapshotSchema,
  TrajectoryRecordSchema,
  TrajectoryTurnSchema,
  type AgentProfile,
  type AgentProfileId,
  type AgentTool,
  type AgentToolId,
  type BoardId,
  type CustomBoard,
  type GameEvent,
  type GlobalSettings,
  type MatchId,
  type MatchArchive,
  type MatchBoardSnapshot,
  type MatchStatus,
  type PlayerId,
  type TrajectoryOwnerId,
  type TrajectoryRecord,
  type TrajectoryTurn,
} from '@agentwolf/contracts'
import type { DeliveryLedgerSnapshot } from '@agentwolf/acp'
import { migrateDatabase } from './database-schema.js'
import { CharacterSqliteRepository } from './character-repository.js'
import type { MatchRecord } from './match-record.js'
import { PlayerSessionSqliteRepository } from './player-session-repository.js'
import { PostgameReviewSqliteRepository } from './postgame-review-repository.js'
export type { MatchRecord } from './match-record.js'

interface DatabaseRow {
  readonly json: string
}

interface MatchRow {
  readonly id: string
  readonly board_id: string
  readonly status: MatchStatus
  readonly setup_json: string
  readonly board_snapshot_json: string | null
  readonly created_at: string
  readonly updated_at: string
  readonly paused_reason: string | null
}

interface TrajectoryRow extends DatabaseRow {
  readonly ordinal: number
  readonly revision: number
}

export class SqliteRepository {
  readonly #database: Database.Database
  public readonly characters: CharacterSqliteRepository
  public readonly playerSessions: PlayerSessionSqliteRepository
  public readonly postgameReviews: PostgameReviewSqliteRepository

  public constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true })
    this.#database = new Database(path)
    this.#database.pragma('journal_mode = WAL')
    this.#database.pragma('foreign_keys = ON')
    migrateDatabase(this.#database)
    this.characters = new CharacterSqliteRepository(this.#database)
    this.playerSessions = new PlayerSessionSqliteRepository(this.#database)
    this.postgameReviews = new PostgameReviewSqliteRepository(this.#database)
  }

  public close(): void {
    this.#database.close()
  }

  public getGlobalSettings(): GlobalSettings {
    const row = this.#database
      .prepare("SELECT json FROM global_settings WHERE id = 'global'")
      .get() as DatabaseRow | undefined
    return row ? GlobalSettingsSchema.parse(JSON.parse(row.json)) : GlobalSettingsSchema.parse({})
  }

  public saveGlobalSettings(settings: GlobalSettings): GlobalSettings {
    const parsed = GlobalSettingsSchema.parse(settings)
    this.#database
      .prepare(
        `INSERT INTO global_settings (id, json, updated_at)
         VALUES ('global', ?, ?)
         ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`,
      )
      .run(JSON.stringify(parsed), new Date().toISOString())
    return parsed
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

  public listCustomBoards(): CustomBoard[] {
    const rows = this.#database
      .prepare('SELECT json FROM custom_boards ORDER BY updated_at DESC')
      .all() as DatabaseRow[]
    return rows.map((row) => CustomBoardSchema.parse(JSON.parse(row.json)))
  }

  public getCustomBoard(id: BoardId): CustomBoard | null {
    const row = this.#database.prepare('SELECT json FROM custom_boards WHERE id = ?').get(id) as
      | DatabaseRow
      | undefined
    return row ? CustomBoardSchema.parse(JSON.parse(row.json)) : null
  }

  public saveCustomBoard(board: CustomBoard): void {
    const parsed = CustomBoardSchema.parse(board)
    this.#database
      .prepare(
        `INSERT INTO custom_boards (id, json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`,
      )
      .run(parsed.id, JSON.stringify(parsed), parsed.updatedAt)
  }

  public deleteCustomBoard(id: BoardId): boolean {
    return this.#database.prepare('DELETE FROM custom_boards WHERE id = ?').run(id).changes > 0
  }

  public listProfiles(): AgentProfile[] {
    const rows = this.#database
      .prepare('SELECT json FROM agent_profiles ORDER BY sort_order ASC, id ASC')
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
        `INSERT INTO agent_profiles (id, tool_id, json, updated_at, sort_order)
         VALUES (
           ?,
           ?,
           ?,
           ?,
           (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM agent_profiles)
         )
         ON CONFLICT(id) DO UPDATE SET
           tool_id = excluded.tool_id,
           json = excluded.json,
           updated_at = excluded.updated_at`,
      )
      .run(parsed.id, parsed.toolId, JSON.stringify(parsed), parsed.updatedAt)
  }

  public reorderProfiles(profileIds: readonly AgentProfileId[]): void {
    const update = this.#database.prepare('UPDATE agent_profiles SET sort_order = ? WHERE id = ?')
    this.#database.transaction(() => {
      for (const [sortOrder, profileId] of profileIds.entries()) {
        if (update.run(sortOrder, profileId).changes !== 1) {
          throw new Error(`Unknown Agent Profile ${profileId}`)
        }
      }
    })()
  }

  public deleteProfile(id: AgentProfileId): boolean {
    return this.#database.prepare('DELETE FROM agent_profiles WHERE id = ?').run(id).changes > 0
  }

  public createMatch(record: MatchRecord, initialEvents: readonly GameEvent[]): void {
    this.#database.transaction(() => {
      this.#database
        .prepare(
          `INSERT INTO matches
            (id, board_id, board_snapshot_json, status, setup_json, created_at, updated_at, paused_reason)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          record.id,
          record.boardId,
          record.boardSnapshot ? JSON.stringify(record.boardSnapshot) : null,
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

  public getMatchArchive(matchId: MatchId): MatchArchive | null {
    const row = this.#database
      .prepare('SELECT json FROM match_archives WHERE match_id = ?')
      .get(matchId) as DatabaseRow | undefined
    return row ? MatchArchiveSchema.parse(JSON.parse(row.json)) : null
  }

  public saveMatchArchive(archive: MatchArchive): MatchArchive {
    const parsed = MatchArchiveSchema.parse(archive)
    const existing = this.getMatchArchive(parsed.matchId)
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(parsed)) {
        throw new Error(`Match archive ${parsed.matchId} is immutable`)
      }
      return existing
    }
    this.#database
      .prepare('INSERT INTO match_archives (match_id, json, archived_at) VALUES (?, ?, ?)')
      .run(parsed.matchId, JSON.stringify(parsed), parsed.archivedAt)
    return parsed
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

  public updateMatchBoardSnapshot(id: MatchId, snapshot: MatchBoardSnapshot): void {
    const parsed = MatchBoardSnapshotSchema.parse(snapshot)
    this.#database
      .prepare('UPDATE matches SET board_snapshot_json = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(parsed), new Date().toISOString(), id)
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

  public nextTrajectoryTurnOrdinal(matchId: MatchId, ownerId: TrajectoryOwnerId): number {
    const row = this.#database
      .prepare(
        'SELECT COALESCE(MAX(ordinal), 0) AS ordinal FROM trajectory_turns WHERE match_id = ? AND owner_id = ?',
      )
      .get(matchId, ownerId) as { ordinal: number }
    return row.ordinal + 1
  }

  public nextTrajectoryRecordOrdinal(matchId: MatchId, ownerId: TrajectoryOwnerId): number {
    const row = this.#database
      .prepare(
        'SELECT COALESCE(MAX(ordinal), 0) AS ordinal FROM trajectory_records WHERE match_id = ? AND owner_id = ?',
      )
      .get(matchId, ownerId) as { ordinal: number }
    return row.ordinal + 1
  }

  public maxTrajectorySessionGeneration(matchId: MatchId, ownerId: TrajectoryOwnerId): number {
    return this.listTrajectoryTurns(matchId, ownerId).reduce(
      (maximum, turn) => Math.max(maximum, turn.sessionGeneration),
      0,
    )
  }

  public saveTrajectoryTurn(turn: TrajectoryTurn): TrajectoryTurn {
    const revision = this.#nextTrajectoryRevision(turn.matchId)
    const parsed = TrajectoryTurnSchema.parse({ ...turn, revision })
    this.#database
      .prepare(
        `INSERT INTO trajectory_turns
          (match_id, turn_id, owner_id, ordinal, revision, json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(match_id, turn_id) DO UPDATE SET
           owner_id = excluded.owner_id,
           ordinal = excluded.ordinal,
           revision = excluded.revision,
           json = excluded.json,
           updated_at = excluded.updated_at`,
      )
      .run(
        parsed.matchId,
        parsed.turnId,
        parsed.ownerId,
        parsed.ordinal,
        parsed.revision,
        JSON.stringify(parsed),
        new Date().toISOString(),
      )
    return parsed
  }

  public saveTrajectoryRecord(record: TrajectoryRecord): TrajectoryRecord {
    const revision = this.#nextTrajectoryRevision(record.matchId)
    const parsed = TrajectoryRecordSchema.parse({ ...record, revision })
    this.#database
      .prepare(
        `INSERT INTO trajectory_records
          (match_id, record_id, turn_id, owner_id, ordinal, revision, json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(match_id, record_id) DO UPDATE SET
           turn_id = excluded.turn_id,
           owner_id = excluded.owner_id,
           ordinal = excluded.ordinal,
           revision = excluded.revision,
           json = excluded.json,
           updated_at = excluded.updated_at`,
      )
      .run(
        parsed.matchId,
        parsed.recordId,
        parsed.turnId,
        parsed.ownerId,
        parsed.ordinal,
        parsed.revision,
        JSON.stringify(parsed),
        new Date().toISOString(),
      )
    return parsed
  }

  public trajectoryRevision(matchId: MatchId): number {
    const row = this.#database
      .prepare('SELECT revision FROM trajectory_revisions WHERE match_id = ?')
      .get(matchId) as { revision: number } | undefined
    return row?.revision ?? 0
  }

  public listTrajectoryTurns(matchId: MatchId, ownerId?: TrajectoryOwnerId): TrajectoryTurn[] {
    const rows = (
      ownerId
        ? this.#database
            .prepare(
              'SELECT json, ordinal, revision FROM trajectory_turns WHERE match_id = ? AND owner_id = ? ORDER BY ordinal ASC',
            )
            .all(matchId, ownerId)
        : this.#database
            .prepare(
              'SELECT json, ordinal, revision FROM trajectory_turns WHERE match_id = ? ORDER BY owner_id ASC, ordinal ASC',
            )
            .all(matchId)
    ) as TrajectoryRow[]
    return rows.map((row) => TrajectoryTurnSchema.parse(JSON.parse(row.json)))
  }

  public listTrajectoryRecords(matchId: MatchId, ownerId?: TrajectoryOwnerId): TrajectoryRecord[] {
    const rows = (
      ownerId
        ? this.#database
            .prepare(
              'SELECT json, ordinal, revision FROM trajectory_records WHERE match_id = ? AND owner_id = ? ORDER BY ordinal ASC',
            )
            .all(matchId, ownerId)
        : this.#database
            .prepare(
              'SELECT json, ordinal, revision FROM trajectory_records WHERE match_id = ? ORDER BY owner_id ASC, ordinal ASC',
            )
            .all(matchId)
    ) as TrajectoryRow[]
    return rows.map((row) => TrajectoryRecordSchema.parse(JSON.parse(row.json)))
  }
  public listTrajectoryRecordsForTurns(matchId: MatchId, turnIds: readonly string[]) {
    if (turnIds.length === 0) return []
    const placeholders = turnIds.map(() => '?').join(', ')
    const rows = this.#database
      .prepare(
        `SELECT json, ordinal, revision FROM trajectory_records WHERE match_id = ? AND turn_id IN (${placeholders}) ORDER BY owner_id ASC, ordinal ASC`,
      )
      .all(matchId, ...turnIds) as TrajectoryRow[]
    return rows.map((row) => TrajectoryRecordSchema.parse(JSON.parse(row.json)))
  }

  public trajectoryChanges(
    matchId: MatchId,
    afterRevision: number,
  ): { turns: TrajectoryTurn[]; records: TrajectoryRecord[] } {
    const turns = this.#database
      .prepare(
        'SELECT json, ordinal, revision FROM trajectory_turns WHERE match_id = ? AND revision > ? ORDER BY revision ASC',
      )
      .all(matchId, afterRevision) as TrajectoryRow[]
    const records = this.#database
      .prepare(
        'SELECT json, ordinal, revision FROM trajectory_records WHERE match_id = ? AND revision > ? ORDER BY revision ASC',
      )
      .all(matchId, afterRevision) as TrajectoryRow[]
    return {
      turns: turns.map((row) => TrajectoryTurnSchema.parse(JSON.parse(row.json))),
      records: records.map((row) => TrajectoryRecordSchema.parse(JSON.parse(row.json))),
    }
  }

  public markInterruptedMatchesPaused(): number {
    return this.#database
      .prepare(
        `UPDATE matches
         SET status = 'paused', paused_reason = ?, updated_at = ?
         WHERE status IN ('starting', 'running')`,
      )
      .run('server-restarted-session-resume-required', new Date().toISOString()).changes
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

  #nextTrajectoryRevision(matchId: MatchId): number {
    const row = this.#database
      .prepare(
        `INSERT INTO trajectory_revisions (match_id, revision)
         VALUES (?, 1)
         ON CONFLICT(match_id) DO UPDATE SET revision = trajectory_revisions.revision + 1
         RETURNING revision`,
      )
      .get(matchId) as { revision: number }
    return row.revision
  }

  #matchRecord(row: MatchRow): MatchRecord {
    return {
      id: MatchIdSchema.parse(row.id),
      boardId: BoardIdSchema.parse(row.board_id),
      boardSnapshot: row.board_snapshot_json
        ? MatchBoardSnapshotSchema.parse(JSON.parse(row.board_snapshot_json))
        : null,
      status: row.status,
      setup: MatchSetupSnapshotSchema.parse(JSON.parse(row.setup_json)),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      pausedReason: row.paused_reason,
    }
  }
}
