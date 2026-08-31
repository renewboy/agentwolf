import {
  GameEventSchema,
  PhaseIdSchema,
  PlayerActionSchema,
  type AbilityId,
  type EventVisibility,
  type GameEvent,
  type GameEventPayload,
  type PlayerAction,
  type PlayerId,
} from '@agentwolf/contracts'
import {
  expectedVoteKind,
  normalizeTurnAction,
  phaseActionVisibility,
  phaseInterruptAbilityIdsForActor,
  phaseInterruptForAction,
  phaseAbilityIdsForActor,
  phaseSpeechKind,
  turnActionVisibility,
  validateTurnAction,
} from './action-validator.js'
import { appendActionOutcome } from './action-outcome.js'
import { appendAutomaticDeathAnnouncements, resolveDeathBatch } from './death-resolution.js'
import type {
  GameEngineOptions,
  GameEngineRestoreOptions,
  SubmitActionOptions,
  TurnDescriptor,
} from './engine-contracts.js'
import { assertRule } from './errors.js'
import {
  deterministicIndex as defaultDeterministicIndex,
  type DeterministicIndexResolver,
} from './deterministic.js'
import { prepareMatchSetup } from './match-setup.js'
import { appendFactionKnowledge } from './faction-knowledge.js'
import { appendAbilityOutcomes, effectsForActions } from './resolution.js'
import { RuleRegistry, visibility, type RuleRuntime } from './rule-registry.js'
import type { RoleRegistry } from './roles/registry.js'
import { RulesetRuntime } from './plugins/ruleset.js'
import { createClassicRuleset } from './rulesets/classic/ruleset.js'
import { emptyGameState, reduceGameEvent } from './state.js'
import type {
  BoardManifest,
  GameSnapshot,
  GameState,
  PhaseInterruptDefinition,
  PhaseNode,
} from './types.js'

export class GameEngine {
  readonly #board: BoardManifest
  readonly #clock: () => Date
  readonly #roles: RoleRegistry
  readonly #rules: RuleRegistry
  readonly #ruleset: RulesetRuntime
  readonly #events: GameEvent[] = []
  readonly #deterministicIndex: DeterministicIndexResolver
  #state: GameState

  private constructor(options: GameEngineOptions, restored?: GameEngineRestoreOptions) {
    this.#clock = options.clock ?? (() => new Date())
    this.#deterministicIndex = options.deterministicIndex ?? defaultDeterministicIndex
    const defaultRuleset = options.ruleset ?? createClassicRuleset()
    this.#ruleset =
      options.roles || options.rules
        ? new RulesetRuntime(
            defaultRuleset.id,
            defaultRuleset.revision,
            defaultRuleset.plugins,
            options.roles ?? defaultRuleset.roles,
            options.rules ?? defaultRuleset.rules,
            defaultRuleset.resolution,
            defaultRuleset.victories,
            defaultRuleset.interrupts,
            defaultRuleset.events,
            defaultRuleset.phases,
            defaultRuleset.queries,
            defaultRuleset.triggers,
            defaultRuleset.deals,
            defaultRuleset.contributions,
          )
        : defaultRuleset
    this.#board = { ...options.board, phases: this.#ruleset.phases }
    this.#roles = this.#ruleset.roles
    this.#rules = this.#ruleset.rules
    this.#state = emptyGameState(options.matchId, this.#board)
    if (restored) {
      const events = GameEventSchema.array().parse(restored.events)
      this.#events.push(...events)
      this.#state = events.reduce(
        (state, event) => reduceGameEvent(state, event, this.#ruleset.events),
        this.#state,
      )
      this.#state = {
        ...this.#state,
        status: restored.status,
        pausedReason: restored.pausedReason,
      }
    } else {
      this.#initialize(options)
    }
  }
  public static create(options: GameEngineOptions): GameEngine {
    return new GameEngine(options)
  }
  public static restore(options: GameEngineRestoreOptions): GameEngine {
    return new GameEngine(
      {
        matchId: options.matchId,
        board: options.board,
        players: [],
        roleAssignment: 'manual',
        seed: 0,
        ...(options.clock ? { clock: options.clock } : {}),
        ...(options.ruleset ? { ruleset: options.ruleset } : {}),
        ...(options.roles ? { roles: options.roles } : {}),
        ...(options.rules ? { rules: options.rules } : {}),
        ...(options.deterministicIndex ? { deterministicIndex: options.deterministicIndex } : {}),
      },
      options,
    )
  }
  public get state(): GameState {
    return this.#state
  }
  public get events(): readonly GameEvent[] {
    return this.#events
  }
  public snapshot(): GameSnapshot {
    return { state: this.#state, events: [...this.#events] }
  }

  public start(): readonly GameEvent[] {
    assertRule(
      this.#state.status === 'draft' || this.#state.status === 'starting',
      'Only a draft or starting match can start',
    )
    const from = this.#events.length
    this.#beginMatch()
    return this.#events.slice(from)
  }

  #beginMatch(): void {
    this.#append(
      { type: 'match.started', startedAt: this.#clock().toISOString() },
      visibility.public,
    )
    this.#append({ type: 'night.started', night: 1 }, visibility.public)
    this.#enterPhase(this.#board.phases.entry)
    this.#drive()
  }

  public prepareStart(): readonly GameEvent[] {
    assertRule(this.#state.status === 'draft', 'Only a draft match can prepare to start')
    const from = this.#events.length
    this.#append({ type: 'match.starting' }, visibility.public)
    return this.#events.slice(from)
  }

  public expectedActors(): readonly PlayerId[] {
    return this.#state.phaseActors.filter((playerId) => !this.#state.completedActors.has(playerId))
  }

  public activeActor(): PlayerId | null {
    if (!this.#state.phaseId) return null
    const node = this.#phaseNode(this.#state.phaseId)
    if (node.mode !== 'sequential') return null
    return this.expectedActors()[0] ?? null
  }

  public currentTurn(): TurnDescriptor | null {
    if (this.#state.status !== 'running' || !this.#state.phaseId) return null
    const node = this.#phaseNode(this.#state.phaseId)
    const definition = node.action
    if (node.mode === 'automatic' || !definition) return null
    const actors = this.expectedActors()
    const abilityId = definition.type === 'vote' ? definition.abilityId : undefined
    const allowedAbilityIds =
      definition.type === 'night-action' || definition.type === 'skill-trigger'
        ? definition.type === 'skill-trigger' && definition.abilitySource === 'decision-trigger'
          ? actors.flatMap((playerId) => {
              const actor = this.#state.players.get(playerId)
              return actor
                ? this.#ruleset.triggers.abilityIdsFor(
                    definition.triggerSignal ?? '',
                    actor,
                    this.#state,
                    this.#board,
                    this.#roles,
                  )
                : []
            })
          : actors.flatMap((playerId) => {
              const actor = this.#state.players.get(playerId)
              return actor
                ? phaseAbilityIdsForActor(definition, actor, this.#state, this.#board, this.#roles)
                : []
            })
        : abilityId
          ? [abilityId]
          : []
    const interruptAbilityIds = [
      ...new Set(
        (node.interrupts ?? []).flatMap((interrupt) =>
          interrupt.capabilityIds.flatMap((capabilityId) =>
            this.#roles.abilityIdsForCapability(capabilityId).filter((candidate) =>
              actors.some((playerId) => {
                const actor = this.#state.players.get(playerId)
                return actor ? this.#roles.canUseAbility(actor, candidate) : false
              }),
            ),
          ),
        ),
      ),
    ]
    return {
      phaseId: node.id,
      labelKey: node.labelKey,
      mode: node.mode,
      actionType: definition.type,
      actors,
      ...(definition.type === 'speech' ? { speechKind: phaseSpeechKind(node) } : {}),
      ...(definition.type === 'vote' ? { voteKind: expectedVoteKind(node) } : {}),
      ...(abilityId ? { abilityId } : {}),
      ...(allowedAbilityIds.length > 0 ? { allowedAbilityIds } : {}),
      ...(definition.type === 'night-action' || definition.type === 'skill-trigger'
        ? { passAllowed: definition.passAllowed ?? true }
        : {}),
      ...(interruptAbilityIds.length > 0 ? { interruptAbilityIds } : {}),
      ...(definition.type === 'sheriff-action' ? { sheriffActions: [...definition.actions] } : {}),
    }
  }

  public roleCardChoicesFor(playerId: PlayerId) {
    const turn = this.currentTurn()
    if (!turn?.actors.includes(playerId)) return []
    const player = this.#state.players.get(playerId)
    if (!player) return []
    return this.#roles.roleCardChoicesFor(player, turn.allowedAbilityIds ?? [], {
      state: this.#state,
      board: this.#board,
    })
  }

  public interruptAbilityIdsFor(playerId: PlayerId): readonly AbilityId[] {
    if (this.#state.status !== 'running' || !this.#state.phaseId) return []
    const actor = this.#state.players.get(playerId)
    if (!actor) return []
    return phaseInterruptAbilityIdsForActor(
      this.#phaseNode(this.#state.phaseId),
      actor,
      this.#roles,
    )
  }

  public recordDeliveryStarted(
    playerId: PlayerId,
    deliveryId: string,
    fromSequence: number,
    toSequence: number,
  ): readonly GameEvent[] {
    const from = this.#events.length
    this.#append(
      { type: 'delivery.started', playerId, deliveryId, fromSequence, toSequence },
      visibility.god,
    )
    return this.#events.slice(from)
  }

  public recordDeliveryAcknowledged(
    playerId: PlayerId,
    deliveryId: string,
    toSequence: number,
  ): readonly GameEvent[] {
    const from = this.#events.length
    this.#append(
      { type: 'delivery.acknowledged', playerId, deliveryId, toSequence },
      visibility.god,
    )
    return this.#events.slice(from)
  }

  public validateAction(input: PlayerAction): void {
    const action = PlayerActionSchema.parse(input)
    this.#validateSubmittedAction(action)
  }

  public submit(input: PlayerAction, options: SubmitActionOptions = {}): readonly GameEvent[] {
    const from = this.#events.length
    const action = PlayerActionSchema.parse(input)
    const { node, interrupt } = this.#validateSubmittedAction(action)
    assertRule(
      !options.deferContinuation || action.type === 'speech',
      'Only speech actions can defer phase continuation',
    )
    if (interrupt) {
      assertRule(action.type === 'skill-trigger', 'An ability interrupt requires a skill trigger')
      this.#submitInterrupt(interrupt, action)
      this.#drive()
      return this.#events.slice(from)
    }
    const committed = normalizeTurnAction(node, action, this.#state)
    this.#append(
      { type: 'action.submitted', playerId: action.actorId, action: committed },
      turnActionVisibility(node, committed, this.#state),
    )
    appendActionOutcome({
      node,
      action: committed,
      state: this.#state,
      append: (payload, eventVisibility) => this.#append(payload, eventVisibility),
    })
    this.#append(
      { type: 'phase.actor-completed', phaseId: node.id, playerId: action.actorId },
      visibility.god,
    )
    if (!options.deferContinuation) this.#continueFromActionBoundary(node)
    return this.#events.slice(from)
  }

  public continueAfterDeferredAction(): readonly GameEvent[] {
    assertRule(this.#state.status === 'running', 'Match cannot continue from an action boundary')
    assertRule(this.#state.phaseId, 'Match has no active phase')
    const from = this.#events.length
    this.#continueFromActionBoundary(this.#phaseNode(this.#state.phaseId))
    return this.#events.slice(from)
  }

  public pause(reason: string, playerId?: PlayerId): readonly GameEvent[] {
    if (this.#state.status === 'ended') return []
    const from = this.#events.length
    this.#append(
      { type: 'match.paused', reason, ...(playerId ? { playerId } : {}) },
      visibility.public,
    )
    return this.#events.slice(from)
  }

  public resume(): readonly GameEvent[] {
    assertRule(this.#state.status === 'paused', 'Only a paused match can resume')
    const from = this.#events.length
    this.#append({ type: 'match.resumed' }, visibility.public)
    if (this.#state.phaseId) this.#continueFromActionBoundary(this.#phaseNode(this.#state.phaseId))
    else this.#beginMatch()
    return this.#events.slice(from)
  }

  #initialize(options: GameEngineOptions): void {
    const setup = prepareMatchSetup(
      this.#board,
      options.players,
      options.roleAssignment,
      options.seed,
      this.#roles,
      this.#ruleset.deals,
      options.manualReserveRoleIds,
    )
    this.#append(
      {
        type: 'match.created',
        boardId: this.#board.id,
        players: setup.players.map((player) => ({
          playerId: player.id,
          seat: player.seat,
          name: player.name,
          profileId: player.profileId,
        })),
      },
      visibility.public,
    )

    if (setup.reserveCards.length > 0) {
      this.#append(
        { type: 'role.cards-reserved', cards: setup.reserveCards.map((card) => ({ ...card })) },
        visibility.god,
      )
    }

    setup.players.forEach((player, index) => {
      const roleId = setup.assignments[index]!
      const role = this.#roles.role(roleId)
      this.#append(
        { type: 'role.assigned', playerId: player.id, roleId, faction: role.faction },
        visibility.players([player.id]),
      )
    })
    this.#appendFactionKnowledge()
  }

  #appendFactionKnowledge(): void {
    appendFactionKnowledge(this.#runtime())
  }

  #append(payload: GameEventPayload, eventVisibility: EventVisibility): GameEvent {
    const event = GameEventSchema.parse({
      matchId: this.#state.matchId,
      sequence: this.#state.lastSequence + 1,
      occurredAt: this.#clock().toISOString(),
      visibility: eventVisibility,
      payload,
    })
    this.#events.push(event)
    if (payload.type === 'plugin.event') {
      this.#ruleset.events.validate(payload)
    }
    this.#state = reduceGameEvent(this.#state, event, this.#ruleset.events)
    return event
  }

  #runtime(): RuleRuntime {
    const currentState = () => this.#state
    return {
      get state() {
        return currentState()
      },
      board: this.#board,
      events: this.#events,
      roles: this.#roles,
      resolution: this.#ruleset.resolution,
      victories: this.#ruleset.victories,
      queries: this.#ruleset.queries,
      triggers: this.#ruleset.triggers,
      deterministicIndex: this.#deterministicIndex,
      append: (payload, eventVisibility) => this.#append(payload, eventVisibility),
    }
  }

  #phaseNode(id: ReturnType<typeof PhaseIdSchema.parse>): PhaseNode {
    const node = this.#board.phases.nodes.get(id)
    assertRule(node, `Unknown phase ${id}`)
    return node
  }

  #enterPhase(id: ReturnType<typeof PhaseIdSchema.parse>): void {
    let target = this.#phaseNode(id)
    let skipCount = 0
    while (target.activeWhen && !this.#rules.evaluate(target.activeWhen, this.#runtime())) {
      assertRule(skipCount++ < this.#board.phases.nodes.size, 'Phase graph contains a skip loop')
      const nextId = this.#nextPhaseId(target)
      assertRule(nextId, `Inactive phase ${target.id} has no next phase`)
      target = this.#phaseNode(nextId)
    }
    this.#append(
      {
        type: 'phase.changed',
        phaseId: target.id,
        day: this.#state.day,
        labelKey: target.labelKey,
      },
      target.presentation?.visibility && target.presentation.visibility !== 'public'
        ? visibility.god
        : visibility.public,
    )
    if (target.mode !== 'automatic') {
      const playerIds = this.#rules.selectActors(target.actorSelector, this.#runtime())
      this.#append(
        {
          type: 'phase.actors-set',
          phaseId: target.id,
          playerIds: [...playerIds],
          mode: target.mode,
        },
        visibility.god,
      )
      this.#announceActiveSpeech(target)
    }
  }

  #drive(): void {
    let iterations = 0
    while (this.#state.status === 'running') {
      assertRule(iterations++ < 120, 'Phase graph did not reach an action boundary')
      assertRule(this.#state.phaseId, 'Running match has no phase')
      const node = this.#phaseNode(this.#state.phaseId)
      if (node.mode !== 'automatic' && !this.#phaseComplete()) return
      this.#rules.complete(node.id, this.#runtime())
      if (this.#state.status !== 'running') return
      const nextId = this.#nextPhaseId(node)
      if (!nextId) return
      if (nextId === this.#board.phases.entry && node.id !== this.#board.phases.entry) {
        this.#append({ type: 'night.started', night: this.#state.night + 1 }, visibility.public)
      }
      this.#enterPhase(nextId)
    }
  }

  #continueFromActionBoundary(node: PhaseNode): void {
    if (node.mode === 'sequential' && !this.#phaseComplete()) {
      this.#announceActiveSpeech(node)
    }
    this.#drive()
  }

  #nextPhaseId(node: PhaseNode): ReturnType<typeof PhaseIdSchema.parse> | null {
    let fallback: ReturnType<typeof PhaseIdSchema.parse> | null = null
    for (const edge of node.edges) {
      if (!edge.when) {
        fallback ??= edge.to
      } else if (this.#rules.evaluate(edge.when, this.#runtime())) {
        return edge.to
      }
    }
    return fallback
  }

  #phaseComplete(): boolean {
    return this.#state.phaseActors.every((playerId) => this.#state.completedActors.has(playerId))
  }

  #validateActor(node: PhaseNode, actorId: PlayerId): void {
    const actor = this.#state.players.get(actorId)
    assertRule(actor, `Unknown actor ${actorId}`)
    assertRule(this.#state.phaseActors.includes(actorId), `${actor.name} cannot act in ${node.id}`)
    assertRule(
      !this.#state.completedActors.has(actorId),
      `${actor.name} already acted in this phase`,
    )
    if (node.mode === 'sequential') {
      assertRule(this.activeActor() === actorId, `It is not ${actor.name}'s turn`)
    }
  }

  #validateSubmittedAction(action: PlayerAction): {
    readonly node: PhaseNode
    readonly interrupt: PhaseInterruptDefinition | null
  } {
    assertRule(this.#state.status === 'running', 'Match is not accepting actions')
    assertRule(this.#state.phaseId, 'Match has no active phase')
    const node = this.#phaseNode(this.#state.phaseId)
    const interrupt = phaseInterruptForAction(node, action, this.#state, this.#roles)
    if (interrupt) {
      assertRule(action.type === 'skill-trigger', 'An ability interrupt requires a skill trigger')
      const actor = this.#state.players.get(action.actorId)
      assertRule(actor?.roleId, `Interrupt actor ${action.actorId} has no role`)
      assertRule(actor.alive, `${actor.name} cannot interrupt while dead`)
      assertRule(
        this.interruptAbilityIdsFor(actor.id).includes(action.abilityId),
        `${actor.name} cannot interrupt`,
      )
      const entry = this.#roles.ability(action.abilityId)
      assertRule(
        this.#roles.canUseAbility(actor, action.abilityId),
        `${actor.name} cannot interrupt`,
      )
      assertRule(
        entry.ability.actionTypes.includes(action.type),
        `${action.abilityId} does not accept ${action.type}`,
      )
      entry.ability.validate({
        state: this.#state,
        board: this.#board,
        roles: this.#roles,
        action,
        actor,
      })
    } else {
      this.#validateActor(node, action.actorId)
      validateTurnAction(
        node,
        action,
        this.#state,
        this.#board,
        this.#roles,
        this.#ruleset.triggers,
      )
    }
    this.#rules.validateAction(node, action, this.#runtime())
    return { node, interrupt }
  }

  #submitInterrupt(
    interrupt: PhaseInterruptDefinition,
    action: Extract<PlayerAction, { type: 'skill-trigger' }>,
  ): void {
    const actor = this.#state.players.get(action.actorId)
    assertRule(actor?.roleId, `Interrupt actor ${action.actorId} has no role`)
    assertRule(this.#roles.canUseAbility(actor, action.abilityId), `${actor.name} cannot interrupt`)
    const { agenda } = effectsForActions(
      this.#state,
      this.#board,
      this.#roles,
      [action],
      this.#ruleset.resolution,
      this.#ruleset.queries,
    )
    const result = agenda.settle(this.#state, this.#board, this.#roles)
    this.#append(
      { type: 'action.submitted', playerId: actor.id, action },
      this.#interruptVisibility(interrupt, actor.id),
    )
    const count = (actor.roleState.abilityUses[action.abilityId] ?? 0) + 1
    this.#append(
      { type: 'ability.used', playerId: actor.id, abilityId: action.abilityId, count },
      visibility.players([actor.id]),
    )
    const resolvedDeaths = resolveDeathBatch(this.#runtime(), result.pendingDeaths, 'day')
    for (const { death } of resolvedDeaths) {
      this.#append(
        {
          type: 'player.died',
          playerId: death.playerId,
          causes: [...death.causes],
          announced: true,
          timing: death.timing,
        },
        visibility.god,
      )
    }
    appendAbilityOutcomes(this.#runtime(), action, result)
    appendAutomaticDeathAnnouncements(this.#runtime(), resolvedDeaths)
    const handler = this.#ruleset.interrupts.handler(interrupt.handlerId)
    for (const event of handler.events?.(this.#runtime(), interrupt, result) ?? []) {
      this.#append(event.payload, event.visibility)
    }
    this.#enterPhase(handler.nextPhase(this.#runtime(), interrupt, result))
  }

  #interruptVisibility(interrupt: PhaseInterruptDefinition, actorId: PlayerId): EventVisibility {
    if (interrupt.visibility === 'public') return visibility.public
    if (typeof interrupt.visibility === 'object') {
      return visibility.faction(interrupt.visibility.faction)
    }
    return visibility.players([actorId])
  }

  #announceActiveSpeech(node: PhaseNode): void {
    if (node.action?.type !== 'speech') return
    const playerId = this.activeActor()
    if (!playerId) return
    const eventVisibility = phaseActionVisibility(node, playerId, this.#state.phaseActors)
    const lastPhaseChange = this.#events.findLastIndex(
      (event) => event.payload.type === 'phase.changed',
    )
    const previous = this.#events
      .slice(lastPhaseChange + 1)
      .findLast(
        (event) =>
          event.payload.type === 'speech.started' || event.payload.type === 'speech.committed',
      )?.payload
    if (
      previous?.type === 'speech.started' &&
      previous.playerId === playerId &&
      previous.kind === phaseSpeechKind(node)
    ) {
      return
    }
    this.#append({ type: 'speech.started', playerId, kind: phaseSpeechKind(node) }, eventVisibility)
  }
}
