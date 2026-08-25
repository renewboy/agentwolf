import { z } from 'zod'
import {
  AbilityIdSchema,
  PlayerIdSchema,
  PluginEventTypeSchema,
  RoleIdSchema,
} from '@agentwolf/contracts'
import { assertRule } from '../../../errors.js'
import { Role, type AbilityDefinition } from '../../../roles/base.js'
import { abilityUseCount, requireAliveTarget } from '../../../roles/helpers.js'
import { classicCapabilities } from '../capabilities.js'
import { classicPluginIds } from '../plugins/ids.js'

export const whiteWolfDetonatedEventType = PluginEventTypeSchema.parse('event-white-wolf-detonated')
export const whiteWolfStateSchema = z.object({
  detonations: z.array(z.object({ actorId: PlayerIdSchema, targetId: PlayerIdSchema })),
})
export const whiteWolfDetonationDataSchema = z.object({
  actorId: PlayerIdSchema,
  targetId: PlayerIdSchema,
})

const detonateAbilityId = AbilityIdSchema.parse('ability-white-wolf-detonate')

export class WhiteWolfKingRole extends Role {
  public readonly id = RoleIdSchema.parse('role-white-wolf-king')
  public readonly displayNameKey = 'roles.whiteWolfKing'
  public readonly faction = 'werewolf' as const
  public readonly kind = 'werewolf' as const
  public override readonly sharesFactionKnowledge = true
  public override readonly capabilities = [
    classicCapabilities.wolfCouncil,
    classicCapabilities.wolfKill,
    classicCapabilities.whiteWolfDetonate,
  ] as const
  public readonly abilities: readonly AbilityDefinition[] = [
    {
      id: detonateAbilityId,
      requiredCapability: classicCapabilities.whiteWolfDetonate,
      actionTypes: ['skill-trigger'],
      validate: (context) => {
        assertRule(context.action.type === 'skill-trigger', 'White Wolf detonation is a skill')
        assertRule(
          abilityUseCount(context, detonateAbilityId) === 0,
          'White Wolf King has already detonated',
        )
        assertRule(context.action.targetId, 'White Wolf detonation requires a target')
        requireAliveTarget(context, context.action.targetId, { allowSelf: false })
      },
      effects: (context) => {
        assertRule(context.action.type === 'skill-trigger', 'White Wolf detonation is a skill')
        assertRule(context.action.targetId, 'White Wolf detonation requires a target')
        return [
          {
            kind: 'damage',
            priority: 700,
            sourceId: context.actor.id,
            targetId: context.actor.id,
            cause: 'white-wolf-detonate',
          },
          {
            kind: 'damage',
            priority: 700,
            sourceId: context.actor.id,
            targetId: context.action.targetId,
            cause: 'white-wolf-detonate',
          },
        ]
      },
      outcomes: (context) => {
        if (context.action.type !== 'skill-trigger' || !context.action.targetId) return []
        return [
          {
            stage: 'after-usage',
            payload: {
              type: 'plugin.event',
              pluginId: classicPluginIds.whiteWolfKing,
              eventType: whiteWolfDetonatedEventType,
              schemaVersion: 1,
              data: { actorId: context.actor.id, targetId: context.action.targetId },
            },
            visibility: { kind: 'public' },
          },
          {
            stage: 'after-usage',
            payload: {
              type: 'players.eliminated-publicly',
              playerIds: [context.actor.id, context.action.targetId],
            },
            visibility: { kind: 'public' },
          },
          {
            stage: 'after-usage',
            payload: {
              type: 'public.announcement',
              code: 'white-wolf-detonation',
              playerIds: [context.actor.id, context.action.targetId],
              params: {},
            },
            visibility: { kind: 'public' },
          },
          {
            stage: 'after-usage',
            payload: { type: 'day.interrupted', reason: 'self-destruct' },
            visibility: { kind: 'public' },
          },
        ]
      },
    },
  ]
}

export const whiteWolfAbilityIds = { detonate: detonateAbilityId } as const
