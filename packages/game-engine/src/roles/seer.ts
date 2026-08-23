import { AbilityIdSchema, RoleIdSchema } from '@agentwolf/contracts'
import { assertRule } from '../errors.js'
import type { AbilityDefinition } from './base.js'
import { Role } from './base.js'
import { requireAliveTarget, requireTargetCount } from './helpers.js'

const inspectAbilityId = AbilityIdSchema.parse('ability-seer-inspect')

export class SeerRole extends Role {
  public readonly id = RoleIdSchema.parse('role-seer')
  public readonly displayNameKey = 'roles.seer'
  public readonly faction = 'village' as const
  public readonly kind = 'god' as const
  public readonly abilities: readonly AbilityDefinition[] = [
    {
      id: inspectAbilityId,
      labelKey: 'abilities.seerInspect',
      actionTypes: ['night-action'],
      validate: (context) => {
        assertRule(context.action.type === 'night-action', 'Inspection is a night action')
        const [targetId] = requireTargetCount(context, 1)
        requireAliveTarget(context, targetId, { allowSelf: false })
      },
      effects: (context) => {
        assertRule(context.action.type === 'night-action', 'Inspection is a night action')
        const [targetId] = requireTargetCount(context, 1)
        return [
          {
            kind: 'inspect',
            priority: 500,
            sourceId: context.actor.id,
            targetId,
          },
        ]
      },
    },
  ]
}
