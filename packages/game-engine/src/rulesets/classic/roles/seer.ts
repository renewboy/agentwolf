import { AbilityIdSchema, RoleIdSchema } from '@agentwolf/contracts'
import { assertRule } from '../../../errors.js'
import type { AbilityDefinition } from '../../../roles/base.js'
import { Role } from '../../../roles/base.js'
import { requireAliveTarget, requireTargetCount } from '../../../roles/helpers.js'
import { classicCapabilities } from '../capabilities.js'

const inspectAbilityId = AbilityIdSchema.parse('ability-seer-inspect')

export class SeerRole extends Role {
  public readonly id = RoleIdSchema.parse('role-seer')
  public readonly displayNameKey = 'roles.seer'
  public readonly publicRulesKey = 'promptContext.roleRules.seer'
  public readonly faction = 'village' as const
  public readonly kind = 'god' as const
  public override readonly capabilities = [classicCapabilities.seerInspect] as const
  public readonly abilities: readonly AbilityDefinition[] = [
    {
      id: inspectAbilityId,
      requiredCapability: classicCapabilities.seerInspect,
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
      outcomes: (context, result) => {
        const inspection = result.inspections.find((entry) => entry.sourceId === context.actor.id)
        return inspection
          ? [
              {
                payload: {
                  type: 'seer.inspected' as const,
                  actorId: inspection.sourceId,
                  targetId: inspection.targetId,
                  result: inspection.result,
                },
                stage: 'after-usage' as const,
                visibility: { kind: 'players' as const, playerIds: [inspection.sourceId] },
              },
            ]
          : []
      },
    },
  ]
}
