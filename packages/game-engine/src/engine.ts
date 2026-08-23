import {
  GameEventSchema,
  PhaseIdSchema,
  PlayerActionSchema,
  type EventVisibility,
  type GameEvent,
  type GameEventPayload,
  type PlayerAction,
  type PlayerId,
} from '@agentwolf/contracts'
import {
  expectedVoteKind,
  isSelfDestructInterrupt,
  normalizeTurnAction,
  phaseSpeechKind,
  turnActionVisibility,
  validateTurnAction,
} from './action-validator.js'
import { appendActionOutcome } from './action-outcome.js'
import { registerClassicRules } from './classic-rules.js'
import type {
  GameEngineOptions,
  GameEngineRestoreOptions,
  SubmitActionOptions,
  TurnDescriptor,
} from './engine-contracts.js'
import { assertRule } from './errors.js'
import { prepareMatchSetup } from './match-setup.js'
import { RuleRegistry, visibility, type RuleRuntime } from './rule-registry.js'
import { createV1RoleRegistry, type RoleRegistry } from './roles/registry.js'
import { emptyGameState, reduceGameEvent } from './state.js'
import type { BoardManifest, GameSnapshot, GameState, PhaseNode } from './types.js'

export class GameEngine {
  readonly #board: BoardManifest
  readonly #clock: () => Date
  readonly #roles: RoleRegistry
  readonly #rules: RuleRegistry
  readonly #events: GameEvent[] = []
  #state: GameState

  private constructor(options: GameEngineOptions, restored?: GameEngineRestoreOptions) {
    this.#board = options.board
    this.#clock = options.clock ?? (() => new Date())
    this.#roles = options.roles ?? createV1RoleRegistry()
    this.#rules = options.rules ?? new RuleRegistry()
    if (!options.rules) registerClassicRules(this.#rules)
    this.#state = emptyGameState(options.matchId, options.board)
    if (restored) {
      const events = GameEventSchema.array().parse(restored.events)
      this.#events.push(...events)
      this.#state = events.reduce(reduceGameEvent, this.#state)
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
        ...(options.roles ? { roles: options.roles } : {}),
        ...(options.rules ? { rules: options.rules } : {}),
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
    this.#append(
      { type: 'match.started', startedAt: this.#clock().toISOString() },
      visibility.public,
    )
    this.#append({ type: 'night.started', night: 1 }, visibility.public)
    this.#enterPhase(this.#board.phases.entry)
    this.#drive()
    return this.#events.slice(from)
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
    if (node.mode === 'automatic' || !node.actionType) return null
    const actors = this.expectedActors()
    const allowedAbilityIds = new Set(node.abilityId ? [node.abilityId] : [])
    if (node.actionType === 'night-action' || node.actionType === 'skill-trigger') {
      for (const actorId of actors) {
        const roleId = this.#state.players.get(actorId)?.roleId
        if (!roleId) continue
        for (const ability of this.#roles.role(roleId).abilities) {
          if (ability.actionTypes.includes(node.actionType)) allowedAbilityIds.add(ability.id)
        }
      }
    }
    return {
      phaseId: node.id,
      labelKey: node.labelKey,
      mode: node.mode,
      actionType: node.actionType,
      actors,
      ...(node.actionType === 'speech' ? { speechKind: phaseSpeechKind(node.id) } : {}),
      ...(node.actionType === 'vote' ? { voteKind: expectedVoteKind(node.id) } : {}),
      ...(node.abilityId ? { abilityId: node.abilityId } : {}),
      ...(allowedAbilityIds.size > 0 ? { allowedAbilityIds: [...allowedAbilityIds] } : {}),
    }
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
    const node = this.#validateSubmittedAction(action)
    assertRule(
      !options.deferContinuation || action.type === 'speech',
      'Only speech actions can defer phase continuation',
    )
    if (isSelfDestructInterrupt(node, action)) {
      this.#submitSelfDestruct(node, action)
      this.#drive()
      return this.#events.slice(from)
    }
    const committed = normalizeTurnAction(node, action, this.#state)
    this.#append(
      { type: 'action.submitted', playerId: action.actorId, action: committed },
      turnActionVisibility(node, committed),
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
    assertRule(this.#state.phaseId, 'Match has no active phase')
    this.#continueFromActionBoundary(this.#phaseNode(this.#state.phaseId))
    return this.#events.slice(from)
  }

  #initialize(options: GameEngineOptions): void {
    const setup = prepareMatchSetup(
      this.#board,
      options.players,
      options.roleAssignment,
      options.seed,
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

    const factionMembers = new Map<'village' | 'werewolf' | 'independent', PlayerId[]>()
    setup.players.forEach((player, index) => {
      const roleId = setup.assignments[index]!
      const role = this.#roles.role(roleId)
      this.#append(
        { type: 'role.assigned', playerId: player.id, roleId, faction: role.faction },
        visibility.players([player.id]),
      )
      const members = factionMembers.get(role.faction) ?? []
      members.push(player.id)
      factionMembers.set(role.faction, members)
    })
    const wolves = factionMembers.get('werewolf') ?? []
    this.#append(
      { type: 'faction.members', faction: 'werewolf', playerIds: wolves },
      visibility.faction('werewolf'),
    )
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
    this.#state = reduceGameEvent(this.#state, event)
    return event
  }

  #runtime(): RuleRuntime {
    return {
      state: this.#state,
      board: this.#board,
      events: this.#events,
      roles: this.#roles,
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
      visibility.public,
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

  #validateSubmittedAction(action: PlayerAction): PhaseNode {
    assertRule(this.#state.status === 'running', 'Match is not accepting actions')
    assertRule(this.#state.phaseId, 'Match has no active phase')
    const node = this.#phaseNode(this.#state.phaseId)
    this.#validateActor(node, action.actorId)
    if (isSelfDestructInterrupt(node, action)) {
      const actor = this.#state.players.get(action.actorId)
      assertRule(actor?.roleId, `Self-destruct actor ${action.actorId} has no role`)
      const entry = this.#roles.ability(action.abilityId)
      assertRule(entry.role.id === actor.roleId, `${actor.name} cannot self-destruct`)
      entry.ability.validate({ state: this.#state, board: this.#board, action, actor })
    } else {
      validateTurnAction(node, action, this.#state, this.#board, this.#roles)
    }
    return node
  }

  #submitSelfDestruct(
    node: PhaseNode,
    action: Extract<PlayerAction, { type: 'skill-trigger' }>,
  ): void {
    const actor = this.#state.players.get(action.actorId)
    assertRule(actor?.roleId, `Self-destruct actor ${action.actorId} has no role`)
    const entry = this.#roles.ability(action.abilityId)
    assertRule(entry.role.id === actor.roleId, `${actor.name} cannot self-destruct`)
    entry.ability.validate({ state: this.#state, board: this.#board, action, actor })
    this.#append({ type: 'action.submitted', playerId: actor.id, action }, visibility.public)
    const count = (actor.roleState.abilityUses[action.abilityId] ?? 0) + 1
    this.#append(
      { type: 'ability.used', playerId: actor.id, abilityId: action.abilityId, count },
      visibility.players([actor.id]),
    )
    this.#append(
      {
        type: 'player.died',
        playerId: actor.id,
        causes: ['self-destruct'],
        announced: true,
      },
      visibility.god,
    )
    this.#append(
      {
        type: 'public.announcement',
        code: 'werewolf-self-destruct',
        playerIds: [actor.id],
        params: {},
      },
      visibility.public,
    )
    this.#append({ type: 'day.interrupted', reason: 'self-destruct' }, visibility.public)
    if (
      node.id.startsWith('phase-sheriff-') &&
      this.#board.policies.sheriffExplosion === 'single-explosion-loses-badge'
    ) {
      this.#append(
        { type: 'sheriff.badge-lost', reason: 'self-destruct-during-election' },
        visibility.public,
      )
    }

    if (this.#rules.evaluate('has-winner', this.#runtime())) {
      this.#enterPhase(PhaseIdSchema.parse('phase-match-ended'))
    } else if (node.id.startsWith('phase-sheriff-')) {
      this.#enterPhase(PhaseIdSchema.parse('phase-day-announcement'))
    } else if (this.#state.sheriff.holderId === actor.id) {
      this.#enterPhase(PhaseIdSchema.parse('phase-sheriff-transfer'))
    } else {
      this.#enterPhase(PhaseIdSchema.parse('phase-last-words'))
    }
  }

  #announceActiveSpeech(node: PhaseNode): void {
    if (node.actionType !== 'speech') return
    const playerId = this.activeActor()
    if (!playerId) return
    const eventVisibility =
      node.id === 'phase-night-wolf-council' ? visibility.faction('werewolf') : visibility.public
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
      previous.kind === phaseSpeechKind(node.id)
    ) {
      return
    }
    this.#append(
      { type: 'speech.started', playerId, kind: phaseSpeechKind(node.id) },
      eventVisibility,
    )
  }
}
