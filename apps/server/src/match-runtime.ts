import { resolve } from 'node:path'
import type {
  GameEvent,
  LiveClientMessage,
  LiveMessage,
  MatchView,
  MatchBoardSnapshot,
  PlayerAction,
  PlayerId,
  SpectatorView,
} from '@agentwolf/contracts'
import type { AcpPromptCallbacks } from '@agentwolf/acp'
import { ensurePlayerSkills } from '@agentwolf/assets/player-skills'
import {
  canViewEvent,
  type BoardManifest,
  type GameEngine,
  type RoleRegistry,
  type RulesetRuntime,
  type TurnDescriptor,
} from '@agentwolf/game-engine'
import type { AgentCatalogService } from './agent-catalog.js'
import { ActionMailbox, type ActionExpectation } from './action-mailbox.js'
import type { ServerConfig } from './config.js'
import { ContextRenderer } from './context-renderer.js'
import { LiveHub, type LiveConnection, type LiveSubscriber } from './live-hub.js'
import {
  describeError,
  findCommittedSpeech,
  hasUncertainDelivery,
  interruptAbilityExpectation,
  mapWithConcurrency,
  settleActions,
} from './match-runtime-helpers.js'
import type { PreparedActorTurn } from './match-runtime-types.js'
import { PlayerRuntime, type PlayerSessionFactory } from './player-runtime.js'
import { preparePlayerWorkspace } from './player-workspace.js'
import { projectMatch } from './projector.js'
import type { MatchRecord, SqliteRepository } from './repository.js'
import { SpeechPlaybackCoordinator } from './speech-playback-coordinator.js'
import type { MatchTrajectoryRecorder } from './trajectory.js'

export interface MatchRuntimeOptions {
  readonly record: MatchRecord
  readonly engine: GameEngine
  readonly board: BoardManifest
  readonly boardSnapshot: MatchBoardSnapshot
  readonly repository: SqliteRepository
  readonly catalog: AgentCatalogService
  readonly config: ServerConfig
  readonly mailbox: ActionMailbox
  readonly trajectory: MatchTrajectoryRecorder
  readonly ruleset: RulesetRuntime
  readonly sessionFactory?: PlayerSessionFactory
  readonly sessionConcurrency?: number
  readonly restored?: boolean
}

export class MatchRuntime {
  readonly #options: MatchRuntimeOptions
  readonly #roles: RoleRegistry
  readonly #renderer: ContextRenderer
  readonly #hub = new LiveHub()
  readonly #playback: SpeechPlaybackCoordinator
  readonly #players = new Map<PlayerId, PlayerRuntime>()
  readonly #tokens = new Map<PlayerId, string>()
  readonly #automaticRecoveryKeys = new Set<string>()
  #startPromise: Promise<void> | null = null
  #playerClosePromise: Promise<void> | null = null
  #snapshotScheduled = false
  #disposed = false

  public constructor(options: MatchRuntimeOptions) {
    this.#options = options
    this.#roles = options.ruleset.roles
    this.#renderer = new ContextRenderer(options.ruleset)
    this.#playback = new SpeechPlaybackCoordinator({
      isVisible: (event, view) => canViewEvent(event, view, this.engine.state),
      onControl: (title, input) => this.#options.trajectory.recordRuntimeControl(title, input),
      onStateChange: () => this.#broadcastPlaybackState(),
    })
  }
  public get engine(): GameEngine {
    return this.#options.engine
  }
  public async start(): Promise<void> {
    this.#startPromise ??= this.#initialize()
    return this.#startPromise
  }
  async #initialize(): Promise<void> {
    this.#options.repository.updateMatchStatus(this.engine.state.matchId, 'starting')
    this.#record(this.engine.prepareStart())
    try {
      await this.#startPlayerSessions(this.engine.events)
      const events = this.engine.start()
      this.#record(events)
      this.#options.repository.updateMatchStatus(this.engine.state.matchId, 'running')
      this.#broadcastSnapshot()
      void this.#run()
      await Promise.resolve()
    } catch (error) {
      if (this.#disposed) return
      await this.#pauseForError(error)
      throw error
    }
  }

  public project(view: SpectatorView): MatchView {
    return projectMatch({
      matchId: this.engine.state.matchId,
      board: this.#options.board,
      boardName: this.#options.boardSnapshot.name,
      state: this.engine.state,
      events: this.engine.events,
      view,
      roles: this.#roles,
      model: (playerId) =>
        this.#players.get(playerId)?.model ??
        this.#options.catalog.getProfile(this.engine.state.players.get(playerId)!.profileId)
          ?.model ??
        null,
      characterForSeat: (seat) =>
        this.#options.record.setup.seats.find((entry) => entry.seat === seat)?.character ?? null,
      sessionStatus: (playerId) => this.#players.get(playerId)?.status ?? 'idle',
    })
  }

  public connect(subscriber: LiveSubscriber): LiveConnection {
    const unsubscribe = this.#hub.subscribe(subscriber)
    this.#sendSnapshot(subscriber)
    this.#sendPlaybackState(subscriber)
    let closed = false
    return {
      receive: (message) => this.#receiveLiveMessage(subscriber, message),
      close: () => {
        if (closed) return
        closed = true
        unsubscribe()
        this.#playback.disconnect(subscriber)
      },
    }
  }

  public subscribe(subscriber: LiveSubscriber): () => void {
    const connection = this.connect(subscriber)
    return () => connection.close()
  }

  public async close(): Promise<void> {
    this.#disposed = true
    this.#playback.close()
    await this.#closePlayerSessions()
    if (this.#startPromise) await Promise.allSettled([this.#startPromise])
    await this.#closePlayerSessions()
  }

  public async resume(): Promise<void> {
    if (this.#disposed) throw new Error(`Match runtime ${this.engine.state.matchId} is closed`)
    if (this.#players.size < this.engine.state.players.size) {
      await this.#startPlayerSessions(this.engine.events)
    }
    await mapWithConcurrency(
      [...this.#players.values()],
      this.#options.sessionConcurrency ?? 4,
      async (runtime) => runtime.recoverForRetry(),
    )
    await this.#bootstrapPendingPlayerSessions(this.engine.events)
    await mapWithConcurrency(
      [...this.#players.values()].filter((runtime) => runtime.bootstrapState === 'dispatched'),
      this.#options.sessionConcurrency ?? 4,
      async (runtime) =>
        runtime.continueBootstrap(await this.#renderer.bootstrapContinuation(this.engine.state)),
    )
    this.#record(this.engine.resume())
    this.#options.repository.updateMatchStatus(this.engine.state.matchId, 'running')
    this.#broadcastSnapshot()
    void this.#run()
  }

  async #startPlayerSessions(historyEvents: readonly GameEvent[]): Promise<void> {
    await ensurePlayerSkills({
      dataDirectory: this.#options.config.dataDirectory,
      sourceRoot: resolve(this.#options.config.projectRoot, 'packages/assets/player-skills'),
    })
    const setupBySeat = new Map(this.#options.record.setup.seats.map((seat) => [seat.seat, seat]))
    const entries = [...this.engine.state.players.values()]
      .filter((player) => !this.#players.has(player.id))
      .sort((left, right) => left.seat - right.seat)
    await mapWithConcurrency(entries, this.#options.sessionConcurrency ?? 4, async (player) => {
      this.#assertOpen()
      this.#reconcileCommittedPendingAction(player.id)
      const setup = setupBySeat.get(player.seat)
      if (!setup) throw new Error(`Missing setup for seat ${player.seat}`)
      const binding = this.#options.repository.playerSessions.get(
        this.engine.state.matchId,
        player.id,
      )
      const profile = binding?.profile ?? this.#options.catalog.getProfile(setup.profileId)
      if (!profile) throw new Error(`Unknown Agent Profile ${setup.profileId}`)
      const tool = binding?.tool ?? this.#options.catalog.getTool(profile.toolId)
      if (!tool) throw new Error(`Unknown Agent Tool ${profile.toolId}`)
      const workspace = await preparePlayerWorkspace(
        this.#options.config.dataDirectory,
        this.engine.state.matchId,
        player.id,
      )
      const token = this.#options.mailbox.issueToken(this.engine.state.matchId, player.id)
      this.#tokens.set(player.id, token)
      const runtime = new PlayerRuntime({
        matchId: this.engine.state.matchId,
        playerId: player.id,
        profile,
        tool,
        workspace,
        token,
        mcpUrl: `${this.#options.config.publicBaseUrl}/mcp`,
        mailbox: this.#options.mailbox,
        trajectory: this.#options.trajectory,
        repository: this.#options.repository,
        allowSessionCreation: this.#options.restored !== true,
        deliveryEvents: {
          started: (playerId, deliveryId, fromSequence, toSequence) => {
            this.#record(
              this.engine.recordDeliveryStarted(playerId, deliveryId, fromSequence, toSequence),
              false,
            )
          },
          acknowledged: (playerId, deliveryId, toSequence) => {
            this.#record(
              this.engine.recordDeliveryAcknowledged(playerId, deliveryId, toSequence),
              false,
            )
          },
        },
        ...(this.#options.sessionFactory ? { sessionFactory: this.#options.sessionFactory } : {}),
        onStatusChange: () => this.#scheduleSnapshot(),
      })
      this.#players.set(player.id, runtime)
      await runtime.start()
      if (this.#disposed) {
        await runtime.close()
        this.#assertOpen()
      }
    })

    await this.#bootstrapPendingPlayerSessions(historyEvents)
  }

  async #bootstrapPendingPlayerSessions(historyEvents: readonly GameEvent[]): Promise<void> {
    const setupBySeat = new Map(this.#options.record.setup.seats.map((seat) => [seat.seat, seat]))
    const players = [...this.engine.state.players.values()].sort(
      (left, right) => left.seat - right.seat,
    )
    const foundations = await Promise.all(
      players
        .filter((player) => this.#players.get(player.id)?.needsBootstrap)
        .map(async (player) => ({
          playerId: player.id,
          envelope: await this.#renderer.foundation(
            this.engine.state,
            this.#options.board,
            player.id,
            historyEvents,
            setupBySeat.get(player.seat)?.character ?? null,
          ),
        })),
    )
    await mapWithConcurrency(
      foundations,
      this.#options.sessionConcurrency ?? 4,
      async ({ playerId, envelope }) => {
        this.#assertOpen()
        const runtime = this.#players.get(playerId)
        if (!runtime) throw new Error(`Player runtime ${playerId} was not created`)
        await runtime.bootstrap(envelope)
      },
    )
  }

  async #run(): Promise<void> {
    try {
      while (!this.#disposed && this.engine.state.status === 'running') {
        const turn = this.engine.currentTurn()
        if (!turn || turn.actors.length === 0) {
          throw new Error(
            `Rule engine stopped without an actionable turn at ${this.engine.state.phaseId}`,
          )
        }
        const actorIds = turn.mode === 'sequential' ? turn.actors.slice(0, 1) : [...turn.actors]
        const prepared = await Promise.all(
          actorIds.map((playerId) => this.#prepareActorTurn(playerId, turn)),
        )
        const actions = await settleActions(
          prepared.map((actor) => this.#takeActorTurn(actor, turn)),
        )
        if (this.#disposed) return
        const orderedActions = actions.sort((left, right) => {
          const leftSeat = this.engine.state.players.get(left.actorId)?.seat ?? 0
          const rightSeat = this.engine.state.players.get(right.actorId)?.seat ?? 0
          return leftSeat - rightSeat
        })
        let committedActionCount = 0
        for (const action of orderedActions) {
          if (this.engine.state.phaseId !== turn.phaseId) break
          const deferSpeechBoundary =
            action.type === 'speech' && turn.mode === 'sequential' && turn.actors.length === 1
          const events = this.engine.submit(action, {
            deferContinuation: deferSpeechBoundary,
          })
          this.#record(events)
          this.#players.get(action.actorId)?.actionSettled()
          committedActionCount += 1
          if (deferSpeechBoundary) {
            const committed = findCommittedSpeech(events)
            if (!committed) throw new Error('Speech action did not produce a committed event')
            await this.#playback.waitFor(committed)
            if (this.#disposed) return
            this.#record(this.engine.continueAfterDeferredAction())
          }
        }
        for (const action of orderedActions.slice(committedActionCount)) {
          this.#players.get(action.actorId)?.actionSettled()
        }
        this.#broadcastSnapshot()
      }
      if (this.engine.state.status === 'ended') {
        this.#options.repository.updateMatchStatus(this.engine.state.matchId, 'ended')
        this.#broadcastSnapshot()
        await this.close()
      }
    } catch (error) {
      if (this.#disposed) return
      const failedPlayers = [...this.#players.entries()].filter(
        ([, runtime]) => runtime.status === 'failed',
      )
      const recoveryKeys = failedPlayers.map(
        ([playerId]) => `${playerId}:${this.engine.state.phaseId}`,
      )
      if (
        hasUncertainDelivery(error) &&
        failedPlayers.length > 0 &&
        recoveryKeys.every((key) => !this.#automaticRecoveryKeys.has(key))
      ) {
        for (const key of recoveryKeys) this.#automaticRecoveryKeys.add(key)
        try {
          await mapWithConcurrency(
            failedPlayers.map(([, runtime]) => runtime),
            this.#options.sessionConcurrency ?? 4,
            async (runtime) => runtime.recoverForRetry(),
          )
          void this.#run()
          return
        } catch (recoveryError) {
          if (this.#disposed) return
          await this.#pauseForError(
            new AggregateError([error, recoveryError], 'Automatic turn recovery failed'),
          )
          return
        }
      }
      await this.#pauseForError(error)
    }
  }

  async #prepareActorTurn(playerId: PlayerId, turn: TurnDescriptor): Promise<PreparedActorTurn> {
    const runtime = this.#players.get(playerId)
    if (!runtime) throw new Error(`Player runtime ${playerId} is unavailable`)
    await runtime.ensureReady()
    const expectation: ActionExpectation = {
      matchId: this.engine.state.matchId,
      playerId,
      actionType: turn.actionType,
      ...(turn.speechKind ? { speechKind: turn.speechKind } : {}),
      ...(turn.voteKind ? { voteKind: turn.voteKind } : {}),
      ...(turn.allowedAbilityIds ? { allowedAbilityIds: turn.allowedAbilityIds } : {}),
      ...interruptAbilityExpectation(this.engine.state, playerId, turn, this.#roles),
      validate: (action) => this.engine.validateAction(action),
    }
    const envelope = await this.#renderer.turn(
      this.engine.state,
      this.#options.board,
      this.engine.events,
      playerId,
      runtime.acknowledgedSequence,
      turn,
      this.#options.record.setup.speechCharacterLimit,
      runtime.continuationPending,
    )
    return { playerId, runtime, envelope, expectation }
  }

  async #takeActorTurn(actor: PreparedActorTurn, turn: TurnDescriptor): Promise<PlayerAction> {
    const callbacks: AcpPromptCallbacks =
      turn.actionType === 'speech' && turn.speechKind
        ? {
            onTextChunk: (text) =>
              this.#hub.broadcastSpeechChunk(
                this.engine.state,
                actor.playerId,
                turn.speechKind!,
                text,
              ),
          }
        : {}
    try {
      return await actor.runtime.takeTurn(
        actor.envelope,
        actor.expectation,
        turn.phaseId,
        callbacks,
      )
    } catch (error) {
      throw new Error(`Player ${actor.playerId} turn failed: ${describeError(error)}`, {
        cause: error,
      })
    }
  }

  #record(events: readonly GameEvent[], broadcast = true): void {
    this.#options.repository.appendEvents(events)
    this.#options.trajectory.recordSystemEvents(events)
    if (broadcast && events.length > 0) this.#broadcastSnapshot()
  }

  #broadcastSnapshot(): void {
    this.#hub.broadcastSnapshot(
      (subscriber): LiveMessage => ({
        type: 'snapshot',
        view: subscriber.view,
        data: this.project(subscriber.view),
      }),
    )
  }

  #broadcastPlaybackState(): void {
    this.#hub.broadcastPlaybackState((subscriber) => this.#playback.stateFor(subscriber))
  }

  #sendSnapshot(subscriber: LiveSubscriber): void {
    subscriber.send({
      type: 'snapshot',
      view: subscriber.view,
      data: this.project(subscriber.view),
    })
  }

  #sendPlaybackState(subscriber: LiveSubscriber): void {
    subscriber.send({ type: 'speech-playback.state', state: this.#playback.stateFor(subscriber) })
  }

  #receiveLiveMessage(subscriber: LiveSubscriber, message: LiveClientMessage): void {
    switch (message.type) {
      case 'view.set':
        subscriber.view = message.view
        this.#sendSnapshot(subscriber)
        this.#playback.viewChanged(subscriber)
        return
      case 'speech-playback.set':
        if (this.#playback.setEnabled(subscriber, message.enabled) === 'busy') {
          this.#sendLiveError(
            subscriber,
            'speech-playback-controller-busy',
            'Speech playback is controlled by another window',
          )
        }
        return
      case 'speech-playback.resolve':
        if (this.#playback.resolve(subscriber, message.sequence, message.outcome) === 'invalid') {
          this.#sendLiveError(
            subscriber,
            'speech-playback-invalid-resolution',
            `Speech playback sequence ${message.sequence} is not pending for this connection`,
          )
        }
        return
      default: {
        const exhaustive: never = message
        return exhaustive
      }
    }
  }

  #sendLiveError(
    subscriber: LiveSubscriber,
    code: Extract<LiveMessage, { type: 'error' }>['code'],
    message: string,
  ): void {
    subscriber.send({ type: 'error', code, message })
  }

  #scheduleSnapshot(): void {
    if (this.#disposed || this.#snapshotScheduled) return
    this.#snapshotScheduled = true
    queueMicrotask(() => {
      this.#snapshotScheduled = false
      if (!this.#disposed) this.#broadcastSnapshot()
    })
  }

  async #pauseForError(error: unknown): Promise<void> {
    if (this.#disposed) return
    const reason = describeError(error)
    const events = this.engine.pause(reason)
    this.#record(events)
    this.#options.repository.updateMatchStatus(this.engine.state.matchId, 'paused', reason)
  }

  async #closePlayerSessions(): Promise<void> {
    const activeClose =
      this.#playerClosePromise ??
      Promise.allSettled([...this.#players.values()].map((runtime) => runtime.close())).then(() => {
        for (const token of this.#tokens.values()) this.#options.mailbox.revokeToken(token)
        this.#tokens.clear()
        return undefined
      })
    this.#playerClosePromise = activeClose
    try {
      await activeClose
    } finally {
      if (this.#playerClosePromise === activeClose) this.#playerClosePromise = null
    }
  }

  #assertOpen(): void {
    if (this.#disposed) throw new Error(`Match runtime ${this.engine.state.matchId} is closed`)
  }

  #reconcileCommittedPendingAction(playerId: PlayerId): void {
    const pending = this.#options.repository.playerSessions.get(
      this.engine.state.matchId,
      playerId,
    )?.pendingAction
    if (!pending) return
    const deliverySequence = this.engine.events.find(
      (event) =>
        event.payload.type === 'delivery.started' &&
        event.payload.deliveryId === pending.deliveryId,
    )?.sequence
    if (!deliverySequence) return
    const committed = this.engine.events.some(
      (event) =>
        event.sequence > deliverySequence &&
        event.payload.type === 'action.submitted' &&
        event.payload.playerId === playerId &&
        JSON.stringify(event.payload.action) === JSON.stringify(pending.action),
    )
    if (committed) {
      this.#options.repository.playerSessions.clearPendingAction(
        this.engine.state.matchId,
        playerId,
      )
    }
  }
}
