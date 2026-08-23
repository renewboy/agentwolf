import { AbilityIdSchema, RoleIdSchema } from '@agentwolf/contracts'
import { assertRule } from '../errors.js'
import type { AbilityDefinition } from './base.js'
import { Role } from './base.js'
import { abilityUseCount, requireAliveTarget } from './helpers.js'

const shotAbilityId = AbilityIdSchema.parse('ability-hunter-shot')

export class HunterRole extends Role {
  public readonly id = RoleIdSchema.parse('role-hunter')
  public readonly displayNameKey = 'roles.hunter'
  public readonly publicRulesKey = 'promptContext.roleRules.hunter'
  public readonly faction = 'village' as const
  public readonly kind = 'god' as const
  public readonly abilities: readonly AbilityDefinition[] = [
    {
      id: shotAbilityId,
      labelKey: 'abilities.hunterShot',
      actionTypes: ['skill-trigger'],
      validate: (context) => {
        assertRule(context.action.type === 'skill-trigger', 'Hunter shot is a skill trigger')
        assertRule(abilityUseCount(context, shotAbilityId) === 0, 'Hunter has already fired')
        assertRule(context.action.targetId, 'Hunter shot requires a target')
        requireAliveTarget(context, context.action.targetId, { allowSelf: false })
        const death =
          context.state.pendingDeaths.get(context.actor.id) ??
          context.state.recentDeaths.get(context.actor.id)
        const eligible = death?.causes.some((cause) => cause === 'werewolf' || cause === 'exile')
        assertRule(eligible, 'Hunter can fire only after a werewolf attack or exile')
      },
      effects: (context) => {
        assertRule(context.action.type === 'skill-trigger', 'Hunter shot is a skill trigger')
        assertRule(context.action.targetId, 'Hunter shot requires a target')
        return [
          {
            kind: 'damage',
            priority: 700,
            sourceId: context.actor.id,
            targetId: context.action.targetId,
            cause: 'shot',
          },
        ]
      },
    },
  ]
}
