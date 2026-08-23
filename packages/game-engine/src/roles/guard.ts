import { AbilityIdSchema, RoleIdSchema } from '@agentwolf/contracts'
import { assertRule } from '../errors.js'
import type { AbilityDefinition } from './base.js'
import { Role } from './base.js'
import { requireAliveTarget, requireTargetCount } from './helpers.js'

const protectAbilityId = AbilityIdSchema.parse('ability-guard-protect')

export class GuardRole extends Role {
  public readonly id = RoleIdSchema.parse('role-guard')
  public readonly displayNameKey = 'roles.guard'
  public readonly faction = 'village' as const
  public readonly kind = 'god' as const
  public readonly abilities: readonly AbilityDefinition[] = [
    {
      id: protectAbilityId,
      labelKey: 'abilities.guardProtect',
      actionTypes: ['night-action'],
      validate: (context) => {
        assertRule(context.action.type === 'night-action', 'Guard protection is a night action')
        const [targetId] = requireTargetCount(context, 1)
        requireAliveTarget(context, targetId, {
          allowSelf: context.board.policies.guardCanSelfProtect,
        })
        assertRule(
          context.actor.roleState.memory['guard.lastTarget'] !== targetId,
          'Guard cannot protect the same player on consecutive nights',
        )
      },
      effects: (context) => {
        assertRule(context.action.type === 'night-action', 'Guard protection is a night action')
        const [targetId] = requireTargetCount(context, 1)
        return [
          {
            kind: 'protect',
            priority: 300,
            sourceId: context.actor.id,
            targetId,
            protection: 'guard',
          },
        ]
      },
    },
  ]
}
