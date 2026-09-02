import type { AbilityId, PlayerId, RoleId } from '@agentwolf/contracts'
import type { RoleRegistry } from '../roles/registry.js'
import type { VictoryContext } from './victory-registry.js'

export type WolfControlKind = 'none' | 'shared-faction' | 'isolated'

export interface EndgameRoleTraits {
  readonly hunterShot?: boolean
  readonly witchPotions?: boolean
  readonly nightProtection?: 'repeatable' | 'no-consecutive-target' | 'single-use'
  readonly exilePrevention?: boolean
}

export interface WerewolfProofPreparation {
  readonly activeRoleIds: readonly RoleId[]
  readonly hunterShotWolfLoss: number
}

export interface EndgameRoleModel {
  readonly roleId: RoleId
  readonly wolfControl: WolfControlKind
  readonly materialAbilityIds: readonly AbilityId[]
  readonly traits?: EndgameRoleTraits
  canControlWerewolfProof?(context: VictoryContext, playerId: PlayerId): boolean
  prepareWerewolfProof?(
    context: VictoryContext,
    controlledPlayerIds: ReadonlySet<PlayerId>,
    current: WerewolfProofPreparation,
  ): WerewolfProofPreparation | null
}

export class EndgameRegistry {
  readonly #models = new Map<RoleId, EndgameRoleModel>()

  public registerRole(model: EndgameRoleModel): void {
    if (this.#models.has(model.roleId)) {
      throw new Error(`Duplicate endgame model for ${model.roleId}`)
    }
    this.#models.set(model.roleId, model)
  }

  public model(roleId: RoleId): EndgameRoleModel | null {
    return this.#models.get(roleId) ?? null
  }

  public validate(roles: RoleRegistry): void {
    const knownRoleIds = new Set(roles.list().map((role) => role.id))
    for (const role of roles.list()) {
      const model = this.#models.get(role.id)
      const materialAbilityIds = role.abilities
        .filter((ability) => ability.endgameImpact === 'material')
        .map((ability) => ability.id)
        .sort()
      if (role.endgameModel === 'inert') {
        if (model) throw new Error(`Inert role ${role.id} cannot register an endgame model`)
        if (materialAbilityIds.length > 0) {
          throw new Error(`Inert role ${role.id} has material endgame abilities`)
        }
      } else {
        if (!model) throw new Error(`Role ${role.id} requires an endgame model`)
        const modeledAbilityIds = [...new Set(model.materialAbilityIds)].sort()
        if (
          materialAbilityIds.length !== modeledAbilityIds.length ||
          materialAbilityIds.some((abilityId, index) => abilityId !== modeledAbilityIds[index])
        ) {
          throw new Error(`Role ${role.id} endgame material ability coverage is incomplete`)
        }
      }
      for (const ability of role.abilities) {
        const batchedNightAbility =
          ability.actionTypes.includes('night-action') && ability.resolutionTiming !== 'phase'
        if (batchedNightAbility && !ability.nightResolutionStage) {
          throw new Error(`Role ${role.id} night ability ${ability.id} requires a resolution stage`)
        }
        if (ability.nightAttack && ability.nightResolutionStage !== 'wolf-priority') {
          throw new Error(`Night attack ${ability.id} must resolve in the wolf-priority stage`)
        }
      }
    }
    for (const roleId of this.#models.keys()) {
      if (!knownRoleIds.has(roleId))
        throw new Error(`Endgame model references unknown role ${roleId}`)
    }
  }

  public list(): readonly EndgameRoleModel[] {
    return [...this.#models.values()]
  }
}
