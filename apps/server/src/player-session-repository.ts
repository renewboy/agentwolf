import type Database from 'better-sqlite3'
import type { MatchId, PlayerAction, PlayerId } from '@agentwolf/contracts'
import {
  PlayerSessionBindingSchema,
  createPlayerSessionBinding,
  withActivePlayerSession,
  withBootstrapState,
  withPendingPlayerAction,
  withoutPendingPlayerAction,
  type PlayerSessionBinding,
  type ReservePlayerSessionBindingInput,
} from './player-session-binding.js'

interface DatabaseRow {
  readonly json: string
}

export class PlayerSessionSqliteRepository {
  readonly #database: Database.Database

  public constructor(database: Database.Database) {
    this.#database = database
  }

  public reserve(input: ReservePlayerSessionBindingInput): PlayerSessionBinding {
    const binding = createPlayerSessionBinding(input)
    try {
      this.#database
        .prepare(
          `INSERT INTO player_session_bindings (match_id, player_id, json, updated_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run(binding.matchId, binding.playerId, JSON.stringify(binding), binding.updatedAt)
    } catch (error) {
      if (this.get(binding.matchId, binding.playerId)) {
        throw new Error(
          `Player Session binding already exists for ${binding.matchId}/${binding.playerId}`,
          { cause: error },
        )
      }
      throw error
    }
    return binding
  }

  public activate(matchId: MatchId, playerId: PlayerId, sessionId: string): PlayerSessionBinding {
    return this.#save(withActivePlayerSession(this.#require(matchId, playerId), sessionId))
  }

  public adopt(
    input: ReservePlayerSessionBindingInput & { readonly sessionId: string },
  ): PlayerSessionBinding {
    this.reserve(input)
    return this.activate(input.matchId, input.playerId, input.sessionId)
  }

  public get(matchId: MatchId, playerId: PlayerId): PlayerSessionBinding | null {
    const row = this.#database
      .prepare('SELECT json FROM player_session_bindings WHERE match_id = ? AND player_id = ?')
      .get(matchId, playerId) as DatabaseRow | undefined
    return row ? PlayerSessionBindingSchema.parse(JSON.parse(row.json)) : null
  }

  public list(matchId: MatchId): PlayerSessionBinding[] {
    const rows = this.#database
      .prepare('SELECT json FROM player_session_bindings WHERE match_id = ? ORDER BY player_id ASC')
      .all(matchId) as DatabaseRow[]
    return rows.map((row) => PlayerSessionBindingSchema.parse(JSON.parse(row.json)))
  }

  public markBootstrap(
    matchId: MatchId,
    playerId: PlayerId,
    state: PlayerSessionBinding['bootstrapState'],
  ): PlayerSessionBinding {
    const binding = this.#require(matchId, playerId)
    const ranks = { pending: 0, dispatched: 1, acknowledged: 2 } as const
    if (ranks[state] < ranks[binding.bootstrapState]) {
      throw new Error(
        `Player Session bootstrap cannot move from ${binding.bootstrapState} to ${state}`,
      )
    }
    return this.#save(withBootstrapState(binding, state))
  }

  public savePendingAction(
    matchId: MatchId,
    playerId: PlayerId,
    deliveryId: string,
    action: PlayerAction,
  ): PlayerSessionBinding {
    return this.#save(withPendingPlayerAction(this.#require(matchId, playerId), deliveryId, action))
  }

  public clearPendingAction(matchId: MatchId, playerId: PlayerId): PlayerSessionBinding {
    const binding = this.#require(matchId, playerId)
    return binding.pendingAction ? this.#save(withoutPendingPlayerAction(binding)) : binding
  }

  #require(matchId: MatchId, playerId: PlayerId): PlayerSessionBinding {
    const binding = this.get(matchId, playerId)
    if (!binding) throw new Error(`Missing Player Session binding for ${matchId}/${playerId}`)
    return binding
  }

  #save(binding: PlayerSessionBinding): PlayerSessionBinding {
    const parsed = PlayerSessionBindingSchema.parse(binding)
    const result = this.#database
      .prepare(
        `UPDATE player_session_bindings
         SET json = ?, updated_at = ?
         WHERE match_id = ? AND player_id = ?`,
      )
      .run(JSON.stringify(parsed), parsed.updatedAt, parsed.matchId, parsed.playerId)
    if (result.changes !== 1) {
      throw new Error(`Missing Player Session binding for ${parsed.matchId}/${parsed.playerId}`)
    }
    return parsed
  }
}
