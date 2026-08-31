import {
  CapabilityIdSchema,
  type CapabilityId,
  type EventVisibility,
  type GameEvent,
  type GameEventPayload,
  type PhaseId,
  type PlayerAction,
  type PlayerId,
} from '@agentwolf/contracts'
import type { BoardManifest, GameState, PhaseNode } from './types.js'
import type { RoleRegistry } from './roles/registry.js'
import type { ResolutionRegistry } from './plugins/resolution-registry.js'
import type { VictoryRegistry } from './plugins/victory-registry.js'
import type { QueryRegistry } from './plugins/query-registry.js'
import type { TriggerRegistry } from './plugins/trigger-registry.js'
import type { DeterministicIndexResolver } from './deterministic.js'

export interface RuleRuntime {
  readonly state: GameState
  readonly board: BoardManifest
  readonly events: readonly GameEvent[]
  readonly roles: RoleRegistry
  readonly resolution: ResolutionRegistry
  readonly victories: VictoryRegistry
  readonly queries: QueryRegistry
  readonly triggers: TriggerRegistry
  readonly deterministicIndex?: DeterministicIndexResolver
  append(payload: GameEventPayload, visibility: EventVisibility): GameEvent
}

export type ActorSelector = (runtime: RuleRuntime) => readonly PlayerId[]
export type RulePredicate = (runtime: RuleRuntime) => boolean
export type PhaseCompletionHandler = (runtime: RuleRuntime) => void
export type ActionValidator = (node: PhaseNode, action: PlayerAction, runtime: RuleRuntime) => void

export interface PhaseHandlerOptions {
  readonly id?: string
  readonly order?: number
}

interface RegisteredPhaseHandler {
  readonly id: string
  readonly order: number
  readonly sequence: number
  readonly handler: PhaseCompletionHandler
}

interface RegisteredActionValidator {
  readonly id: string
  readonly order: number
  readonly sequence: number
  readonly validate: ActionValidator
}

export class RuleRegistry {
  readonly #actors = new Map<string, ActorSelector>()
  readonly #predicates = new Map<string, RulePredicate>()
  readonly #phaseHandlers = new Map<PhaseId, RegisteredPhaseHandler[]>()
  readonly #actionValidators: RegisteredActionValidator[] = []
  #phaseHandlerSequence = 0
  #actionValidatorSequence = 0

  public registerActorSelector(name: string, selector: ActorSelector): void {
    if (this.#actors.has(name)) throw new Error(`Duplicate actor selector ${name}`)
    this.#actors.set(name, selector)
  }

  public registerPredicate(name: string, predicate: RulePredicate): void {
    if (this.#predicates.has(name)) throw new Error(`Duplicate rule predicate ${name}`)
    this.#predicates.set(name, predicate)
  }

  public registerPhaseHandler(
    phaseId: PhaseId,
    handler: PhaseCompletionHandler,
    options: PhaseHandlerOptions = {},
  ): void {
    const handlers = this.#phaseHandlers.get(phaseId) ?? []
    const id = options.id ?? `${phaseId}:handler-${handlers.length + 1}`
    if (handlers.some((entry) => entry.id === id)) {
      throw new Error(`Duplicate phase handler ${id} for ${phaseId}`)
    }
    handlers.push({
      id,
      order: options.order ?? 0,
      sequence: ++this.#phaseHandlerSequence,
      handler,
    })
    this.#phaseHandlers.set(phaseId, handlers)
  }

  public registerActionValidator(
    id: string,
    validate: ActionValidator,
    options: { readonly order?: number } = {},
  ): void {
    if (this.#actionValidators.some((entry) => entry.id === id)) {
      throw new Error(`Duplicate action validator ${id}`)
    }
    this.#actionValidators.push({
      id,
      order: options.order ?? 0,
      sequence: ++this.#actionValidatorSequence,
      validate,
    })
  }

  public selectActors(name: string | undefined, runtime: RuleRuntime): readonly PlayerId[] {
    if (!name) return []
    const dynamicFaction = name.match(/^faction-alive:(village|werewolf|independent)$/)?.[1]
    if (dynamicFaction) {
      return [...runtime.state.players.values()]
        .filter((player) => player.alive && player.faction === dynamicFaction)
        .sort((left, right) => left.seat - right.seat)
        .map((player) => player.id)
    }
    const dynamicCapability = name.match(/^(?:capability-alive:)(capability-[a-z0-9-]+)$/)?.[1]
    if (dynamicCapability) {
      const capabilityId = CapabilityIdSchema.parse(dynamicCapability) as CapabilityId
      return [...runtime.state.players.values()]
        .filter((player) => player.alive && runtime.roles.hasCapability(player, capabilityId))
        .sort((left, right) => left.seat - right.seat)
        .map((player) => player.id)
    }
    const selector = this.#actors.get(name)
    if (!selector) throw new Error(`Unknown actor selector ${name}`)
    return selector(runtime)
  }

  public evaluate(name: string | undefined, runtime: RuleRuntime): boolean {
    if (!name) return true
    const dynamicCapability = name.match(/^(?:capability-active:)(capability-[a-z0-9-]+)$/)?.[1]
    if (dynamicCapability) {
      const capabilityId = CapabilityIdSchema.parse(dynamicCapability) as CapabilityId
      return [...runtime.state.players.values()].some(
        (player) => player.alive && runtime.roles.hasCapability(player, capabilityId),
      )
    }
    const predicate = this.#predicates.get(name)
    if (!predicate) throw new Error(`Unknown rule predicate ${name}`)
    return predicate(runtime)
  }

  public complete(phaseId: PhaseId, runtime: RuleRuntime): void {
    const handlers = [...(this.#phaseHandlers.get(phaseId) ?? [])].sort(
      (left, right) => left.order - right.order || left.sequence - right.sequence,
    )
    for (const entry of handlers) entry.handler(runtime)
  }

  public validateAction(node: PhaseNode, action: PlayerAction, runtime: RuleRuntime): void {
    for (const entry of [...this.#actionValidators].sort(
      (left, right) => left.order - right.order || left.sequence - right.sequence,
    )) {
      entry.validate(node, action, runtime)
    }
  }
}

export const visibility = {
  public: { kind: 'public' } as const,
  god: { kind: 'god' } as const,
  players: (playerIds: readonly PlayerId[]): EventVisibility => ({
    kind: 'players',
    playerIds: [...playerIds],
  }),
  faction: (faction: 'village' | 'werewolf' | 'independent'): EventVisibility => ({
    kind: 'faction',
    faction,
  }),
}
