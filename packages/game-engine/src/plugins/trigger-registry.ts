import type {
  AbilityId,
  EventVisibility,
  GameEventPayload,
  PlayerId,
  TriggerId,
} from '@agentwolf/contracts'
import type { RoleRegistry } from '../roles/registry.js'
import type { BoardManifest, GameState, PlayerState, TimedDeath } from '../types.js'
import type { SemanticOwnershipRecorder } from './semantic-ownership.js'

export interface DecisionTriggerContext {
  readonly state: GameState
  readonly board: BoardManifest
  readonly roles: RoleRegistry
  readonly actor: PlayerState
}

export interface DecisionTriggerDefinition {
  readonly id: TriggerId
  readonly signal: string
  readonly abilityId: AbilityId
  eligible(context: DecisionTriggerContext): boolean
}

export interface TriggeredEvent {
  readonly payload: GameEventPayload
  readonly visibility: EventVisibility
}

export interface AutomaticDeathReactionContext {
  readonly state: GameState
  readonly board: BoardManifest
  readonly roles: RoleRegistry
  readonly death: TimedDeath
  readonly scheduledPlayerIds: ReadonlySet<PlayerId>
}

export interface AutomaticDeathReaction {
  readonly death: TimedDeath
  readonly events?: readonly TriggeredEvent[]
  readonly announcement?: 'generic' | 'events-only'
}

export interface AutomaticDeathTriggerDefinition {
  readonly id: TriggerId
  readonly signal: 'player-death'
  react(context: AutomaticDeathReactionContext): readonly AutomaticDeathReaction[]
}

export interface ResolvedDeathReaction {
  readonly death: TimedDeath
  readonly original: boolean
  readonly events: readonly TriggeredEvent[]
  readonly announcement?: 'generic' | 'events-only'
}

export class TriggerRegistry {
  readonly #decisionTriggers: DecisionTriggerDefinition[] = []
  readonly #automaticDeathTriggers: AutomaticDeathTriggerDefinition[] = []

  public constructor(private readonly ownership?: SemanticOwnershipRecorder) {}

  public registerDecision(trigger: DecisionTriggerDefinition): void {
    if (this.#decisionTriggers.some((entry) => entry.id === trigger.id)) {
      throw new Error(`Duplicate decision trigger ${trigger.id}`)
    }
    this.ownership?.trigger(trigger.id)
    this.#decisionTriggers.push(trigger)
  }

  public registerAutomaticDeath(trigger: AutomaticDeathTriggerDefinition): void {
    if (
      this.#decisionTriggers.some((entry) => entry.id === trigger.id) ||
      this.#automaticDeathTriggers.some((entry) => entry.id === trigger.id)
    ) {
      throw new Error(`Duplicate trigger ${trigger.id}`)
    }
    this.ownership?.trigger(trigger.id)
    this.#automaticDeathTriggers.push(trigger)
  }

  public abilityIdsFor(
    signal: string,
    actor: PlayerState,
    state: GameState,
    board: BoardManifest,
    roles: RoleRegistry,
  ): readonly AbilityId[] {
    return this.#decisionTriggers
      .filter(
        (trigger) =>
          trigger.signal === signal &&
          roles.hasAbility(trigger.abilityId) &&
          roles.canUseAbility(actor, trigger.abilityId) &&
          trigger.eligible({ state, board, roles, actor }),
      )
      .map((trigger) => trigger.abilityId)
  }

  public resolveDeaths(
    initialDeaths: readonly TimedDeath[],
    context: {
      readonly state: GameState
      readonly board: BoardManifest
      readonly roles: RoleRegistry
    },
  ): readonly ResolvedDeathReaction[] {
    const byPlayerId = new Map<
      PlayerId,
      {
        death: TimedDeath
        original: boolean
        events: TriggeredEvent[]
        announcement?: 'generic' | 'events-only'
      }
    >()
    const pending: PlayerId[] = []
    for (const death of initialDeaths) {
      const existing = byPlayerId.get(death.playerId)
      if (existing) {
        assertSameTiming(existing.death, death)
        existing.death = mergeDeaths(existing.death, death)
        continue
      }
      byPlayerId.set(death.playerId, { death, original: true, events: [] })
      pending.push(death.playerId)
    }

    let steps = 0
    while (pending.length > 0) {
      if (++steps > 1_000) throw new Error('Automatic death reactions exceeded 1000 steps')
      const playerId = pending.shift()!
      const current = byPlayerId.get(playerId)!
      const scheduledPlayerIds = new Set(byPlayerId.keys())
      for (const trigger of this.#automaticDeathTriggers) {
        for (const reaction of trigger.react({
          ...context,
          death: current.death,
          scheduledPlayerIds,
        })) {
          const player = context.state.players.get(reaction.death.playerId)
          if (!player)
            throw new Error(`Death reaction targets unknown player ${reaction.death.playerId}`)
          const existing = byPlayerId.get(reaction.death.playerId)
          if (existing) {
            assertSameTiming(existing.death, reaction.death)
            existing.death = mergeDeaths(existing.death, reaction.death)
            continue
          }
          if (!player.alive) continue
          byPlayerId.set(reaction.death.playerId, {
            death: reaction.death,
            original: false,
            events: [...(reaction.events ?? [])],
            ...(reaction.announcement ? { announcement: reaction.announcement } : {}),
          })
          pending.push(reaction.death.playerId)
          scheduledPlayerIds.add(reaction.death.playerId)
        }
      }
    }
    return [...byPlayerId.values()].map((entry) => ({
      death: entry.death,
      original: entry.original,
      events: entry.events,
      ...(entry.announcement ? { announcement: entry.announcement } : {}),
    }))
  }
}

function assertSameTiming(left: TimedDeath, right: TimedDeath): void {
  if (left.timing !== right.timing) {
    throw new Error(`Death ${left.playerId} has conflicting timing`)
  }
}

function mergeDeaths(left: TimedDeath, right: TimedDeath): TimedDeath {
  return {
    playerId: left.playerId,
    causes: [...new Set([...left.causes, ...right.causes])],
    timing: left.timing,
  }
}
