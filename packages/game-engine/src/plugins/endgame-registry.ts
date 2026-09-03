import type { AbilityId, PlayerId, RoleId } from '@agentwolf/contracts'
import { canViewEvent } from '../visibility.js'
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

export interface WerewolfRoleObservation {
  readonly observerId: PlayerId
  readonly targetId: PlayerId
  readonly roleId: RoleId
  readonly eventSequence: number
}

export interface EndgameRoleModel {
  readonly roleId: RoleId
  readonly wolfControl: WolfControlKind
  readonly materialAbilityIds: readonly AbilityId[]
  readonly knowledgeAbilityIds: readonly AbilityId[]
  readonly traits?: EndgameRoleTraits
  canControlWerewolfProof?(context: VictoryContext, playerId: PlayerId): boolean
  observeWerewolfKnowledge?(
    context: VictoryContext,
    controlledPlayerIds: ReadonlySet<PlayerId>,
  ): readonly WerewolfRoleObservation[] | null
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

  public observeWerewolfKnowledge(
    context: VictoryContext,
    controlledPlayerIds: ReadonlySet<PlayerId>,
  ): readonly WerewolfRoleObservation[] | null {
    const observations: WerewolfRoleObservation[] = []
    for (const model of this.#models.values()) {
      if (!model.observeWerewolfKnowledge) continue
      const contributed = model.observeWerewolfKnowledge(context, controlledPlayerIds)
      if (!contributed) return null
      for (const observation of contributed) {
        if (!controlledPlayerIds.has(observation.observerId)) return null
        if (context.state.players.get(observation.observerId)?.roleId !== model.roleId) return null
        const event = context.events.find(
          (candidate) => candidate.sequence === observation.eventSequence,
        )
        if (
          !event ||
          !canViewEvent(event, { kind: 'player', playerId: observation.observerId }, context.state)
        ) {
          return null
        }
        observations.push(observation)
      }
    }
    return observations.sort(
      (left, right) =>
        left.eventSequence - right.eventSequence ||
        left.observerId.localeCompare(right.observerId) ||
        left.targetId.localeCompare(right.targetId),
    )
  }

  public validate(roles: RoleRegistry): void {
    const knownRoleIds = new Set(roles.list().map((role) => role.id))
    for (const role of roles.list()) {
      const model = this.#models.get(role.id)
      const materialAbilityIds = role.abilities
        .filter((ability) => ability.endgameImpact === 'material')
        .map((ability) => ability.id)
        .sort()
      const informationAbilityIds = role.abilities
        .filter((ability) => ability.endgameImpact === 'information')
        .map((ability) => ability.id)
        .sort()
      if (role.endgameModel === 'inert') {
        if (model) throw new Error(`Inert role ${role.id} cannot register an endgame model`)
        if (materialAbilityIds.length > 0) {
          throw new Error(`Inert role ${role.id} has material endgame abilities`)
        }
        if (role.faction === 'werewolf' && informationAbilityIds.length > 0) {
          throw new Error(`Werewolf role ${role.id} with information abilities requires a model`)
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
        const knowledgeAbilityIds = model.knowledgeAbilityIds
        const uniqueKnowledgeAbilityIds = [...new Set(knowledgeAbilityIds)].sort()
        if (knowledgeAbilityIds.length !== uniqueKnowledgeAbilityIds.length) {
          throw new Error(`Role ${role.id} repeats an endgame knowledge ability`)
        }
        const roleAbilities = new Map(role.abilities.map((ability) => [ability.id, ability]))
        for (const abilityId of uniqueKnowledgeAbilityIds) {
          const ability = roleAbilities.get(abilityId)
          if (!ability || ability.endgameImpact === 'none') {
            throw new Error(`Role ${role.id} has an invalid endgame knowledge ability ${abilityId}`)
          }
        }
        const modeledInformationAbilityIds = uniqueKnowledgeAbilityIds.filter(
          (abilityId) => roleAbilities.get(abilityId)?.endgameImpact === 'information',
        )
        if (
          informationAbilityIds.length !== modeledInformationAbilityIds.length ||
          informationAbilityIds.some(
            (abilityId, index) => abilityId !== modeledInformationAbilityIds[index],
          )
        ) {
          throw new Error(`Role ${role.id} endgame information ability coverage is incomplete`)
        }
        if (uniqueKnowledgeAbilityIds.length > 0 && !model.observeWerewolfKnowledge) {
          throw new Error(`Role ${role.id} endgame knowledge abilities require an observer`)
        }
        if (uniqueKnowledgeAbilityIds.length === 0 && model.observeWerewolfKnowledge) {
          throw new Error(`Role ${role.id} endgame knowledge observer has no abilities`)
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
