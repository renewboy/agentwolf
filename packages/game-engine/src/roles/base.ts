import type {
  AbilityId,
  CapabilityId,
  EventVisibility,
  Faction,
  GameEventPayload,
  PlayerAction,
  RoleId,
} from '@agentwolf/contracts'
import type { ActionValidationContext, ResolutionEffect, ResolutionResult } from '../types.js'

export interface AbilityOutcome {
  readonly stage: 'before-usage' | 'after-usage'
  readonly payload: GameEventPayload
  readonly visibility: EventVisibility
}

export interface AbilityDefinition {
  readonly id: AbilityId
  readonly requiredCapability?: CapabilityId
  readonly nightAttack?: boolean
  readonly actionTypes: readonly PlayerAction['type'][]
  validate(context: ActionValidationContext): void
  effects(context: ActionValidationContext): readonly ResolutionEffect[]
  outcomes?(context: ActionValidationContext, result: ResolutionResult): readonly AbilityOutcome[]
}

export abstract class Role {
  public abstract readonly id: RoleId
  public abstract readonly displayNameKey: string
  public abstract readonly faction: Faction
  public abstract readonly kind: 'villager' | 'god' | 'werewolf' | 'independent'
  public readonly sharesFactionKnowledge: boolean = false
  public readonly maximumCount?: number
  public readonly capabilities: readonly CapabilityId[] = []
  public abstract readonly abilities: readonly AbilityDefinition[]
}
