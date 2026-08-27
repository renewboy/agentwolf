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
import { GameEngine, replayGame, type GameState } from '@agentwolf/game-engine'
import type { AgentCatalogService } from './agent-catalog.js'
import { ActionMailbox } from './action-mailbox.js'
import type { BoardCatalogService } from './board-catalog.js'
import type { CharacterCatalogService } from './character-catalog.js'
import type { ServerConfig } from './config.js'
import { createReadableId } from './ids.js'
import type { LiveConnection, LiveSubscriber } from './live-hub.js'
import { MatchRuntime } from './match-runtime.js'
import type { PlayerSessionFactory } from './player-runtime.js'
import { removeMatchPlayerWorkspaces } from './player-workspace.js'
import type { TrajectoryService } from './trajectory-service.js'
import type { RulesetCatalog } from './ruleset-catalog.js'

export class MatchNotFoundError extends Error {
  public constructor(id: MatchId) {
    super(`Unknown match ${id}`)
    this.name = 'MatchNotFoundError'
  }
}
import { projectMatch } from './projector.js'
import type { MatchRecord, SqliteRepository } from './repository.js'

export interface MatchManagerOptions {
  readonly repository: SqliteRepository
  readonly catalog: AgentCatalogService
  readonly boards: BoardCatalogService
  readonly characters: CharacterCatalogService
  readonly trajectories: TrajectoryService
  readonly rulesets: RulesetCatalog
  readonly config: ServerConfig
  readonly mailbox?: ActionMailbox
  readonly sessionFactory?: PlayerSessionFactory
}

export class MatchManager {
  readonly #options: MatchManagerOptions
  readonly #mailbox: ActionMailbox
  readonly #active = new Map<MatchId, MatchRuntime>()
  readonly #inactiveConnections = new Map<MatchId, Set<PendingLiveConnection>>()

  public constructor(options: MatchManagerOptions) {
    this.#options = options
    this.#mailbox = options.mailbox ?? new ActionMailbox()
    options.repository.markInterruptedMatchesPaused()
  }

  public get mailbox(): ActionMailbox {
    return this.#mailbox
  }

  public listBoards(): readonly BoardSummary[] {
    return this.#options.boards.listBoards()
  }

  public createMatch(input: CreateMatchRequest): MatchView {
    const request = CreateMatchRequestSchema.parse(input)
    const resolvedBoard = this.#options.boards.resolve(request.boardId)
    const board = resolvedBoard.manifest
    if (request.seats.length !== board.playerCount) {
      throw new Error(`Board ${board.id} requires ${board.playerCount} seats`)
    }
    const orderedSeats = [...request.seats].sort((left, right) => left.seat - right.seat)
    orderedSeats.forEach((seat, index) => {
      if (seat.seat !== index + 1) throw new Error('Seats must be numbered consecutively from 1')
    })
    const boardAgentProfiles = new Map(
      resolvedBoard.summary.agentProfiles.map((slot) => [slot.seat, slot.profileId]),
    )
    const fallbackProfileId = this.#options.catalog.listProfiles()[0]?.id
    const resolvedSeats = orderedSeats.map((seat) => {
      const profileId =
        seat.profileId ?? boardAgentProfiles.get(seat.seat) ?? fallbackProfileId ?? null
      if (!profileId) throw new Error('Match creation requires at least one Agent Profile')
      if (!this.#options.catalog.getProfile(profileId)) {
        throw new Error(`Unknown Agent Profile ${profileId}`)
      }
      return { ...seat, profileId }
    })
    if (new Set(resolvedSeats.map((seat) => seat.name)).size !== resolvedSeats.length) {
      throw new Error('Player names must be unique inside a match')
    }
    const boardCharacters = new Map(
      resolvedBoard.summary.characters.map((slot) => [slot.seat, slot.characterId]),
    )
    const snapshotSeats = resolvedSeats.map((seat) => {
      const characterId =
        seat.characterId === undefined ? (boardCharacters.get(seat.seat) ?? null) : seat.characterId
      return {
        seat: seat.seat,
        name: seat.name,
        profileId: seat.profileId,
        ...(seat.roleId ? { roleId: seat.roleId } : {}),
        character: characterId ? this.#options.characters.snapshot(characterId) : null,
      }
    })
    const matchId = MatchIdSchema.parse(createReadableId('match', board.id))
    const ruleset = this.#options.rulesets.current()
    const engine = GameEngine.create({
      matchId,
      board,
      players: snapshotSeats.map((seat) => ({
        id: playerIdForSeat(seat.seat),
        seat: seat.seat,
        name: seat.name,
        profileId: seat.profileId,
        ...(seat.roleId ? { roleId: seat.roleId } : {}),
      })),
      roleAssignment: request.roleAssignment,
      seed: Number.parseInt(matchId.slice(-12), 16),
      ruleset,
    })
    const timestamp = new Date().toISOString()
    const settings = this.#options.repository.getGlobalSettings()
    const record: MatchRecord = {
      id: matchId,
      boardId: board.id,
      boardSnapshot: resolvedBoard.snapshot,
      status: 'draft',
      setup: {
        boardId: request.boardId,
        roleAssignment: request.roleAssignment,
        seats: snapshotSeats,
        speechCharacterLimit: settings.speechCharacterLimit,
      },
      createdAt: timestamp,
      updatedAt: timestamp,
      pausedReason: null,
    }
    this.#options.repository.createMatch(record, engine.events)
    const trajectory = this.#options.trajectories.recorder(matchId)
    trajectory.recordSystemEvents(engine.events)
    const runtime = new MatchRuntime({
      record,
      engine,
      board,
      boardSnapshot: resolvedBoard.snapshot,
      repository: this.#options.repository,
      catalog: this.#options.catalog,
      config: this.#options.config,
      mailbox: this.#mailbox,
      trajectory,
      ruleset,
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
      runtime = this.#restoreRuntime(record)
    }
    await runtime.resume()
    return runtime.project({ kind: 'god' })
  }

  public initializePostgameReviews(): void {
    for (const review of this.#options.repository.postgameReviews.listActive()) {
      const record = this.#options.repository.getMatch(review.matchId)
      if (!record || record.status !== 'ended') continue
      const runtime = this.#active.get(record.id) ?? this.#restoreRuntime(record)
      runtime.activatePostgameReview()
    }
  }

  public startPostgameReview(id: MatchId): MatchView {
    return this.#postgameRuntime(id).startPostgameReview()
  }

  public async skipPostgameReview(id: MatchId): Promise<MatchView> {
    return this.#postgameRuntime(id).skipPostgameReview()
  }

  public resumePostgameReview(id: MatchId): MatchView {
    return this.#postgameRuntime(id).resumePostgameReview()
  }

  public async deleteMatch(id: MatchId): Promise<void> {
    const runtime = this.#active.get(id)
    if (runtime) {
      await runtime.close()
      this.#active.delete(id)
    }
    for (const connection of this.#inactiveConnections.get(id) ?? []) connection.close()
    this.#inactiveConnections.delete(id)
    if (!this.#options.repository.deleteMatch(id)) throw new MatchNotFoundError(id)
    await removeMatchPlayerWorkspaces(this.#options.config.dataDirectory, id)
  }

  public getMatch(id: MatchId, view: SpectatorView): MatchView {
    const parsedView = SpectatorViewSchema.parse(view)
    const runtime = this.#active.get(id)
    if (runtime) return runtime.project(parsedView)
    const record = this.#options.repository.getMatch(id)
    if (!record) throw new MatchNotFoundError(id)
    const resolvedBoard = this.#resolvedRecordBoard(record)
    const board = resolvedBoard.manifest
    const ruleset = this.#options.rulesets.forSnapshot(resolvedBoard.snapshot)
    const events = this.#options.repository.listMatchEvents(id)
    const replayed = replayGame(id, board, events, ruleset)
    const state: GameState = {
      ...replayed,
      status: record.status,
      pausedReason: record.pausedReason,
    }
    return projectMatch({
      matchId: id,
      board,
      boardName: resolvedBoard.snapshot.name,
      state,
      events,
      view: parsedView,
      roles: ruleset.roles,
      agent: (playerId) => {
        const profileId = state.players.get(playerId)?.profileId
        return profileId ? this.#options.catalog.getProfileConfiguration(profileId) : null
      },
      characterForSeat: (seat) =>
        record.setup.seats.find((entry) => entry.seat === seat)?.character ?? null,
      postgameReview: this.#options.repository.postgameReviews.view(id),
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
      let delegate: LiveConnection | null = null
      let closed = false
      const pending: PendingLiveConnection = {
        subscriber,
        activate: (connection) => {
          if (closed) {
            connection.close()
            return
          }
          delegate = connection
          this.#inactiveConnections.get(id)?.delete(pending)
        },
        receive: (message: LiveClientMessage) => {
          if (delegate) {
            delegate.receive(message)
            return
          }
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
        close: () => {
          if (closed) return
          closed = true
          if (delegate) delegate.close()
          this.#inactiveConnections.get(id)?.delete(pending)
        },
      }
      const connections = this.#inactiveConnections.get(id) ?? new Set<PendingLiveConnection>()
      connections.add(pending)
      this.#inactiveConnections.set(id, connections)
      return pending
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
    for (const connections of this.#inactiveConnections.values()) {
      for (const connection of connections) connection.close()
    }
    this.#inactiveConnections.clear()
  }

  #activateInactiveConnections(id: MatchId, runtime: MatchRuntime): void {
    for (const pending of [...(this.#inactiveConnections.get(id) ?? [])]) {
      pending.activate(runtime.connect(pending.subscriber))
    }
    this.#inactiveConnections.delete(id)
  }

  #postgameRuntime(id: MatchId): MatchRuntime {
    const active = this.#active.get(id)
    if (active) return active
    const record = this.#options.repository.getMatch(id)
    if (!record) throw new MatchNotFoundError(id)
    if (!this.#options.repository.postgameReviews.get(id)) {
      throw new Error(`Match ${id} has no postgame review`)
    }
    return this.#restoreRuntime(record)
  }

  #restoreRuntime(record: MatchRecord): MatchRuntime {
    const resolvedBoard = this.#resolvedRecordBoard(record)
    const board = resolvedBoard.manifest
    const ruleset = this.#options.rulesets.forSnapshot(resolvedBoard.snapshot)
    const engine = GameEngine.restore({
      matchId: record.id,
      board,
      events: this.#options.repository.listMatchEvents(record.id),
      status: record.status,
      pausedReason: record.pausedReason,
      ruleset,
    })
    const runtime = new MatchRuntime({
      record,
      engine,
      board,
      boardSnapshot: resolvedBoard.snapshot,
      repository: this.#options.repository,
      catalog: this.#options.catalog,
      config: this.#options.config,
      mailbox: this.#mailbox,
      trajectory: this.#options.trajectories.recorder(record.id),
      restored: true,
      ruleset,
      ...(this.#options.sessionFactory ? { sessionFactory: this.#options.sessionFactory } : {}),
    })
    this.#active.set(record.id, runtime)
    this.#activateInactiveConnections(record.id, runtime)
    return runtime
  }

  #resolvedRecordBoard(record: MatchRecord) {
    if (!record.boardSnapshot) {
      throw new Error(`Match ${record.id} has no board snapshot after catalog backfill`)
    }
    return this.#options.boards.resolveSnapshot(record.boardSnapshot)
  }
}

interface PendingLiveConnection extends LiveConnection {
  readonly subscriber: LiveSubscriber
  activate(connection: LiveConnection): void
}
