import { randomBytes } from 'node:crypto'
import type { McpServer, RequestPermissionRequest } from '@agentclientprotocol/sdk'
import {
  AcpDeliveryUncertainError,
  AcpPlayerSession,
  DeliveryLedger,
  playerActionToolNames,
  playerSessionMeta,
  resolvePlayerLaunchSpec,
  type AcpPromptCallbacks,
  type AcpPromptResult,
} from '@agentwolf/acp'
import {
  PlayerActionSchema,
  type AgentProfile,
  type AgentTool,
  type MatchId,
  type PlayerAction,
  type PlayerId,
  type PhaseId,
} from '@agentwolf/contracts'
import { loadPromptCore } from '@agentwolf/assets/prompts'
import type { ActionExpectation, ActionMailbox } from './action-mailbox.js'
import type { ContextEnvelope } from './context-renderer.js'
import { prepareDirectSpeechResponse } from './direct-speech-response.js'
import type { SqliteRepository } from './repository.js'
import type { MatchTrajectoryRecorder, TrajectoryTurnRecorder } from './trajectory.js'

const promptCore = loadPromptCore()

export type PlayerRuntimeStatus =
  | 'idle'
  | 'starting'
  | 'ready'
  | 'syncing'
  | 'thinking'
  | 'submitted'
  | 'failed'
  | 'closed'

export interface PlayerSession {
  readonly sessionId: string
  readonly connected: boolean
  prompt(
    prompt: string,
    timeoutMs: number,
    callbacks?: AcpPromptCallbacks,
  ): Promise<AcpPromptResult>
  close(): Promise<void>
}

export type PlayerSessionFactory = (options: {
  readonly cwd: string
  readonly tool: AgentTool
  readonly profile: AgentProfile
  readonly mcpServer: McpServer
  readonly matchId: MatchId
  readonly playerId: PlayerId
  readonly onStderr?: (chunk: string) => void
  readonly onPermissionDecision?: (request: RequestPermissionRequest, allowed: boolean) => void
  readonly resumeSessionId?: string
}) => Promise<PlayerSession>

export const defaultPlayerSessionFactory: PlayerSessionFactory = async (options) => {
  const mode = options.profile.mode ?? options.tool.initialMode
  return AcpPlayerSession.start({
    cwd: options.cwd,
    launch: resolvePlayerLaunchSpec(options.tool, options.cwd),
    model: options.profile.model,
    modelConfigKey: options.tool.modelConfigKey,
    ...(mode ? { mode } : {}),
    mcpServers: [options.mcpServer],
    sessionMeta: {
      ...playerSessionMeta(options.tool.kind, promptCore.playerContract()),
      agentwolf: { matchId: options.matchId, playerId: options.playerId },
    },
    approvedToolNames: playerActionToolNames,
    requireSessionResume: true,
    ...(options.resumeSessionId ? { resumeSessionId: options.resumeSessionId } : {}),
    allowOpaqueMcpPermissions: options.tool.kind === 'codex',
    approvedMcpTools: [
      {
        server: 'agentwolf-player-actions',
        tool: 'submit_speech',
        title: promptCore.tool('submit_speech').title,
      },
      {
        server: 'agentwolf-player-actions',
        tool: 'submit_vote',
        title: promptCore.tool('submit_vote').title,
      },
      {
        server: 'agentwolf-player-actions',
        tool: 'submit_night_action',
        title: promptCore.tool('submit_night_action').title,
      },
      {
        server: 'agentwolf-player-actions',
        tool: 'submit_sheriff_action',
        title: promptCore.tool('submit_sheriff_action').title,
      },
      {
        server: 'agentwolf-player-actions',
        tool: 'trigger_skill',
        title: promptCore.tool('trigger_skill').title,
      },
    ],
    ...(options.onStderr ? { onStderr: options.onStderr } : {}),
    ...(options.onPermissionDecision ? { onPermissionDecision: options.onPermissionDecision } : {}),
  })
}

export interface DeliveryEvents {
  started(playerId: PlayerId, deliveryId: string, fromSequence: number, toSequence: number): void
  acknowledged(playerId: PlayerId, deliveryId: string, toSequence: number): void
}

export interface PlayerRuntimeOptions {
  readonly matchId: MatchId
  readonly playerId: PlayerId
  readonly profile: AgentProfile
  readonly tool: AgentTool
  readonly workspace: string
  readonly token: string
  readonly mcpUrl: string
  readonly mailbox: ActionMailbox
  readonly repository: SqliteRepository
  readonly deliveryEvents: DeliveryEvents
  readonly trajectory: MatchTrajectoryRecorder
  readonly allowSessionCreation?: boolean
  readonly sessionFactory?: PlayerSessionFactory
  readonly onStderr?: (chunk: string) => void
  readonly onStatusChange?: (playerId: PlayerId, status: PlayerRuntimeStatus) => void
}

export class PlayerRuntime {
  readonly #options: PlayerRuntimeOptions
  readonly #ledger: DeliveryLedger
  #session: PlayerSession | null = null
  #status: PlayerRuntimeStatus = 'idle'
  #activeTrajectory: TrajectoryTurnRecorder | null = null
  #activeDeliveryId: string | null = null
  #sessionGeneration = 1
  #continuationPending = false

  public constructor(options: PlayerRuntimeOptions) {
    this.#options = options
    this.#sessionGeneration =
      options.repository.playerSessions.get(options.matchId, options.playerId)?.sessionGeneration ??
      1
    this.#ledger = new DeliveryLedger(
      options.repository.getDeliveryLedger(options.matchId, options.playerId) ?? undefined,
    )
  }

  public get status(): PlayerRuntimeStatus {
    return this.#status
  }

  public get model(): string {
    return this.#options.profile.model
  }

  public get acknowledgedSequence(): number {
    return this.#ledger.acknowledgedSequence
  }

  public get continuationPending(): boolean {
    return this.#continuationPending
  }

  public get needsBootstrap(): boolean {
    return (
      this.#options.repository.playerSessions.get(this.#options.matchId, this.#options.playerId)
        ?.bootstrapState === 'pending'
    )
  }

  public get bootstrapState() {
    return this.#options.repository.playerSessions.get(
      this.#options.matchId,
      this.#options.playerId,
    )?.bootstrapState
  }

  public async start(): Promise<void> {
    if (this.#session) return
    this.#setStatus('starting')
    const sessionFactory = this.#options.sessionFactory ?? defaultPlayerSessionFactory
    try {
      let binding = this.#options.repository.playerSessions.get(
        this.#options.matchId,
        this.#options.playerId,
      )
      if (!binding && this.#options.allowSessionCreation === false) {
        binding = this.#adoptLegacySessionBinding()
      }
      let created = false
      if (!binding) {
        binding = this.#options.repository.playerSessions.reserve({
          matchId: this.#options.matchId,
          playerId: this.#options.playerId,
          profile: this.#options.profile,
          tool: this.#options.tool,
          sessionGeneration: 1,
        })
        created = true
      } else if (binding.state === 'creating' || !binding.sessionId) {
        throw new Error(
          `Player ${this.#options.playerId} Session creation is unresolved; refusing session/new`,
        )
      }
      this.#sessionGeneration = binding.sessionGeneration
      this.#session = await this.#openSession(
        sessionFactory,
        created ? undefined : (binding.sessionId ?? undefined),
      )
      if (created) {
        binding = this.#options.repository.playerSessions.activate(
          this.#options.matchId,
          this.#options.playerId,
          this.#session.sessionId,
        )
      } else if (this.#session.sessionId !== binding.sessionId) {
        throw new Error(
          `Player ${this.#options.playerId} resumed Session ${this.#session.sessionId}; expected ${binding.sessionId}`,
        )
      }
      this.#setStatus('ready')
    } catch (error) {
      this.#setStatus('failed')
      throw error
    }
  }

  public async bootstrap(envelope: ContextEnvelope): Promise<void> {
    this.#options.repository.playerSessions.markBootstrap(
      this.#options.matchId,
      this.#options.playerId,
      'dispatched',
    )
    await this.#deliver(
      envelope,
      undefined,
      { kind: 'bootstrap', phaseId: null, actionType: 'bootstrap' },
      'syncing',
    )
    this.#options.repository.playerSessions.markBootstrap(
      this.#options.matchId,
      this.#options.playerId,
      'acknowledged',
    )
  }

  public async continueBootstrap(envelope: ContextEnvelope): Promise<void> {
    if (this.bootstrapState !== 'dispatched') return
    await this.#deliver(
      envelope,
      undefined,
      { kind: 'action', phaseId: null, actionType: 'bootstrap-continuation' },
      'syncing',
    )
    this.#options.repository.playerSessions.markBootstrap(
      this.#options.matchId,
      this.#options.playerId,
      'acknowledged',
    )
    this.#continuationPending = false
  }

  public async takeTurn(
    envelope: ContextEnvelope,
    expectation: ActionExpectation,
    phaseId: PhaseId,
    callbacks: AcpPromptCallbacks = {},
  ): Promise<PlayerAction> {
    const persistedAction = this.#pendingAction()
    if (persistedAction) {
      try {
        if (persistedAction.type !== expectation.actionType) throw new Error('Stale action type')
        expectation.validate?.(persistedAction)
        return persistedAction
      } catch {
        this.actionSettled()
      }
    }
    this.#options.mailbox.expect({
      ...expectation,
      onAccepted: (action) => {
        this.#activeTrajectory?.action(action)
        if (!this.#activeDeliveryId) {
          throw new Error(`Player ${this.#options.playerId} accepted an action outside a delivery`)
        }
        this.#options.repository.playerSessions.savePendingAction(
          this.#options.matchId,
          this.#options.playerId,
          this.#activeDeliveryId,
          action,
        )
        this.#setStatus('submitted')
      },
    })
    try {
      const speechCapture =
        expectation.actionType === 'speech' ? prepareDirectSpeechResponse(callbacks) : null
      const { result, trajectory } = await this.#deliver(
        envelope,
        speechCapture?.callbacks ?? callbacks,
        {
          kind: 'action',
          phaseId,
          actionType: expectation.actionType,
        },
      )
      const directSpeechText = speechCapture?.response.finish(result.text) ?? result.text
      const speechDiagnostic = speechCapture?.response.diagnostic
      if (speechDiagnostic) trajectory.diagnostic(speechDiagnostic)
      const submitted = this.#options.mailbox.take(this.#options.matchId, this.#options.playerId)
      if (submitted) return submitted
      if (expectation.actionType !== 'speech' || !expectation.speechKind) {
        throw new Error(`Agent did not submit the expected ${expectation.actionType} action`)
      }
      const action = PlayerActionSchema.parse({
        type: 'speech',
        matchId: this.#options.matchId,
        actorId: this.#options.playerId,
        kind: expectation.speechKind,
        text: directSpeechText,
      })
      trajectory.action(action)
      return action
    } finally {
      this.#options.mailbox.clear(this.#options.matchId, this.#options.playerId)
    }
  }

  public async close(): Promise<void> {
    if (this.#status === 'closed') return
    this.#setStatus('closed')
    await this.#session?.close()
    this.#session = null
  }

  public async recoverForRetry(): Promise<void> {
    try {
      if (!this.#session?.connected) await this.#resumeSessionConnection()
      const attempt = this.#ledger.activeAttempt
      if (attempt) {
        const pending = this.#pendingAction()
        if (pending) {
          if (attempt.state === 'in-flight') this.#ledger.acknowledge(attempt.id)
          else this.#ledger.abandonUncertain(attempt.id)
          this.#options.deliveryEvents.acknowledged(
            this.#options.playerId,
            attempt.id,
            attempt.toSequence,
          )
        } else {
          if (attempt.state === 'in-flight') {
            this.#ledger.markUncertain(attempt.id, 'ACP connection interrupted')
          }
          this.#ledger.abandonUncertain(attempt.id)
          this.#continuationPending = true
        }
        this.#persistLedger()
      }
      this.#setStatus('ready')
    } catch (error) {
      this.#setStatus('failed')
      throw error
    }
  }

  public async ensureReady(): Promise<void> {
    if (this.#status === 'failed' || !this.#session?.connected) await this.recoverForRetry()
  }

  public actionSettled(): void {
    this.#options.repository.playerSessions.clearPendingAction(
      this.#options.matchId,
      this.#options.playerId,
    )
  }

  async #deliver(
    envelope: ContextEnvelope,
    callbacks: AcpPromptCallbacks | undefined,
    traceContext: {
      readonly kind: 'bootstrap' | 'action'
      readonly phaseId: PhaseId | null
      readonly actionType: string
    },
    workingStatus: 'syncing' | 'thinking' = 'thinking',
  ): Promise<{ result: AcpPromptResult; trajectory: TrajectoryTurnRecorder }> {
    if (!this.#session) throw new Error('Player ACP session is not started')
    if (this.#ledger.activeAttempt) {
      throw new AcpDeliveryUncertainError(
        `Player ${this.#options.playerId} has unresolved delivery ${this.#ledger.activeAttempt.id}`,
      )
    }
    const deliveryId = `delivery-${randomBytes(10).toString('hex')}`
    const attempt = this.#ledger.begin(deliveryId, envelope.toSequence)
    this.#options.deliveryEvents.started(
      this.#options.playerId,
      deliveryId,
      attempt.fromSequence,
      attempt.toSequence,
    )
    this.#persistLedger()
    this.#setStatus(workingStatus)
    const trajectory = this.#options.trajectory.beginTurn({
      turnId: deliveryId,
      ownerId: this.#options.playerId,
      sessionId: this.#session.sessionId,
      sessionGeneration: this.#sessionGeneration,
      kind: traceContext.kind,
      phaseId: traceContext.phaseId,
      actionType: traceContext.actionType,
      fromSequence: attempt.fromSequence,
      toSequence: attempt.toSequence,
      prompt: envelope.prompt,
      visibleEventSequences: envelope.visibleEvents.map((event) => event.sequence),
      gameStatus: envelope.gameStatus,
      pausedReasonAtRender: envelope.pausedReason,
      continuation: envelope.continuation,
    })
    this.#activeTrajectory = trajectory
    this.#activeDeliveryId = deliveryId
    try {
      const result = await this.#session.prompt(
        envelope.prompt,
        this.#options.profile.promptTimeoutMs,
        {
          ...(callbacks?.onTextChunk ? { onTextChunk: callbacks.onTextChunk } : {}),
          onUpdate: (update) => {
            trajectory.update(update)
            callbacks?.onUpdate?.(update)
          },
        },
      )
      this.#ledger.acknowledge(deliveryId)
      this.#options.deliveryEvents.acknowledged(
        this.#options.playerId,
        deliveryId,
        envelope.toSequence,
      )
      this.#persistLedger()
      this.#setStatus('ready')
      this.#continuationPending = false
      if (result.stopReason !== 'end_turn') {
        throw new Error(`ACP turn stopped with ${result.stopReason}`)
      }
      trajectory.complete(result.stopReason)
      return { result, trajectory }
    } catch (error) {
      const accepted = this.#options.repository.playerSessions.get(
        this.#options.matchId,
        this.#options.playerId,
      )?.pendingAction
      if (accepted?.deliveryId === deliveryId) {
        const activeAttempt = this.#ledger.snapshot().activeAttempt
        if (activeAttempt) {
          if (activeAttempt.state === 'in-flight') this.#ledger.acknowledge(deliveryId)
          else this.#ledger.abandonUncertain(deliveryId)
          this.#options.deliveryEvents.acknowledged(
            this.#options.playerId,
            deliveryId,
            envelope.toSequence,
          )
          this.#persistLedger()
        }
        trajectory.diagnostic(
          'ACP Prompt ended after the structured action was accepted; using the accepted action.',
        )
        trajectory.complete('end_turn')
        this.#setStatus(this.#session.connected ? 'ready' : 'failed')
        return {
          result: { text: '', stopReason: 'end_turn', updates: [] },
          trajectory,
        }
      }
      const activeAttempt = this.#ledger.snapshot().activeAttempt
      if (activeAttempt?.state === 'in-flight') {
        this.#ledger.markUncertain(
          deliveryId,
          error instanceof Error ? error.message : String(error),
        )
        this.#persistLedger()
      }
      trajectory.fail(
        error,
        error instanceof AcpDeliveryUncertainError ||
          (error instanceof Error && error.name === 'AcpDeliveryUncertainError')
          ? 'uncertain'
          : 'failed',
      )
      this.#setStatus('failed')
      throw error
    } finally {
      if (this.#activeTrajectory === trajectory) this.#activeTrajectory = null
      if (this.#activeDeliveryId === deliveryId) this.#activeDeliveryId = null
    }
  }

  async #resumeSessionConnection(): Promise<void> {
    const binding = this.#options.repository.playerSessions.get(
      this.#options.matchId,
      this.#options.playerId,
    )
    if (binding?.state !== 'active' || !binding.sessionId) {
      throw new Error(`Player ${this.#options.playerId} has no durable ACP Session binding`)
    }
    await this.#session?.close()
    this.#session = null
    const sessionFactory = this.#options.sessionFactory ?? defaultPlayerSessionFactory
    const resumed = await this.#openSession(sessionFactory, binding.sessionId)
    if (resumed.sessionId !== binding.sessionId) {
      await resumed.close()
      throw new Error(
        `Player ${this.#options.playerId} resumed Session ${resumed.sessionId}; expected ${binding.sessionId}`,
      )
    }
    this.#session = resumed
  }

  async #openSession(
    sessionFactory: PlayerSessionFactory,
    resumeSessionId?: string,
  ): Promise<PlayerSession> {
    return sessionFactory({
      cwd: this.#options.workspace,
      tool: this.#options.tool,
      profile: this.#options.profile,
      matchId: this.#options.matchId,
      playerId: this.#options.playerId,
      mcpServer: {
        type: 'http',
        name: 'agentwolf-player-actions',
        url: this.#options.mcpUrl,
        headers: [{ name: 'Authorization', value: `Bearer ${this.#options.token}` }],
      },
      ...(resumeSessionId ? { resumeSessionId } : {}),
      onStderr: (chunk) => {
        this.#activeTrajectory?.diagnostic(chunk)
        this.#options.onStderr?.(chunk)
      },
      onPermissionDecision: (request, allowed) =>
        this.#activeTrajectory?.permission(request, allowed),
    })
  }

  #adoptLegacySessionBinding() {
    const turns = this.#options.repository.listTrajectoryTurns(
      this.#options.matchId,
      this.#options.playerId,
    )
    const latest = turns.at(-1)
    if (!latest) {
      throw new Error(
        `Player ${this.#options.playerId} has no durable ACP Session binding to resume`,
      )
    }
    const binding = this.#options.repository.playerSessions.adopt({
      matchId: this.#options.matchId,
      playerId: this.#options.playerId,
      profile: this.#options.profile,
      tool: this.#options.tool,
      sessionGeneration: latest.sessionGeneration,
      sessionId: latest.sessionId,
    })
    this.#options.repository.playerSessions.markBootstrap(
      this.#options.matchId,
      this.#options.playerId,
      'acknowledged',
    )
    return binding
  }

  #pendingAction(): PlayerAction | null {
    return (
      this.#options.repository.playerSessions.get(this.#options.matchId, this.#options.playerId)
        ?.pendingAction?.action ?? null
    )
  }

  #persistLedger(): void {
    this.#options.repository.saveDeliveryLedger(
      this.#options.matchId,
      this.#options.playerId,
      this.#ledger.snapshot(),
    )
  }

  #setStatus(status: PlayerRuntimeStatus): void {
    if (this.#status === status) return
    this.#status = status
    this.#options.onStatusChange?.(this.#options.playerId, status)
  }
}
