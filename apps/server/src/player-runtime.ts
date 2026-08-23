import { randomBytes } from 'node:crypto'
import type { McpServer, RequestPermissionRequest } from '@agentclientprotocol/sdk'
import {
  AcpDeliveryUncertainError,
  AcpPlayerSession,
  DeliveryLedger,
  resolveLaunchSpec,
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
import { getCopy } from '@agentwolf/assets'
import type { ActionExpectation, ActionMailbox } from './action-mailbox.js'
import type { ContextEnvelope } from './context-renderer.js'
import type { SqliteRepository } from './repository.js'
import type { MatchTrajectoryRecorder, TrajectoryTurnRecorder } from './trajectory.js'

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
}) => Promise<PlayerSession>

export const defaultPlayerSessionFactory: PlayerSessionFactory = async (options) => {
  const mode = options.profile.mode ?? options.tool.initialMode
  return AcpPlayerSession.start({
    cwd: options.cwd,
    launch: resolveLaunchSpec(options.tool),
    model: options.profile.model,
    modelConfigKey: options.tool.modelConfigKey,
    ...(mode ? { mode } : {}),
    mcpServers: [options.mcpServer],
    sessionMeta: {
      agentwolf: { matchId: options.matchId, playerId: options.playerId },
    },
    approvedToolNames: [
      'submit_speech',
      'submit_vote',
      'submit_night_action',
      'submit_sheriff_action',
      'trigger_skill',
    ],
    approvedMcpTools: [
      {
        server: 'agentwolf-player-actions',
        tool: 'submit_speech',
        title: getCopy('tools.speechTitle'),
      },
      {
        server: 'agentwolf-player-actions',
        tool: 'submit_vote',
        title: getCopy('tools.voteTitle'),
      },
      {
        server: 'agentwolf-player-actions',
        tool: 'submit_night_action',
        title: getCopy('tools.nightTitle'),
      },
      {
        server: 'agentwolf-player-actions',
        tool: 'submit_sheriff_action',
        title: getCopy('tools.sheriffTitle'),
      },
      {
        server: 'agentwolf-player-actions',
        tool: 'trigger_skill',
        title: getCopy('tools.skillTitle'),
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
  readonly resetDeliveryLedger?: boolean
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
  readonly #sessionGeneration: number

  public constructor(options: PlayerRuntimeOptions) {
    this.#options = options
    this.#sessionGeneration = options.trajectory.nextSessionGeneration(options.playerId)
    this.#ledger = new DeliveryLedger(
      options.resetDeliveryLedger
        ? undefined
        : (options.repository.getDeliveryLedger(options.matchId, options.playerId) ?? undefined),
    )
  }

  public get status(): PlayerRuntimeStatus {
    return this.#status
  }

  public get acknowledgedSequence(): number {
    return this.#ledger.acknowledgedSequence
  }

  public async start(): Promise<void> {
    if (this.#session) return
    this.#setStatus('starting')
    const sessionFactory = this.#options.sessionFactory ?? defaultPlayerSessionFactory
    try {
      this.#session = await sessionFactory({
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
        onStderr: (chunk) => {
          this.#activeTrajectory?.diagnostic(chunk)
          this.#options.onStderr?.(chunk)
        },
        onPermissionDecision: (request, allowed) =>
          this.#activeTrajectory?.permission(request, allowed),
      })
      this.#setStatus('ready')
    } catch (error) {
      this.#setStatus('failed')
      throw error
    }
  }

  public async bootstrap(envelope: ContextEnvelope): Promise<void> {
    await this.#deliver(
      envelope,
      undefined,
      { kind: 'bootstrap', phaseId: null, actionType: 'bootstrap' },
      'syncing',
    )
  }

  public async takeTurn(
    envelope: ContextEnvelope,
    expectation: ActionExpectation,
    phaseId: PhaseId,
    callbacks: AcpPromptCallbacks = {},
  ): Promise<PlayerAction> {
    this.#options.mailbox.expect({
      ...expectation,
      onAccepted: (action) => {
        this.#activeTrajectory?.action(action)
        this.#setStatus('submitted')
      },
    })
    try {
      const { result, trajectory } = await this.#deliver(envelope, callbacks, {
        kind: 'action',
        phaseId,
        actionType: expectation.actionType,
      })
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
        text: result.text,
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

  public recoverForRetry(): void {
    if (!this.#session || this.#status === 'closed') {
      throw new Error(`Player ${this.#options.playerId} has no recoverable ACP session`)
    }
    const attempt = this.#ledger.activeAttempt
    if (attempt) {
      if (attempt.state !== 'uncertain') {
        throw new Error(`Player ${this.#options.playerId} still has an in-flight delivery`)
      }
      this.#ledger.abandonUncertain(attempt.id)
      this.#persistLedger()
    }
    this.#setStatus('ready')
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
      promptVersion: envelope.promptVersion,
      visibleEventSequences: envelope.visibleEvents.map((event) => event.sequence),
      gameStatus: envelope.gameStatus,
      pausedReasonAtRender: envelope.pausedReason,
    })
    this.#activeTrajectory = trajectory
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
      if (result.stopReason !== 'end_turn') {
        throw new Error(`ACP turn stopped with ${result.stopReason}`)
      }
      trajectory.complete(result.stopReason)
      return { result, trajectory }
    } catch (error) {
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
    }
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
