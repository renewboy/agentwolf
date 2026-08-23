import type {
  EventVisibility,
  GameEvent,
  GameEventPayload,
  PhaseId,
  PlayerId,
} from '@agentwolf/contracts'
import type { BoardManifest, GameState } from './types.js'
import type { RoleRegistry } from './roles/registry.js'

export interface RuleRuntime {
  readonly state: GameState
  readonly board: BoardManifest
  readonly events: readonly GameEvent[]
  readonly roles: RoleRegistry
  append(payload: GameEventPayload, visibility: EventVisibility): GameEvent
}

export type ActorSelector = (runtime: RuleRuntime) => readonly PlayerId[]
export type RulePredicate = (runtime: RuleRuntime) => boolean
export type PhaseCompletionHandler = (runtime: RuleRuntime) => void

export class RuleRegistry {
  readonly #actors = new Map<string, ActorSelector>()
  readonly #predicates = new Map<string, RulePredicate>()
  readonly #phaseHandlers = new Map<PhaseId, PhaseCompletionHandler>()

  public registerActorSelector(name: string, selector: ActorSelector): void {
    if (this.#actors.has(name)) throw new Error(`Duplicate actor selector ${name}`)
    this.#actors.set(name, selector)
  }

  public registerPredicate(name: string, predicate: RulePredicate): void {
    if (this.#predicates.has(name)) throw new Error(`Duplicate rule predicate ${name}`)
    this.#predicates.set(name, predicate)
  }

  public registerPhaseHandler(phaseId: PhaseId, handler: PhaseCompletionHandler): void {
    if (this.#phaseHandlers.has(phaseId)) throw new Error(`Duplicate phase handler ${phaseId}`)
    this.#phaseHandlers.set(phaseId, handler)
  }

  public selectActors(name: string | undefined, runtime: RuleRuntime): readonly PlayerId[] {
    if (!name) return []
    const dynamicRole = name.match(/^role:(role-[a-z0-9-]+)$/)?.[1]
    if (dynamicRole) {
      return [...runtime.state.players.values()]
        .filter((player) => player.alive && player.roleId === dynamicRole)
        .sort((left, right) => left.seat - right.seat)
        .map((player) => player.id)
    }
    const dynamicFaction = name.match(/^faction-alive:(village|werewolf|independent)$/)?.[1]
    if (dynamicFaction) {
      return [...runtime.state.players.values()]
        .filter((player) => player.alive && player.faction === dynamicFaction)
        .sort((left, right) => left.seat - right.seat)
        .map((player) => player.id)
    }
    const selector = this.#actors.get(name)
    if (!selector) throw new Error(`Unknown actor selector ${name}`)
    return selector(runtime)
  }

  public evaluate(name: string | undefined, runtime: RuleRuntime): boolean {
    if (!name) return true
    const dynamicRole = name.match(/^role-alive:(role-[a-z0-9-]+)$/)?.[1]
    if (dynamicRole) {
      return [...runtime.state.players.values()].some(
        (player) => player.alive && player.roleId === dynamicRole,
      )
    }
    const predicate = this.#predicates.get(name)
    if (!predicate) throw new Error(`Unknown rule predicate ${name}`)
    return predicate(runtime)
  }

  public complete(phaseId: PhaseId, runtime: RuleRuntime): void {
    this.#phaseHandlers.get(phaseId)?.(runtime)
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
