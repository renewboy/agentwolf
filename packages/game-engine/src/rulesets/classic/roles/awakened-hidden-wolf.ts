import { z } from 'zod'
import {
  AbilityIdSchema,
  PlayerIdSchema,
  PluginEventTypeSchema,
  RoleIdSchema,
  type CapabilityId,
  type PlayerId,
  type RoleId,
} from '@agentwolf/contracts'
import { assertRule } from '../../../errors.js'
import { Role, type AbilityDefinition, type AbilityOutcome } from '../../../roles/base.js'
import { abilityUseCount, requireAliveTarget, requireTargetCount } from '../../../roles/helpers.js'
import type { ActionValidationContext, GameState } from '../../../types.js'
import { classicCapabilities } from '../capabilities.js'
import { classicPluginIds } from '../plugins/ids.js'

export const awakenedHiddenWolfRoleId = RoleIdSchema.parse('role-awakened-hidden-wolf')

const learnAbilityId = AbilityIdSchema.parse('ability-awakened-hidden-wolf-learn')
const inspectAbilityId = AbilityIdSchema.parse('ability-awakened-hidden-wolf-inspect')
const poisonAbilityId = AbilityIdSchema.parse('ability-awakened-hidden-wolf-poison')
const shieldAbilityId = AbilityIdSchema.parse('ability-awakened-hidden-wolf-shield')
const killAbilityId = AbilityIdSchema.parse('ability-awakened-hidden-wolf-kill')
const doubleKillAbilityId = AbilityIdSchema.parse('ability-awakened-hidden-wolf-double-kill')

export const awakenedHiddenWolfEventTypes = {
  learned: PluginEventTypeSchema.parse('event-awakened-hidden-wolf-learned'),
  status: PluginEventTypeSchema.parse('event-awakened-hidden-wolf-status'),
  inspected: PluginEventTypeSchema.parse('event-awakened-hidden-wolf-inspected'),
  poisoned: PluginEventTypeSchema.parse('event-awakened-hidden-wolf-poisoned'),
  protected: PluginEventTypeSchema.parse('event-awakened-hidden-wolf-protected'),
  attacked: PluginEventTypeSchema.parse('event-awakened-hidden-wolf-attacked'),
} as const

const learningSchema = z.object({
  actorId: PlayerIdSchema,
  targetId: PlayerIdSchema,
  roleId: RoleIdSchema,
  night: z.number().int().positive(),
})

const statusSchema = z.object({
  actorId: PlayerIdSchema,
  night: z.number().int().positive(),
  armed: z.boolean(),
})

const attackSchema = z.object({
  actorId: PlayerIdSchema,
  night: z.number().int().positive(),
  targetIds: z.array(PlayerIdSchema).min(1).max(2),
})

export const awakenedHiddenWolfStateSchema = z.object({
  learnings: z.array(learningSchema),
  statuses: z.array(statusSchema),
  attacks: z.array(attackSchema),
})

export const awakenedHiddenWolfEventDataSchemas = {
  learned: learningSchema,
  status: statusSchema,
  inspected: z.object({
    actorId: PlayerIdSchema,
    targetId: PlayerIdSchema,
    roleId: RoleIdSchema,
  }),
  poisoned: z.object({ actorId: PlayerIdSchema, targetId: PlayerIdSchema }),
  protected: z.object({ actorId: PlayerIdSchema, targetId: PlayerIdSchema }),
  attacked: z.object({
    actorId: PlayerIdSchema,
    night: z.number().int().positive(),
    targetIds: z.array(PlayerIdSchema).min(1).max(2),
  }),
} as const

const initialState: z.infer<typeof awakenedHiddenWolfStateSchema> = {
  learnings: [],
  statuses: [],
  attacks: [],
}

export class AwakenedHiddenWolfRole extends Role {
  public readonly id = awakenedHiddenWolfRoleId
  public readonly displayNameKey = 'roles.awakenedHiddenWolf'
  public readonly faction = 'werewolf' as const
  public readonly kind = 'werewolf' as const
  public readonly endgameModel = 'plugin' as const
  public override readonly maximumCount = 1
  public override readonly capabilities = [classicCapabilities.awakenedHiddenWolfLearn] as const
  public readonly abilities: readonly AbilityDefinition[] = [
    {
      id: learnAbilityId,
      endgameImpact: 'material',
      nightResolutionStage: 'wolf-priority',
      requiredCapability: classicCapabilities.awakenedHiddenWolfLearn,
      actionTypes: ['night-action'],
      validate: (context) => {
        assertRule(context.action.type === 'night-action', 'Learning is a night action')
        const existing = awakenedHiddenWolfLearning(context.state, context.actor.id)
        const [targetId] = requireTargetCount(context, 1)
        assertRule(
          abilityUseCount(context, learnAbilityId) === 0 &&
            (!existing ||
              (existing.night === context.state.night && existing.targetId === targetId)),
          'Awakened Hidden Wolf has already learned a role',
        )
        requireAliveTarget(context, targetId, { allowSelf: false })
      },
      effects: () => [],
    },
    {
      id: inspectAbilityId,
      endgameImpact: 'information',
      nightResolutionStage: 'post-wolf-priority',
      requiredCapability: classicCapabilities.awakenedHiddenWolfInspect,
      actionTypes: ['night-action'],
      validate: (context) => {
        assertRule(context.action.type === 'night-action', 'Copied inspection is a night action')
        const [targetId] = requireTargetCount(context, 1)
        requireAliveTarget(context, targetId, { allowSelf: false })
      },
      effects: (context) => {
        assertRule(context.action.type === 'night-action', 'Copied inspection is a night action')
        const [targetId] = requireTargetCount(context, 1)
        return [{ kind: 'inspect-role', priority: 500, sourceId: context.actor.id, targetId }]
      },
      outcomes: (context, result) => {
        const inspection = result.exactInspections.find(
          (entry) => entry.sourceId === context.actor.id,
        )
        return inspection
          ? [
              pluginOutcome(awakenedHiddenWolfEventTypes.inspected, {
                actorId: inspection.sourceId,
                targetId: inspection.targetId,
                roleId: inspection.roleId,
              }),
            ]
          : []
      },
    },
    {
      id: poisonAbilityId,
      endgameImpact: 'material',
      nightResolutionStage: 'post-wolf-priority',
      requiredCapability: classicCapabilities.awakenedHiddenWolfPoison,
      actionTypes: ['night-action'],
      validate: (context) => {
        assertRule(context.action.type === 'night-action', 'Copied poison is a night action')
        assertRule(abilityUseCount(context, poisonAbilityId) === 0, 'Copied poison has been used')
        const [targetId] = requireTargetCount(context, 1)
        requireAliveTarget(context, targetId, { allowSelf: false })
      },
      effects: (context) => {
        assertRule(context.action.type === 'night-action', 'Copied poison is a night action')
        const [targetId] = requireTargetCount(context, 1)
        return [
          {
            kind: 'damage',
            priority: 400,
            sourceId: context.actor.id,
            targetId,
            cause: 'poison',
          },
        ]
      },
      outcomes: (context) => {
        const targetId = usedNightTarget(context, 1)
        return targetId
          ? [
              pluginOutcome(awakenedHiddenWolfEventTypes.poisoned, {
                actorId: context.actor.id,
                targetId,
              }),
              revokeOutcome(context.actor.id, classicCapabilities.awakenedHiddenWolfPoison),
            ]
          : []
      },
    },
    {
      id: shieldAbilityId,
      endgameImpact: 'material',
      nightResolutionStage: 'wolf-priority',
      requiredCapability: classicCapabilities.awakenedHiddenWolfShield,
      actionTypes: ['night-action'],
      validate: (context) => {
        assertRule(context.action.type === 'night-action', 'Copied shield is a night action')
        assertRule(abilityUseCount(context, shieldAbilityId) === 0, 'Copied shield has been used')
        const [targetId] = requireTargetCount(context, 1)
        requireAliveTarget(context, targetId, { allowSelf: true })
      },
      effects: (context) => {
        assertRule(context.action.type === 'night-action', 'Copied shield is a night action')
        const [targetId] = requireTargetCount(context, 1)
        return [
          {
            kind: 'protect',
            priority: 300,
            sourceId: context.actor.id,
            targetId,
            protection: 'night-damage-shield',
            blocks: ['werewolf', 'poison'],
          },
        ]
      },
      outcomes: (context) => {
        const targetId = usedNightTarget(context, 1)
        return targetId
          ? [
              pluginOutcome(awakenedHiddenWolfEventTypes.protected, {
                actorId: context.actor.id,
                targetId,
              }),
              revokeOutcome(context.actor.id, classicCapabilities.awakenedHiddenWolfShield),
            ]
          : []
      },
    },
    {
      id: killAbilityId,
      endgameImpact: 'material',
      nightResolutionStage: 'wolf-priority',
      requiredCapability: classicCapabilities.awakenedHiddenWolfKill,
      nightAttack: true,
      actionTypes: ['night-action'],
      validate: (context) => {
        assertRule(context.action.type === 'night-action', 'Awakened attack is a night action')
        const [targetId] = requireTargetCount(context, 1)
        requireAliveTarget(context, targetId, { allowSelf: false })
      },
      effects: (context) => {
        assertRule(context.action.type === 'night-action', 'Awakened attack is a night action')
        const [targetId] = requireTargetCount(context, 1)
        return [
          {
            kind: 'damage',
            priority: 400,
            sourceId: context.actor.id,
            targetId,
            cause: 'werewolf',
          },
        ]
      },
    },
    {
      id: doubleKillAbilityId,
      endgameImpact: 'material',
      nightResolutionStage: 'wolf-priority',
      requiredCapability: classicCapabilities.awakenedHiddenWolfDoubleKill,
      nightAttack: true,
      actionTypes: ['night-action'],
      validate: (context) => {
        assertRule(context.action.type === 'night-action', 'Double attack is a night action')
        assertRule(
          context.roles.hasCapability(context.actor, classicCapabilities.awakenedHiddenWolfKill),
          'Double attack requires the awakened attack',
        )
        assertRule(
          abilityUseCount(context, doubleKillAbilityId) === 0,
          'Double attack has been used',
        )
        const targetIds = requireTargetCount(context, 2)
        for (const targetId of targetIds) {
          requireAliveTarget(context, targetId, { allowSelf: false })
        }
      },
      effects: (context) => {
        assertRule(context.action.type === 'night-action', 'Double attack is a night action')
        const [firstTargetId, secondTargetId] = requireTargetCount(context, 2)
        if (!firstTargetId || !secondTargetId) return []
        if (firstTargetId === secondTargetId) {
          return [
            {
              kind: 'damage',
              priority: 400,
              sourceId: context.actor.id,
              targetId: firstTargetId,
              ignoredProtections: ['guard', 'antidote'],
              cause: 'werewolf',
            },
          ]
        }
        return [firstTargetId, secondTargetId].map((targetId) => ({
          kind: 'damage' as const,
          priority: 400 as const,
          sourceId: context.actor.id,
          targetId,
          cause: 'werewolf' as const,
        }))
      },
      outcomes: (context) =>
        context.action.type === 'night-action' &&
        context.action.option !== 'pass' &&
        context.action.targetIds.length === 2
          ? [revokeOutcome(context.actor.id, classicCapabilities.awakenedHiddenWolfDoubleKill)]
          : [],
    },
  ]
}

export const awakenedHiddenWolfAbilityIds = {
  learn: learnAbilityId,
  inspect: inspectAbilityId,
  poison: poisonAbilityId,
  shield: shieldAbilityId,
  kill: killAbilityId,
  doubleKill: doubleKillAbilityId,
} as const

export const initialAwakenedHiddenWolfState = initialState

export function awakenedHiddenWolfLearning(
  state: GameState,
  actorId: PlayerId,
): z.infer<typeof learningSchema> | null {
  const pluginState = awakenedHiddenWolfStateSchema.parse(
    state.pluginState.get(classicPluginIds.awakenedHiddenWolf) ?? initialState,
  )
  return pluginState.learnings.find((entry) => entry.actorId === actorId) ?? null
}

export function awakenedHiddenWolfCapabilityFor(roleId: RoleId): CapabilityId | null {
  const mapping = new Map<RoleId, CapabilityId>([
    [RoleIdSchema.parse('role-magic-mirror-girl'), classicCapabilities.awakenedHiddenWolfInspect],
    [RoleIdSchema.parse('role-witch'), classicCapabilities.awakenedHiddenWolfPoison],
    [RoleIdSchema.parse('role-guard'), classicCapabilities.awakenedHiddenWolfShield],
    [RoleIdSchema.parse('role-hunter'), classicCapabilities.hunterShot],
    [RoleIdSchema.parse('role-werewolf'), classicCapabilities.awakenedHiddenWolfDoubleKill],
  ])
  return mapping.get(roleId) ?? null
}

function pluginOutcome(
  eventType: (typeof awakenedHiddenWolfEventTypes)[keyof typeof awakenedHiddenWolfEventTypes],
  data: Record<string, number | boolean | string | string[]>,
): AbilityOutcome {
  const actorId = PlayerIdSchema.parse(data['actorId'])
  return {
    stage: 'after-usage',
    payload: {
      type: 'plugin.event',
      pluginId: classicPluginIds.awakenedHiddenWolf,
      eventType,
      schemaVersion: 1,
      data,
    },
    visibility: { kind: 'players', playerIds: [actorId] },
  }
}

function revokeOutcome(playerId: PlayerId, capabilityId: CapabilityId): AbilityOutcome {
  return {
    stage: 'after-usage',
    payload: { type: 'capability.revoked', playerId, capabilityId },
    visibility: { kind: 'players', playerIds: [playerId] },
  }
}

function usedNightTarget(context: ActionValidationContext, count: number): PlayerId | null {
  if (
    context.action.type !== 'night-action' ||
    context.action.option === 'pass' ||
    context.action.targetIds.length !== count
  ) {
    return null
  }
  return context.action.targetIds[0] ?? null
}
