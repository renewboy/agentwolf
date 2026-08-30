import type { AbilityId, PlayerAction, PlayerId } from '@agentwolf/contracts'
import type { BoardManifest, GameEngine } from '@agentwolf/game-engine'
import type { ActionExpectation } from './action-mailbox.js'
import type { ContextRenderer } from './context-renderer.js'
import type { PlayerRuntime } from './player-runtime.js'
import { PlayerTurnSupersededError } from './player-turn-superseded.js'

type InterruptAction = Extract<PlayerAction, { type: 'skill-trigger' }>

interface ListenerTask {
  readonly generation: number
  readonly playerId: PlayerId
  readonly runtime: PlayerRuntime
  readonly promise: Promise<void>
}

export interface RollingSpeechInterruptOptions {
  readonly engine: GameEngine
  readonly board: BoardManifest
  readonly renderer: ContextRenderer
  readonly players: ReadonlyMap<PlayerId, PlayerRuntime>
  readonly speechCharacterLimit: number
}

export class RollingSpeechInterruptCoordinator {
  readonly #options: RollingSpeechInterruptOptions
  readonly #tasks = new Map<PlayerId, ListenerTask>()
  #generation = 0
  #refreshKey: string | null = null
  #winner: InterruptAction | null = null
  #winnerPromise: Promise<InterruptAction>
  #resolveWinner!: (action: InterruptAction) => void

  public constructor(options: RollingSpeechInterruptOptions) {
    this.#options = options
    this.#winnerPromise = this.#newWinnerPromise()
  }

  public refresh(currentSpeakerId: PlayerId | null): void {
    const turn = this.#options.engine.currentTurn()
    if (!turn || turn.mode !== 'sequential' || turn.actionType !== 'speech') {
      this.stopAll()
      return
    }
    const boundary = this.#latestSpeechBoundary()
    const key = `${turn.phaseId}:${boundary.sequence}:${currentSpeakerId ?? 'none'}`
    if (this.#refreshKey === key) return
    this.#refreshKey = key
    const generation = ++this.#generation
    const eligible = [...this.#options.engine.state.players.values()]
      .filter(
        (player) =>
          player.alive &&
          player.id !== currentSpeakerId &&
          player.id !== boundary.previousSpeakerId &&
          this.#options.engine.interruptAbilityIdsFor(player.id).length > 0,
      )
      .sort((left, right) => left.seat - right.seat)
      .map((player) => player.id)
    const selected = new Set(eligible)
    for (const [playerId, task] of this.#tasks) {
      if (!selected.has(playerId)) void this.#supersede(task)
    }
    for (const playerId of eligible) this.#restart(playerId, generation)
  }

  public waitForInterrupt(): Promise<InterruptAction> {
    return this.#winner ? Promise.resolve(this.#winner) : this.#winnerPromise
  }

  public peekInterrupt(): InterruptAction | null {
    return this.#winner
  }

  public takeInterrupt(): InterruptAction | null {
    const action = this.#winner
    if (!action) return null
    this.#winner = null
    this.#winnerPromise = this.#newWinnerPromise()
    return action
  }

  public async quiesce(playerId: PlayerId): Promise<void> {
    const task = this.#tasks.get(playerId)
    if (task) await this.#supersede(task)
  }

  public stopAll(): void {
    this.#refreshKey = null
    ++this.#generation
    for (const task of this.#tasks.values()) void this.#supersede(task)
  }

  public async settleAll(): Promise<void> {
    const tasks = [...this.#tasks.values()]
    await Promise.allSettled(tasks.map((task) => this.#supersede(task)))
  }

  #restart(playerId: PlayerId, generation: number): void {
    const runtime = this.#options.players.get(playerId)
    if (!runtime) return
    const previous = this.#tasks.get(playerId)
    let task!: ListenerTask
    const promise = (async () => {
      if (previous) await this.#supersede(previous)
      if (generation !== this.#generation || this.#winner) return
      await this.#runListener(runtime, playerId, generation)
    })()
      .catch((error: unknown) => {
        if (!(error instanceof PlayerTurnSupersededError)) return
      })
      .finally(() => {
        if (this.#tasks.get(playerId) === task) this.#tasks.delete(playerId)
      })
    task = { generation, playerId, runtime, promise }
    this.#tasks.set(playerId, task)
  }

  async #runListener(
    runtime: PlayerRuntime,
    playerId: PlayerId,
    generation: number,
  ): Promise<void> {
    await runtime.ensureReady()
    if (generation !== this.#generation || this.#winner) return
    const turn = this.#options.engine.currentTurn()
    if (!turn || turn.mode !== 'sequential' || turn.actionType !== 'speech') return
    const abilityIds = this.#options.engine.interruptAbilityIdsFor(playerId)
    if (abilityIds.length === 0 || turn.actors[0] === playerId) return
    const envelope = await this.#options.renderer.interruptTurn(
      this.#options.engine.state,
      this.#options.board,
      this.#options.engine.events,
      playerId,
      runtime.acknowledgedSequence,
      turn,
      abilityIds,
      this.#options.speechCharacterLimit,
      runtime.continuationPending,
    )
    if (generation !== this.#generation || this.#winner) return
    const expectation: ActionExpectation = {
      matchId: this.#options.engine.state.matchId,
      playerId,
      actionType: 'skill-trigger',
      phaseId: turn.phaseId,
      day: this.#options.engine.state.day,
      allowedAbilityIds: abilityIds,
      abilityContracts: this.#options.renderer.abilityContracts(abilityIds),
      passAllowed: true,
      validate: (action) => this.#validateAction(action, abilityIds),
      onAccepted: (action) => {
        if (action.type === 'skill-trigger' && action.option !== 'pass') this.#accept(action)
      },
    }
    const action = await runtime.takeTurn(envelope, expectation, turn.phaseId)
    if (action.type !== 'skill-trigger') return
    if (action.option === 'pass') {
      runtime.actionSettled()
      return
    }
    if (!this.#accept(action)) runtime.actionSettled()
  }

  #validateAction(action: PlayerAction, abilityIds: readonly AbilityId[]): void {
    if (action.type !== 'skill-trigger')
      throw new Error('Interrupt listener requires skill-trigger')
    if (!abilityIds.includes(action.abilityId)) {
      throw new Error(`Interrupt listener does not allow ${action.abilityId}`)
    }
    if (action.option === 'pass') {
      if (action.targetId !== null) throw new Error('Interrupt pass cannot target a player')
      return
    }
    this.#options.engine.validateAction(action)
  }

  #accept(action: InterruptAction): boolean {
    if (this.#winner) return this.#winner.actorId === action.actorId
    this.#winner = action
    this.#resolveWinner(action)
    for (const task of this.#tasks.values()) {
      if (task.playerId !== action.actorId) void this.#supersede(task)
    }
    return true
  }

  async #supersede(task: ListenerTask): Promise<void> {
    const outcome = await task.runtime.supersedeActiveTurn()
    if (outcome === 'accepted') {
      const action = task.runtime.pendingAction()
      if (action?.type === 'skill-trigger' && action.option !== 'pass') this.#accept(action)
    }
    await task.promise
    const settledAction = task.runtime.pendingAction()
    if (settledAction?.type !== 'skill-trigger') return
    if (settledAction.option === 'pass') {
      task.runtime.actionSettled()
      return
    }
    this.#accept(settledAction)
  }

  #latestSpeechBoundary(): {
    readonly sequence: number
    readonly previousSpeakerId: PlayerId | null
  } {
    const event = this.#options.engine.events.findLast(
      (candidate) =>
        candidate.payload.type === 'phase.changed' || candidate.payload.type === 'speech.committed',
    )
    return {
      sequence: event?.sequence ?? 0,
      previousSpeakerId: event?.payload.type === 'speech.committed' ? event.payload.playerId : null,
    }
  }

  #newWinnerPromise(): Promise<InterruptAction> {
    return new Promise((resolve) => {
      this.#resolveWinner = resolve
    })
  }
}
