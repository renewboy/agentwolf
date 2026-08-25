import type { AbilityId, TriggerId } from '@agentwolf/contracts'
import type { RoleRegistry } from '../roles/registry.js'
import type { BoardManifest, GameState, PlayerState } from '../types.js'
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

export class TriggerRegistry {
  readonly #decisionTriggers: DecisionTriggerDefinition[] = []

  public constructor(private readonly ownership?: SemanticOwnershipRecorder) {}

  public registerDecision(trigger: DecisionTriggerDefinition): void {
    if (this.#decisionTriggers.some((entry) => entry.id === trigger.id)) {
      throw new Error(`Duplicate decision trigger ${trigger.id}`)
    }
    this.ownership?.trigger(trigger.id)
    this.#decisionTriggers.push(trigger)
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
          roles.canUseAbility(actor, trigger.abilityId) &&
          trigger.eligible({ state, board, roles, actor }),
      )
      .map((trigger) => trigger.abilityId)
  }
}
