import { z } from 'zod'
import {
  AgentProfileIdSchema,
  GameEventSchema as AgentWolfGameEventSchema,
  MatchIdSchema as AgentWolfMatchIdSchema,
  PlayerActionSchema,
  PlayerIdSchema,
  RoleIdSchema,
  type Faction,
  type GameEvent as AgentWolfGameEvent,
  type PlayerAction,
} from '@agentwolf/contracts'
import {
  DecisionIdSchema,
  GameActionSchema,
  GameEventSchema,
  GameIdSchema,
  GroupIdSchema,
  MatchIdSchema,
  ObservationRevisionSchema,
  ParticipantIdSchema,
  RulesetLockSchema,
  SemanticIdSchema,
  type GameAction,
  type GameEvent,
  type JsonValue,
  type MatchId,
  type Observer,
  type ParticipantId,
} from '@agent-arena/contracts'
import {
  validateDecisionAction,
  validateDecisionBatch,
  type DecisionBoundary,
  type GameMachine,
  type GameModule,
  type GameObservation,
} from '@agent-arena/game-runtime'
import { GameEngine } from './engine.js'
import type { TurnDescriptor } from './engine-contracts.js'
import { lockRulesetRuntime, type RulesetRuntime } from './plugins/ruleset.js'
import type { BoardManifest, GameState } from './types.js'
import { visibleEvents } from './visibility.js'

const AgentWolfArenaSetupSchema = z
  .object({
    players: z.array(
      z
        .object({
          id: PlayerIdSchema,
          seat: z.number().int().positive(),
          name: z.string().min(1),
          profileId: AgentProfileIdSchema,
          roleId: RoleIdSchema.optional(),
        })
        .strict(),
    ),
    roleAssignment: z.enum(['random', 'manual']),
    start: z.boolean().default(true),
  })
  .strict()

export type AgentWolfArenaSetup = z.infer<typeof AgentWolfArenaSetupSchema>

export interface AgentWolfArenaFacts {
  readonly status: GameState['status']
  readonly phaseId: string | null
  readonly day: number
  readonly night: number
  readonly visibleEvents: readonly GameEvent[]
}

export interface AgentWolfArenaOutcome extends Record<string, JsonValue> {
  readonly status: GameState['status']
  readonly winner: Faction | null
  readonly winningParticipantIds: string[]
}

const CorePlayerActionPayloadSchema = z
  .json()
  .transform((value) => JSON.parse(JSON.stringify(PlayerActionSchema.parse(value))) as JsonValue)

export class AgentWolfGameModule implements GameModule<
  AgentWolfArenaSetup,
  GameState,
  AgentWolfArenaFacts,
  AgentWolfArenaOutcome
> {
  public readonly id = GameIdSchema.parse('game-agentwolf')
  public readonly setupSchema = AgentWolfArenaSetupSchema
  public readonly outcomeSchema = z
    .object({
      status: z.enum(['draft', 'starting', 'running', 'paused', 'ended']),
      winner: z.enum(['village', 'werewolf', 'independent']).nullable(),
      winningParticipantIds: z.array(z.string()),
    })
    .strict()
  public readonly ruleset

  public constructor(
    public readonly board: BoardManifest,
    public readonly runtime: RulesetRuntime,
  ) {
    this.ruleset = RulesetLockSchema.parse(lockRulesetRuntime(runtime))
  }

  public create(options: {
    readonly matchId: MatchId
    readonly setup: AgentWolfArenaSetup
    readonly seed: number
    readonly clock?: () => Date
  }): AgentWolfGameMachine {
    const setup = this.setupSchema.parse(options.setup)
    const engine = GameEngine.create({
      matchId: AgentWolfMatchIdSchema.parse(options.matchId),
      board: this.board,
      players: setup.players.map((player) => ({
        id: player.id,
        seat: player.seat,
        name: player.name,
        profileId: player.profileId,
        ...(player.roleId ? { roleId: player.roleId } : {}),
      })),
      roleAssignment: setup.roleAssignment,
      seed: options.seed,
      ruleset: this.runtime,
      ...(options.clock ? { clock: options.clock } : {}),
    })
    if (setup.start) engine.start()
    return this.wrap(engine)
  }

  public restore(options: {
    readonly matchId: MatchId
    readonly setup: AgentWolfArenaSetup
    readonly events: readonly GameEvent[]
    readonly clock?: () => Date
  }): AgentWolfGameMachine {
    this.setupSchema.parse(options.setup)
    const events = options.events.map(agentWolfEvent)
    const lifecycle = restoredLifecycle(events)
    return this.wrap(
      GameEngine.restore({
        matchId: AgentWolfMatchIdSchema.parse(options.matchId),
        board: this.board,
        events,
        status: lifecycle.status,
        pausedReason: lifecycle.pausedReason,
        ruleset: this.runtime,
        ...(options.clock ? { clock: options.clock } : {}),
      }),
    )
  }

  public wrap(engine: GameEngine): AgentWolfGameMachine {
    return new AgentWolfGameMachine(engine)
  }

  public observe(
    machine: AgentWolfGameMachine,
    observer: Observer,
  ): GameObservation<AgentWolfArenaFacts> {
    const visible =
      observer.kind === 'host'
        ? machine.engine.events
        : observer.kind === 'spectator'
          ? visibleEvents(machine.engine.events, { kind: 'closed-eye' }, machine.engine.state)
          : visibleEvents(
              machine.engine.events,
              {
                kind: 'player',
                playerId: PlayerIdSchema.parse(observer.participantId),
              },
              machine.engine.state,
            )
    return {
      revision: ObservationRevisionSchema.parse(arenaDecisionRevision(machine.engine.events)),
      observer,
      visibleEventSequences: visible.map((event) => event.sequence),
      facts: {
        status: machine.engine.state.status,
        phaseId: machine.engine.state.phaseId,
        day: machine.engine.state.day,
        night: machine.engine.state.night,
        visibleEvents: visible.map(coreEvent),
      },
    }
  }

  public groups(machine: AgentWolfGameMachine): ReadonlyMap<string, ReadonlySet<ParticipantId>> {
    const groups = new Map<string, Set<ParticipantId>>()
    for (const player of machine.engine.state.players.values()) {
      if (!player.faction) continue
      const groupId = groupForFaction(player.faction)
      const members = groups.get(groupId) ?? new Set<ParticipantId>()
      members.add(ParticipantIdSchema.parse(player.id))
      groups.set(groupId, members)
    }
    return groups
  }
}

export class AgentWolfGameMachine implements GameMachine<GameState, AgentWolfArenaOutcome> {
  readonly #originalEvents: AgentWolfGameEvent[] = []

  public constructor(public readonly engine: GameEngine) {}

  public get matchId(): MatchId {
    return MatchIdSchema.parse(this.engine.state.matchId)
  }

  public get state(): GameState {
    return this.engine.state
  }

  public get events(): readonly GameEvent[] {
    return this.engine.events.map(coreEvent)
  }

  public get outcome(): AgentWolfArenaOutcome | null {
    if (this.engine.state.status !== 'ended') return null
    return {
      status: this.engine.state.status,
      winner: this.engine.state.winner,
      winningParticipantIds: [...this.engine.state.winningPlayerIds],
    }
  }

  public currentDecision(): DecisionBoundary | null {
    const turn = this.engine.currentTurn()
    return turn
      ? coreBoundary(turn, arenaDecisionRevision(this.engine.events), this.engine.state.matchId)
      : null
  }

  public validate(input: GameAction): GameAction {
    const boundary = this.currentDecision()
    if (!boundary) throw new Error('AgentWolf Match has no active decision')
    const action = validateDecisionAction(boundary, GameActionSchema.parse(input))
    const playerAction = playerActionFor(action)
    this.engine.validateAction(playerAction)
    return action
  }

  public submit(inputs: readonly GameAction[]): readonly GameEvent[] {
    const boundary = this.currentDecision()
    if (!boundary) throw new Error('AgentWolf Match has no active decision')
    const actions = validateDecisionBatch(boundary, inputs)
    const playerActions = actions.map((action) => playerActionFor(action))
    for (const action of playerActions) this.engine.validateAction(action)
    const phaseId = this.engine.state.phaseId
    const emitted: AgentWolfGameEvent[] = []
    for (const action of playerActions) {
      if (this.engine.state.phaseId !== phaseId) break
      emitted.push(...this.engine.submit(action))
    }
    this.#originalEvents.push(...emitted)
    return emitted.map(coreEvent)
  }

  public takeOriginalEvents(): readonly AgentWolfGameEvent[] {
    return this.#originalEvents.splice(0)
  }
}

export function coreActionFor(boundary: DecisionBoundary, action: PlayerAction): GameAction {
  return GameActionSchema.parse({
    matchId: MatchIdSchema.parse(action.matchId),
    decisionId: boundary.id,
    actorId: ParticipantIdSchema.parse(action.actorId),
    actionType: SemanticIdSchema.parse(action.type),
    payload: action,
  })
}

function coreBoundary(
  turn: TurnDescriptor,
  revision: number,
  matchId: ReturnType<typeof AgentWolfMatchIdSchema.parse>,
): DecisionBoundary {
  const actors = turn.mode === 'sequential' ? turn.actors.slice(0, 1) : turn.actors
  return {
    id: DecisionIdSchema.parse(
      `decision-${turn.phaseId}-${revision}-${actors.map((actor) => actor.replace('player-', 'p')).join('-')}`,
    ),
    kind: SemanticIdSchema.parse(turn.phaseId),
    mode: turn.mode === 'parallel' ? 'barrier' : 'single',
    observationRevision: ObservationRevisionSchema.parse(revision),
    actors: actors.map((actorId) => ({
      participantId: ParticipantIdSchema.parse(actorId),
      actions: [
        {
          actionType: SemanticIdSchema.parse(turn.actionType),
          toolName: 'submit_action',
          inputMode: turn.actionType === 'speech' ? 'text' : 'structured',
          schema: CorePlayerActionPayloadSchema,
          ...(turn.actionType === 'speech'
            ? {
                textInput: (text: string) =>
                  CorePlayerActionPayloadSchema.parse({
                    type: 'speech',
                    matchId,
                    actorId,
                    kind: turn.speechKind,
                    text,
                  }),
              }
            : {}),
        },
        ...(turn.interruptAbilityIds?.length && turn.actionType !== 'skill-trigger'
          ? [
              {
                actionType: SemanticIdSchema.parse('skill-trigger'),
                toolName: 'submit_interrupt',
                inputMode: 'structured' as const,
                schema: CorePlayerActionPayloadSchema,
              },
            ]
          : []),
      ],
    })),
  }
}

function playerActionFor(action: GameAction): PlayerAction {
  const parsed = PlayerActionSchema.parse(action.payload)
  if (
    String(parsed.matchId) !== String(action.matchId) ||
    String(parsed.actorId) !== String(action.actorId) ||
    parsed.type !== action.actionType
  ) {
    throw new Error(`Core action ${action.actionType} does not match AgentWolf payload`)
  }
  return parsed
}

function coreEvent(input: AgentWolfGameEvent): GameEvent {
  return GameEventSchema.parse({
    matchId: MatchIdSchema.parse(input.matchId),
    sequence: input.sequence,
    occurredAt: input.occurredAt,
    eventType: SemanticIdSchema.parse(input.payload.type),
    schemaVersion: input.payload.type === 'plugin.event' ? input.payload.schemaVersion : 1,
    audience:
      input.visibility.kind === 'public'
        ? { kind: 'public' }
        : input.visibility.kind === 'god'
          ? { kind: 'host' }
          : input.visibility.kind === 'players'
            ? {
                kind: 'participants',
                participantIds: input.visibility.playerIds.map((id) =>
                  ParticipantIdSchema.parse(id),
                ),
              }
            : { kind: 'group', groupId: groupForFaction(input.visibility.faction) },
    payload: input.payload,
  })
}

function agentWolfEvent(input: GameEvent): AgentWolfGameEvent {
  const payload = AgentWolfGameEventSchema.shape.payload.parse(input.payload)
  if (payload.type !== input.eventType) {
    throw new Error(`Core event ${input.eventType} does not match AgentWolf payload`)
  }
  return AgentWolfGameEventSchema.parse({
    matchId: AgentWolfMatchIdSchema.parse(input.matchId),
    sequence: input.sequence,
    occurredAt: input.occurredAt,
    visibility:
      input.audience.kind === 'public'
        ? { kind: 'public' }
        : input.audience.kind === 'host'
          ? { kind: 'god' }
          : input.audience.kind === 'participants'
            ? {
                kind: 'players',
                playerIds: input.audience.participantIds.map((id) => PlayerIdSchema.parse(id)),
              }
            : { kind: 'faction', faction: factionForGroup(input.audience.groupId) },
    payload,
  })
}

function groupForFaction(faction: Faction) {
  return GroupIdSchema.parse(`group-faction-${faction}`)
}

function factionForGroup(groupId: string): Faction {
  const faction = groupId.replace('group-faction-', '')
  if (faction === 'village' || faction === 'werewolf' || faction === 'independent') return faction
  throw new Error(`Unknown AgentWolf faction group ${groupId}`)
}

function restoredLifecycle(events: readonly AgentWolfGameEvent[]): {
  status: GameState['status']
  pausedReason: string | null
} {
  let status: GameState['status'] = 'draft'
  let pausedReason: string | null = null
  for (const event of events) {
    switch (event.payload.type) {
      case 'match.starting':
        status = 'starting'
        break
      case 'match.started':
      case 'match.resumed':
        status = 'running'
        pausedReason = null
        break
      case 'match.paused':
        status = 'paused'
        pausedReason = event.payload.reason
        break
      case 'match.ended':
        status = 'ended'
        pausedReason = null
        break
      default:
        break
    }
  }
  return { status, pausedReason }
}

function arenaDecisionRevision(events: readonly AgentWolfGameEvent[]): number {
  return (
    events.findLast(
      (event) =>
        event.payload.type !== 'delivery.started' && event.payload.type !== 'delivery.acknowledged',
    )?.sequence ?? 0
  )
}
