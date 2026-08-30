import { resolve } from 'node:path'
import type {
  GameEvent,
  LiveClientMessage,
  LiveMessage,
  MatchView,
  PlayerAction,
  PlayerId,
  SpectatorView,
} from '@agentwolf/contracts'
import type { AcpPromptCallbacks } from '@agentwolf/acp'
import { ensurePlayerSkills } from '@agentwolf/assets/player-skills'
import {
  canViewEvent,
  type GameEngine,
  type RoleRegistry,
  type TurnDescriptor,
} from '@agentwolf/game-engine'
import type { ActionExpectation } from './action-mailbox.js'
import { ContextRenderer } from './context-renderer.js'
import { LiveHub, type LiveConnection, type LiveSubscriber } from './live-hub.js'
import {
  describeError,
  hasUncertainDelivery,
  interruptAbilityExpectation,
  mapWithConcurrency,
  reconcileCommittedPendingAction,
} from './match-runtime-helpers.js'
import { runMatchTurn } from './match-turn-loop.js'
import type { MatchRuntimeOptions, PreparedActorTurn } from './match-runtime-types.js'
import { AgentWolfArenaRuntimeContext } from './arena-runtime-context.js'
import { createMatchPostgameCoordinator, ensurePostgameCountdown } from './match-postgame.js'
import { PlayerRuntime } from './player-runtime.js'
import { PostgameReviewCoordinator } from './postgame-review-coordinator.js'
import { playerAbilityToolContracts } from './player-ability-tool-contracts.js'
import { preparePlayerWorkspace } from './player-workspace.js'
import { projectMatch } from './projector.js'
import { SpeechPlaybackCoordinator } from './speech-playback-coordinator.js'
import { RollingSpeechInterruptCoordinator } from './rolling-speech-interrupt.js'
export type { MatchRuntimeOptions } from './match-runtime-types.js'

export class MatchRuntime {
  readonly #options: MatchRuntimeOptions
  readonly #roles: RoleRegistry
  readonly #renderer: ContextRenderer
  readonly #arena: AgentWolfArenaRuntimeContext
  readonly #hub = new LiveHub()
  readonly #playback: SpeechPlaybackCoordinator
  readonly #speechInterrupts: RollingSpeechInterruptCoordinator | null
  readonly #players = new Map<PlayerId, PlayerRuntime>()
  readonly #tokens = new Map<PlayerId, string>()
  readonly #automaticRecoveryKeys = new Set<string>()
  #postgame: PostgameReviewCoordinator | null = null
  #startPromise: Promise<void> | null = null
  #playerClosePromise: Promise<void> | null = null
  #snapshotScheduled = false
  #disposed = false

  public constructor(options: MatchRuntimeOptions) {
    this.#options = options
    this.#roles = options.ruleset.roles
    this.#renderer = new ContextRenderer(options.ruleset)
    this.#arena = new AgentWolfArenaRuntimeContext(options)
    this.#playback = new SpeechPlaybackCoordinator({
      isVisible: (item, view) =>
        item.event ? canViewEvent(item.event, view, this.engine.state) : true,
      onControl: (title, input) => this.#options.trajectory.recordRuntimeControl(title, input),
      onStateChange: () => this.#broadcastPlaybackState(),
    })
    this.#speechInterrupts =
      options.record.setup.publicSpeechInterruptMode === 'rolling'
        ? new RollingSpeechInterruptCoordinator({
            engine: options.engine,
            board: options.board,
            renderer: this.#renderer,
            players: this.#players,
            speechCharacterLimit: options.record.setup.speechCharacterLimit,
          })
        : null
    if (options.repository.postgameReviews.get(options.record.id)) {
      this.#postgame = this.#createPostgameCoordinator()
    }
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
      agent: (playerId) =>
        this.#players.get(playerId)?.agent ??
        this.#options.catalog.getProfileConfiguration(
          this.engine.state.players.get(playerId)!.profileId,
        ),
      characterForSeat: (seat) =>
        this.#options.record.setup.seats.find((entry) => entry.seat === seat)?.character ?? null,
      sessionStatus: (playerId) => this.#players.get(playerId)?.status ?? 'idle',
      postgameReview: this.#options.repository.postgameReviews.view(this.engine.state.matchId),
      ...(this.#postgame ? { activeSpeech: this.#postgame.activeSpeech } : {}),
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
    this.#speechInterrupts?.stopAll()
    this.#playback.close()
    await this.#speechInterrupts?.settleAll()
    const closingPlayers = this.#closePlayerSessions()
    await this.#postgame?.close()
    await closingPlayers
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
  public activatePostgameReview(): void {
    this.#requirePostgame().activate()
  }

  public startPostgameReview(): MatchView {
    this.#requirePostgame().start()
    return this.project({ kind: 'god' })
  }

  public async skipPostgameReview(): Promise<MatchView> {
    await this.#requirePostgame().skip()
    return this.project({ kind: 'god' })
  }

  public resumePostgameReview(): MatchView {
    this.#requirePostgame().resume()
    return this.project({ kind: 'god' })
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
      reconcileCommittedPendingAction(this.#options.repository, this.engine, player.id)
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
      const token = this.#options.mailbox.issueToken(
        this.engine.state.matchId,
        player.id,
        playerAbilityToolContracts(player, this.#roles, this.#renderer),
      )
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
        const result = await runMatchTurn({
          engine: this.engine,
          arena: this.#arena,
          arenaSessions: this.#arena.sessions,
          speechInterrupts: this.#speechInterrupts,
          playback: this.#playback,
          isDisposed: () => this.#disposed,
          playerRuntime: (playerId) => this.#players.get(playerId) ?? null,
          prepareActorTurn: (playerId, turn) => this.#prepareActorTurn(playerId, turn),
          takeActorTurn: (actor, turn, onSpeechChunk) =>
            this.#takeActorTurn(actor, turn, onSpeechChunk),
          record: (events) => this.#record(events),
          broadcastSnapshot: () => this.#broadcastSnapshotWhenReady(),
        })
        if (result === 'disposed') return
      }
      if (this.engine.state.status === 'ended') {
        this.#options.repository.updateMatchStatus(this.engine.state.matchId, 'ended')
        if (this.#options.postgameReviewEnabled === false) {
          this.#broadcastSnapshot()
          await this.close()
          await this.#archiveMatch()
          return
        }
        this.#createPostgameCountdown()
        this.#broadcastSnapshot()
        this.#postgame?.activate()
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
    const interrupts = interruptAbilityExpectation(this.engine.state, playerId, turn, this.#roles)
    const abilityContracts = this.#renderer.abilityContracts([
      ...(turn.allowedAbilityIds ?? []),
      ...(interrupts.interruptAbilityIds ?? []),
    ])
    const expectation: ActionExpectation = {
      matchId: this.engine.state.matchId,
      playerId,
      actionType: turn.actionType,
      phaseId: turn.phaseId,
      day: this.engine.state.day,
      ...(turn.speechKind ? { speechKind: turn.speechKind } : {}),
      ...(turn.voteKind ? { voteKind: turn.voteKind } : {}),
      ...(turn.allowedAbilityIds ? { allowedAbilityIds: turn.allowedAbilityIds } : {}),
      ...(turn.sheriffActions?.length ? { allowedSheriffActions: turn.sheriffActions } : {}),
      ...(turn.passAllowed !== undefined ? { passAllowed: turn.passAllowed } : {}),
      ...(abilityContracts.length > 0 ? { abilityContracts } : {}),
      ...interrupts,
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

  async #takeActorTurn(
    actor: PreparedActorTurn,
    turn: TurnDescriptor,
    onSpeechChunk?: (text: string) => void,
  ): Promise<PlayerAction> {
    const callbacks: AcpPromptCallbacks =
      turn.actionType === 'speech' && turn.speechKind
        ? {
            onTextChunk: (text) => {
              onSpeechChunk?.(text)
              this.#hub.broadcastSpeechChunk(
                this.engine.state,
                actor.playerId,
                turn.speechKind!,
                text,
              )
            },
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
    if (broadcast && events.length > 0) this.#broadcastSnapshotWhenReady()
  }

  #broadcastSnapshotWhenReady(): void {
    const awaitingPostgameCountdown =
      this.engine.state.status === 'ended' &&
      this.#options.postgameReviewEnabled !== false &&
      this.#options.repository.postgameReviews.get(this.engine.state.matchId) === null
    if (!awaitingPostgameCountdown) this.#broadcastSnapshot()
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
      if (!this.#disposed) this.#broadcastSnapshotWhenReady()
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

  #createPostgameCountdown(): void {
    ensurePostgameCountdown({
      engine: this.engine,
      board: this.#options.board,
      ruleset: this.#options.ruleset,
      repository: this.#options.repository,
    })
    this.#postgame ??= this.#createPostgameCoordinator()
  }

  #createPostgameCoordinator(): PostgameReviewCoordinator {
    return createMatchPostgameCoordinator({
      engine: this.engine,
      board: this.#options.board,
      ruleset: this.#options.ruleset,
      repository: this.#options.repository,
      config: this.#options.config,
      record: this.#options.record,
      concurrency: this.#options.sessionConcurrency ?? 4,
      playerRuntime: (playerId) => this.#players.get(playerId) ?? null,
      ensurePlayerSessions: async () => this.#startPlayerSessions(this.engine.events),
      onChanged: () => this.#scheduleSnapshot(),
      onSpeechChunk: (playerId, text) =>
        this.#hub.broadcastSpeechChunk(this.engine.state, playerId, 'postgame', text),
      waitForFinalSpeech: async (item) => this.#playback.waitFor(item),
      onTerminal: async () => {
        await this.#closePlayerSessions()
        await this.#archiveMatch()
      },
    })
  }

  async #archiveMatch(): Promise<void> {
    await this.#options.archiveMatch?.((view) => this.project(view))
  }

  #requirePostgame(): PostgameReviewCoordinator {
    if (!this.#postgame) {
      throw new Error(`Match ${this.engine.state.matchId} has no postgame review`)
    }
    return this.#postgame
  }
}
