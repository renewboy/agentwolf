import type { AbilityId, Faction, PlayerAction, RoleId } from '@agentwolf/contracts'
import type { ActionValidationContext, ResolutionEffect } from '../types.js'

export interface AbilityDefinition {
  readonly id: AbilityId
  readonly labelKey: string
  readonly actionTypes: readonly PlayerAction['type'][]
  validate(context: ActionValidationContext): void
  effects(context: ActionValidationContext): readonly ResolutionEffect[]
}

export abstract class Role {
  public abstract readonly id: RoleId
  public abstract readonly displayNameKey: string
  public abstract readonly publicRulesKey: string
  public abstract readonly faction: Faction
  public abstract readonly kind: 'villager' | 'god' | 'werewolf' | 'independent'
  public abstract readonly abilities: readonly AbilityDefinition[]

  public seerResult(): 'village' | 'werewolf' {
    return this.faction === 'werewolf' ? 'werewolf' : 'village'
  }
}
