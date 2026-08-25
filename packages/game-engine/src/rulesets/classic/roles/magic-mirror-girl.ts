import { z } from 'zod'
import {
  AbilityIdSchema,
  PlayerIdSchema,
  PluginEventTypeSchema,
  RoleIdSchema,
} from '@agentwolf/contracts'
import { assertRule } from '../../../errors.js'
import { Role, type AbilityDefinition } from '../../../roles/base.js'
import { requireAliveTarget, requireTargetCount } from '../../../roles/helpers.js'
import { classicCapabilities } from '../capabilities.js'
import { classicPluginIds } from '../plugins/ids.js'

export const magicMirrorInspectedEventType = PluginEventTypeSchema.parse(
  'event-magic-mirror-inspected',
)
export const magicMirrorStateSchema = z.object({
  inspections: z.array(
    z.object({ actorId: PlayerIdSchema, targetId: PlayerIdSchema, roleId: RoleIdSchema }),
  ),
})
export const magicMirrorInspectionDataSchema = z.object({
  actorId: PlayerIdSchema,
  targetId: PlayerIdSchema,
  roleId: RoleIdSchema,
})

const inspectAbilityId = AbilityIdSchema.parse('ability-magic-mirror-inspect')

export class MagicMirrorGirlRole extends Role {
  public readonly id = RoleIdSchema.parse('role-magic-mirror-girl')
  public readonly displayNameKey = 'roles.magicMirrorGirl'
  public readonly faction = 'village' as const
  public readonly kind = 'god' as const
  public override readonly capabilities = [classicCapabilities.exactRoleInspect] as const
  public readonly abilities: readonly AbilityDefinition[] = [
    {
      id: inspectAbilityId,
      requiredCapability: classicCapabilities.exactRoleInspect,
      actionTypes: ['night-action'],
      validate: (context) => {
        assertRule(context.action.type === 'night-action', 'Exact inspection is a night action')
        const [targetId] = requireTargetCount(context, 1)
        requireAliveTarget(context, targetId, { allowSelf: false })
        const state = magicMirrorStateSchema.parse(
          context.state.pluginState.get(classicPluginIds.magicMirrorGirl) ?? { inspections: [] },
        )
        assertRule(
          !state.inspections.some(
            (inspection) =>
              inspection.actorId === context.actor.id && inspection.targetId === targetId,
          ),
          'Magic Mirror Girl cannot inspect the same player twice',
        )
      },
      effects: (context) => {
        assertRule(context.action.type === 'night-action', 'Exact inspection is a night action')
        const [targetId] = requireTargetCount(context, 1)
        return [
          {
            kind: 'inspect-role',
            priority: 500,
            sourceId: context.actor.id,
            targetId,
          },
        ]
      },
      outcomes: (context, result) => {
        const inspection = result.exactInspections.find(
          (entry) => entry.sourceId === context.actor.id,
        )
        return inspection
          ? [
              {
                stage: 'after-usage' as const,
                payload: {
                  type: 'plugin.event' as const,
                  pluginId: classicPluginIds.magicMirrorGirl,
                  eventType: magicMirrorInspectedEventType,
                  schemaVersion: 1,
                  data: {
                    actorId: inspection.sourceId,
                    targetId: inspection.targetId,
                    roleId: inspection.roleId,
                  },
                },
                visibility: { kind: 'players' as const, playerIds: [inspection.sourceId] },
              },
            ]
          : []
      },
    },
  ]
}

export const magicMirrorAbilityIds = { inspect: inspectAbilityId } as const
