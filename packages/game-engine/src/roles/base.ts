import type {
  AbilityId,
  CapabilityId,
  EventVisibility,
  Faction,
  GameEventPayload,
  PlayerAction,
  RoleCard,
  RoleCardId,
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
  readonly endgameImpact: 'none' | 'information' | 'material'
  readonly nightResolutionStage?: 'wolf-priority' | 'post-wolf-priority'
  readonly requiredCapability?: CapabilityId
  readonly nightAttack?: boolean
  readonly resolutionTiming?: 'night-batch' | 'phase'
  readonly actionTypes: readonly PlayerAction['type'][]
  roleCardChoices?(context: {
    readonly state: ActionValidationContext['state']
    readonly board: ActionValidationContext['board']
    readonly roles: ActionValidationContext['roles']
    readonly actor: ActionValidationContext['actor']
  }): readonly {
    readonly card: RoleCard
    readonly selectable: boolean
    readonly reason?: string
  }[]
  validate(context: ActionValidationContext): void
  effects(context: ActionValidationContext): readonly ResolutionEffect[]
  outcomes?(context: ActionValidationContext, result: ResolutionResult): readonly AbilityOutcome[]
}

export interface RoleCardChoice {
  readonly abilityId: AbilityId
  readonly cardId: RoleCardId
  readonly roleId: RoleId
  readonly selectable: boolean
  readonly reason?: string
}

export abstract class Role {
  public abstract readonly id: RoleId
  public abstract readonly displayNameKey: string
  public abstract readonly faction: Faction
  public abstract readonly kind: 'villager' | 'god' | 'werewolf' | 'independent'
  public abstract readonly endgameModel: 'inert' | 'plugin'
  public readonly sharesFactionKnowledge: boolean = false
  public readonly maximumCount?: number
  public readonly requiredReserveCount?: number
  public readonly capabilities: readonly CapabilityId[] = []
  public abstract readonly abilities: readonly AbilityDefinition[]
}
