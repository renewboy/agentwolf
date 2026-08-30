import type { McpServer } from '@agentclientprotocol/sdk'
import {
  AgentProfileSchema,
  AgentToolIdSchema,
  AgentToolSchema,
  type PlayerAction,
  type PlayerId,
  type SimulationCapture,
  type SimulationFixture,
  type SimulationTurn,
  type SimulationVariant,
} from '@agentwolf/contracts'
import {
  AcpDeliveryUncertainError,
  type AcpPromptCallbacks,
  type AcpPromptResult,
} from '@agentwolf/acp'
import type { ActionMailbox } from './action-mailbox.js'
import type { PlayerSession, PlayerSessionFactory } from './player-runtime.js'
import type { SqliteRepository } from './repository.js'
import { directSpeechRetainedBoundaryTail } from './direct-speech-response.js'

type SimulationInput = SimulationCapture | SimulationFixture

export function createSimulationSessionFactory(
  simulation: SimulationInput,
  mailbox: ActionMailbox,
  variant: SimulationVariant,
): PlayerSessionFactory {
  return new ReplayScript(simulation, mailbox, variant).factory
}

export function saveSimulationAgents(
  repository: SqliteRepository,
  simulation: SimulationInput,
): void {
  const toolId = AgentToolIdSchema.parse('tool-simulation-replay')
  repository.saveCustomTool(
    AgentToolSchema.parse({
      id: toolId,
      name: 'Simulation replay',
      kind: 'custom',
      command: process.execPath,
      args: [],
      environment: {},
      modelConfigKey: 'model',
      builtIn: false,
    }),
  )
  for (const player of simulation.setup.players) {
    repository.saveProfile(
      AgentProfileSchema.parse({
        id: player.profileId,
        name: player.name,
        toolId,
        model: 'simulation',
        promptTimeoutMs: 5_000,
        connection: {},
        createdAt: '2000-01-01T00:00:00.000Z',
        updatedAt: '2000-01-01T00:00:00.000Z',
      }),
    )
  }
}

class ReplayScript {
  readonly #simulation: SimulationInput
  readonly #mailbox: ActionMailbox
  readonly #variant: SimulationVariant
  readonly #consumed = new Set<number>()
  readonly #generations = new Map<PlayerId, number>()
  readonly #scheduler: CompletionScheduler
  #injectedTransient = false

  public constructor(
    simulation: SimulationInput,
    mailbox: ActionMailbox,
    variant: SimulationVariant,
  ) {
    this.#simulation = simulation
    this.#mailbox = mailbox
    this.#variant = variant
    this.#scheduler = new CompletionScheduler(simulation, variant)
  }

  public readonly factory: PlayerSessionFactory = async (options) => {
    const generation = options.resumeSessionId
      ? (this.#generations.get(options.playerId) ?? 1)
      : (this.#generations.get(options.playerId) ?? 0) + 1
    this.#generations.set(options.playerId, generation)
    return new ReplaySession(
      options.playerId,
      generation,
      options.resumeSessionId ?? `simulation-${options.playerId}-${generation}`,
      options.resumeSessionId === undefined,
      (playerId, sessionGeneration, bootstrap, callbacks) =>
        this.#prompt(
          playerId,
          sessionGeneration,
          extractToken(options.mcpServer),
          bootstrap,
          callbacks,
        ),
    )
  }

  async #prompt(
    playerId: PlayerId,
    sessionGeneration: number,
    token: string,
    bootstrapCall: boolean,
    callbacks: AcpPromptCallbacks,
  ): Promise<AcpPromptResult> {
    if (bootstrapCall) {
      const bootstrap = this.#nextTurn(playerId, 'bootstrap', sessionGeneration)
      if (bootstrap) {
        this.#consumed.add(bootstrap.completionOrder)
        if (bootstrap.fault) throw faultError(bootstrap)
      }
      return { text: 'ready', stopReason: 'end_turn', updates: [] }
    }
    const expectation = this.#mailbox.peekExpectation(this.#simulation.setup.matchId, playerId)
    const turn = this.#nextTurn(playerId, 'action', sessionGeneration, expectation)
    if (!turn) throw new Error(`No orchestration turn remains for ${playerId}`)
    if (turn.fault === 'cancelled') {
      this.#consumed.add(turn.completionOrder)
      if (turn.action?.type === 'speech') {
        callbacks.onTextChunk?.(
          `${turn.action.text}${'。'.repeat(directSpeechRetainedBoundaryTail)}`,
        )
      }
      return new Promise(() => undefined)
    }
    return this.#scheduler.run(turn, () => {
      if (
        this.#variant === 'transient-delivery' &&
        !this.#injectedTransient &&
        turn.action !== null &&
        turn.fault === null
      ) {
        this.#injectedTransient = true
        throw new AcpDeliveryUncertainError('simulated transient delivery')
      }
      this.#consumed.add(turn.completionOrder)
      if (turn.fault && turn.action === null) throw faultError(turn)
      if (!turn.action) throw new Error(`Turn ${turn.ordinal} has no action`)
      return performAction(this.#mailbox, token, turn.action, callbacks)
    })
  }

  #nextTurn(
    playerId: PlayerId,
    kind: SimulationTurn['kind'],
    sessionGeneration: number,
    expectation?: {
      readonly phaseId?: string
      readonly day?: number
      readonly toSequence?: number
      readonly actionType: string
    } | null,
  ): SimulationTurn | null {
    const candidates = this.#simulation.turns.filter(
      (turn) =>
        !this.#consumed.has(turn.completionOrder) &&
        turn.playerId === playerId &&
        turn.kind === kind,
    )
    const phaseMatches = expectation
      ? candidates.filter(
          (turn) =>
            turn.phaseId === expectation.phaseId && turn.actionType === expectation.actionType,
        )
      : candidates
    const dayMatches = expectation?.day
      ? phaseMatches.filter((turn) => turn.day === 0 || turn.day === expectation.day)
      : phaseMatches
    const sequenceMatches = expectation?.toSequence
      ? dayMatches.filter((turn) => turn.toSequence === expectation.toSequence)
      : dayMatches
    const matchingBoundary =
      sequenceMatches.length > 0 ? sequenceMatches : expectation?.day ? dayMatches : phaseMatches
    const matchingGeneration = matchingBoundary
      .filter((turn) => turn.sessionGeneration === sessionGeneration)
      .sort((left, right) => left.completionOrder - right.completionOrder)[0]
    if (matchingGeneration) return matchingGeneration
    return (
      matchingBoundary.sort((left, right) => left.completionOrder - right.completionOrder)[0] ??
      null
    )
  }
}

class ReplaySession implements PlayerSession {
  public readonly sessionId: string
  readonly #promptHandler: (
    bootstrap: boolean,
    callbacks: AcpPromptCallbacks,
  ) => Promise<AcpPromptResult>
  #closed = false
  #firstPrompt = true
  #cancelPrompt: (() => void) | null = null

  public get connected(): boolean {
    return !this.#closed
  }

  public finishAfterAcceptedAction(): void {}

  public cancelActivePrompt(): Promise<boolean> {
    if (!this.#cancelPrompt) return Promise.resolve(false)
    this.#cancelPrompt()
    return Promise.resolve(true)
  }

  public constructor(
    playerId: PlayerId,
    generation: number,
    sessionId: string,
    bootstrapPending: boolean,
    promptHandler: (
      playerId: PlayerId,
      generation: number,
      bootstrap: boolean,
      callbacks: AcpPromptCallbacks,
    ) => Promise<AcpPromptResult>,
  ) {
    this.sessionId = sessionId
    this.#firstPrompt = bootstrapPending
    this.#promptHandler = (bootstrap, callbacks) =>
      promptHandler(playerId, generation, bootstrap, callbacks)
  }

  public prompt(
    _prompt: string,
    _timeoutMs: number,
    callbacks: AcpPromptCallbacks = {},
  ): Promise<AcpPromptResult> {
    if (this.#closed) return Promise.reject(new Error('Simulation Session is closed'))
    const bootstrap = this.#firstPrompt
    this.#firstPrompt = false
    const cancelled = new Promise<AcpPromptResult>((resolve) => {
      this.#cancelPrompt = () =>
        resolve({ text: '', stopReason: 'cancelled' as never, updates: [] })
    })
    return Promise.race([this.#promptHandler(bootstrap, callbacks), cancelled]).finally(() => {
      this.#cancelPrompt = null
    })
  }

  public close(): Promise<void> {
    this.#closed = true
    return Promise.resolve()
  }
}

class CompletionScheduler {
  readonly #simulation: SimulationInput
  readonly #variant: SimulationVariant
  #pending: Array<{
    turn: SimulationTurn
    task: () => AcpPromptResult
    resolve: (value: AcpPromptResult) => void
    reject: (error: unknown) => void
  }> = []
  #scheduled = false

  public constructor(simulation: SimulationInput, variant: SimulationVariant) {
    this.#simulation = simulation
    this.#variant = variant
  }

  public run(turn: SimulationTurn, task: () => AcpPromptResult): Promise<AcpPromptResult> {
    return new Promise((resolvePromise, reject) => {
      this.#pending.push({ turn, task, resolve: resolvePromise, reject })
      if (this.#scheduled) return
      this.#scheduled = true
      queueMicrotask(() => this.#flush())
    })
  }

  #flush(): void {
    this.#scheduled = false
    const pending = this.#pending
      .splice(0)
      .sort((left, right) => this.#compare(left.turn, right.turn))
    for (const entry of pending) {
      try {
        entry.resolve(entry.task())
      } catch (error) {
        entry.reject(error)
      }
    }
  }

  #compare(left: SimulationTurn, right: SimulationTurn): number {
    if (this.#variant === 'parallel-seat-order') {
      return seatOf(this.#simulation, left.playerId) - seatOf(this.#simulation, right.playerId)
    }
    if (this.#variant === 'parallel-reverse-order') {
      return seatOf(this.#simulation, right.playerId) - seatOf(this.#simulation, left.playerId)
    }
    return left.completionOrder - right.completionOrder
  }
}

function performAction(
  mailbox: ActionMailbox,
  token: string,
  action: PlayerAction,
  callbacks: AcpPromptCallbacks,
): AcpPromptResult {
  switch (action.type) {
    case 'speech': {
      streamSpeech(action, callbacks)
      return { text: action.text, stopReason: 'end_turn', updates: [] }
    }
    case 'vote':
      mailbox.submitVote(token, action.targetId)
      break
    case 'night-action':
      mailbox.submitNightAction(token, action.abilityId, action.targetIds, action.option)
      break
    case 'sheriff-action':
      mailbox.submitSheriffAction(token, action.action, action.targetId)
      break
    case 'skill-trigger':
      if (action.option === 'pass') mailbox.submitSkillPass(token)
      else mailbox.submitSkillTrigger(token, action.abilityId, action.targetId ?? undefined)
      break
    default: {
      const exhaustive: never = action
      return exhaustive
    }
  }
  return { text: '', stopReason: 'end_turn', updates: [] }
}

function streamSpeech(
  action: Extract<PlayerAction, { type: 'speech' }>,
  callbacks: AcpPromptCallbacks,
): void {
  const midpoint = Math.ceil(action.text.length / 2)
  callbacks.onTextChunk?.(action.text.slice(0, midpoint))
  callbacks.onTextChunk?.(action.text.slice(midpoint))
}

function extractToken(server: McpServer): string {
  if (!('headers' in server)) throw new Error('Simulation requires an HTTP MCP server')
  const header = server.headers.find((entry) => entry.name === 'Authorization')
  if (!header?.value.startsWith('Bearer ')) throw new Error('Simulation MCP token is missing')
  return header.value.slice('Bearer '.length)
}

function faultError(turn: SimulationTurn): Error {
  if (turn.fault === 'uncertain-delivery') {
    return new AcpDeliveryUncertainError('simulated uncertain delivery')
  }
  const error = new Error(`simulated ${turn.fault ?? 'failure'}`)
  if (turn.fault === 'process-exit') error.name = 'ProcessExitError'
  return error
}

function seatOf(simulation: SimulationInput, playerId: PlayerId): number {
  return simulation.setup.players.find((player) => player.playerId === playerId)?.seat ?? 0
}
