import {
  CreateMatchRequestSchema,
  type LiveClientMessage,
  MatchIdSchema,
  SpectatorViewSchema,
  playerIdForSeat,
  type BoardSummary,
  type CreateMatchRequest,
  type MatchId,
  type MatchView,
  type SpectatorView,
} from '@agentwolf/contracts'
import {
  GameEngine,
  createV1RoleRegistry,
  getBoard,
  listBoards,
  replayGame,
  type GameState,
} from '@agentwolf/game-engine'
import type { AgentCatalogService } from './agent-catalog.js'
import { ActionMailbox } from './action-mailbox.js'
import type { ServerConfig } from './config.js'
import { createReadableId } from './ids.js'
import type { LiveConnection, LiveSubscriber } from './live-hub.js'
import { MatchRuntime } from './match-runtime.js'
import type { PlayerSessionFactory } from './player-runtime.js'

export class MatchNotFoundError extends Error {
  public constructor(id: MatchId) {
    super(`Unknown match ${id}`)
    this.name = 'MatchNotFoundError'
  }
}
import { projectBoard, projectMatch } from './projector.js'
import type { MatchRecord, SqliteRepository } from './repository.js'

export interface MatchManagerOptions {
  readonly repository: SqliteRepository
  readonly catalog: AgentCatalogService
  readonly config: ServerConfig
  readonly mailbox?: ActionMailbox
  readonly sessionFactory?: PlayerSessionFactory
}

export class MatchManager {
  readonly #options: MatchManagerOptions
  readonly #mailbox: ActionMailbox
  readonly #active = new Map<MatchId, MatchRuntime>()

  public constructor(options: MatchManagerOptions) {
    this.#options = options
    this.#mailbox = options.mailbox ?? new ActionMailbox()
    options.repository.markInterruptedMatchesPaused()
  }

  public get mailbox(): ActionMailbox {
    return this.#mailbox
  }

  public listBoards(): readonly BoardSummary[] {
    const roles = createV1RoleRegistry()
    return listBoards().map((board) => projectBoard(board, roles))
  }

  public createMatch(input: CreateMatchRequest): MatchView {
    const request = CreateMatchRequestSchema.parse(input)
    const board = getBoard(request.boardId)
    if (request.seats.length !== board.playerCount) {
      throw new Error(`Board ${board.id} requires ${board.playerCount} seats`)
    }
    const orderedSeats = [...request.seats].sort((left, right) => left.seat - right.seat)
    orderedSeats.forEach((seat, index) => {
      if (seat.seat !== index + 1) throw new Error('Seats must be numbered consecutively from 1')
      if (!this.#options.catalog.getProfile(seat.profileId)) {
        throw new Error(`Unknown Agent Profile ${seat.profileId}`)
      }
    })
    if (new Set(orderedSeats.map((seat) => seat.name)).size !== orderedSeats.length) {
      throw new Error('Player names must be unique inside a match')
    }
    const matchId = MatchIdSchema.parse(createReadableId('match', board.id))
    const roles = createV1RoleRegistry()
    const engine = GameEngine.create({
      matchId,
      board,
      players: orderedSeats.map((seat) => ({
        id: playerIdForSeat(seat.seat),
        seat: seat.seat,
        name: seat.name,
        profileId: seat.profileId,
        ...(seat.roleId ? { roleId: seat.roleId } : {}),
      })),
      roleAssignment: request.roleAssignment,
      seed: Number.parseInt(matchId.slice(-12), 16),
      roles,
    })
    const timestamp = new Date().toISOString()
    const record: MatchRecord = {
      id: matchId,
      boardId: board.id,
      status: 'draft',
      setup: request,
      createdAt: timestamp,
      updatedAt: timestamp,
      pausedReason: null,
    }
    this.#options.repository.createMatch(record, engine.events)
    const runtime = new MatchRuntime({
      record,
      engine,
      board,
      repository: this.#options.repository,
      catalog: this.#options.catalog,
      config: this.#options.config,
      mailbox: this.#mailbox,
      ...(this.#options.sessionFactory ? { sessionFactory: this.#options.sessionFactory } : {}),
    })
    this.#active.set(matchId, runtime)
    return runtime.project({ kind: 'god' })
  }

  public beginMatch(id: MatchId): MatchView {
    const runtime = this.#active.get(id)
    if (!runtime) throw new Error(`Match ${id} cannot start in this server process`)
    void runtime.start().catch(() => undefined)
    return runtime.project({ kind: 'god' })
  }

  public async resumeMatch(id: MatchId): Promise<MatchView> {
    let runtime = this.#active.get(id)
    if (!runtime) {
      const record = this.#options.repository.getMatch(id)
      if (!record) throw new MatchNotFoundError(id)
      const board = getBoard(record.boardId)
      const engine = GameEngine.restore({
        matchId: id,
        board,
        events: this.#options.repository.listMatchEvents(id),
        status: record.status,
        pausedReason: record.pausedReason,
      })
      runtime = new MatchRuntime({
        record,
        engine,
        board,
        repository: this.#options.repository,
        catalog: this.#options.catalog,
        config: this.#options.config,
        mailbox: this.#mailbox,
        ...(this.#options.sessionFactory ? { sessionFactory: this.#options.sessionFactory } : {}),
      })
      this.#active.set(id, runtime)
    }
    await runtime.resume()
    return runtime.project({ kind: 'god' })
  }

  public async deleteMatch(id: MatchId): Promise<void> {
    const runtime = this.#active.get(id)
    if (runtime) {
      await runtime.close()
      this.#active.delete(id)
    }
    if (!this.#options.repository.deleteMatch(id)) throw new MatchNotFoundError(id)
  }

  public getMatch(id: MatchId, view: SpectatorView): MatchView {
    const parsedView = SpectatorViewSchema.parse(view)
    const runtime = this.#active.get(id)
    if (runtime) return runtime.project(parsedView)
    const record = this.#options.repository.getMatch(id)
    if (!record) throw new MatchNotFoundError(id)
    const board = getBoard(record.boardId)
    const events = this.#options.repository.listMatchEvents(id)
    const replayed = replayGame(id, board, events)
    const state: GameState = {
      ...replayed,
      status: record.status,
      pausedReason: record.pausedReason,
    }
    return projectMatch({
      matchId: id,
      board,
      state,
      events,
      view: parsedView,
      roles: createV1RoleRegistry(),
    })
  }

  public listMatches(): MatchView[] {
    return this.#options.repository
      .listMatches()
      .map((record) => this.getMatch(record.id, { kind: 'closed-eye' }))
  }

  public connect(id: MatchId, subscriber: LiveSubscriber): LiveConnection {
    const runtime = this.#active.get(id)
    if (!runtime) {
      const sendSnapshot = (): void => {
        subscriber.send({
          type: 'snapshot',
          view: subscriber.view,
          data: this.getMatch(id, subscriber.view),
        })
      }
      sendSnapshot()
      subscriber.send({
        type: 'speech-playback.state',
        state: { enabled: false, controlledByThisClient: false, pendingSequence: null },
      })
      return {
        receive: (message: LiveClientMessage) => {
          if (message.type === 'view.set') {
            subscriber.view = message.view
            sendSnapshot()
            return
          }
          subscriber.send({
            type: 'error',
            code: 'invalid-live-message',
            message: `Live controls are unavailable for inactive match ${id}`,
          })
        },
        close: () => undefined,
      }
    }
    return runtime.connect(subscriber)
  }

  public subscribe(id: MatchId, subscriber: LiveSubscriber): () => void {
    const connection = this.connect(id, subscriber)
    return () => connection.close()
  }

  public async close(): Promise<void> {
    await Promise.allSettled([...this.#active.values()].map((runtime) => runtime.close()))
    this.#active.clear()
  }
}
