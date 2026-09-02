import { AbilityIdSchema, RoleIdSchema } from '@agentwolf/contracts'
import { assertRule } from '../../../errors.js'
import type { AbilityDefinition } from '../../../roles/base.js'
import { Role } from '../../../roles/base.js'
import { abilityUseCount, requireAliveTarget, requireTargetCount } from '../../../roles/helpers.js'
import { classicCapabilities } from '../capabilities.js'

const antidoteAbilityId = AbilityIdSchema.parse('ability-witch-antidote')
const poisonAbilityId = AbilityIdSchema.parse('ability-witch-poison')

export class WitchRole extends Role {
  public readonly id = RoleIdSchema.parse('role-witch')
  public readonly displayNameKey = 'roles.witch'
  public readonly faction = 'village' as const
  public readonly kind = 'god' as const
  public readonly endgameModel = 'plugin' as const
  public override readonly capabilities = [
    classicCapabilities.witchAntidote,
    classicCapabilities.witchPoison,
  ] as const
  public readonly abilities: readonly AbilityDefinition[] = [
    {
      id: antidoteAbilityId,
      endgameImpact: 'material',
      nightResolutionStage: 'wolf-priority',
      requiredCapability: classicCapabilities.witchAntidote,
      actionTypes: ['night-action'],
      validate: (context) => {
        assertRule(context.action.type === 'night-action', 'Antidote is a night action')
        assertRule(
          abilityUseCount(context, antidoteAbilityId) === 0,
          'Antidote has already been used',
        )
        const [targetId] = requireTargetCount(context, 1)
        assertRule(context.state.nightAttackTargetId, 'There is no werewolf attack to heal')
        assertRule(
          context.state.nightAttackTargetId === targetId,
          'Antidote must target the attacked player',
        )
        const canSelfSave =
          context.board.policies.witchSelfSave === 'always' ||
          (context.board.policies.witchSelfSave === 'first-night' && context.state.day === 0)
        assertRule(
          targetId !== context.actor.id || canSelfSave,
          'Witch cannot save herself on this board',
        )
      },
      effects: (context) => {
        assertRule(context.action.type === 'night-action', 'Antidote is a night action')
        const [targetId] = requireTargetCount(context, 1)
        return [
          {
            kind: 'protect',
            priority: 300,
            sourceId: context.actor.id,
            targetId,
            protection: 'antidote',
            blocks: ['werewolf'],
          },
        ]
      },
      outcomes: (context) => {
        if (
          context.action.type !== 'night-action' ||
          context.action.option === 'pass' ||
          !context.action.targetIds[0]
        ) {
          return []
        }
        return [
          {
            payload: {
              type: 'witch.potion-used',
              actorId: context.actor.id,
              potion: 'antidote',
              targetId: context.action.targetIds[0],
            },
            stage: 'before-usage',
            visibility: { kind: 'players', playerIds: [context.actor.id] },
          },
        ]
      },
    },
    {
      id: poisonAbilityId,
      endgameImpact: 'material',
      nightResolutionStage: 'post-wolf-priority',
      requiredCapability: classicCapabilities.witchPoison,
      actionTypes: ['night-action'],
      validate: (context) => {
        assertRule(context.action.type === 'night-action', 'Poison is a night action')
        assertRule(abilityUseCount(context, poisonAbilityId) === 0, 'Poison has already been used')
        const [targetId] = requireTargetCount(context, 1)
        requireAliveTarget(context, targetId, { allowSelf: false })
        if (context.board.policies.witchPotionsPerNight === 1) {
          const usedPotionThisPhase = context.state.phaseActions.some(
            (action) =>
              action.actorId === context.actor.id &&
              action.type === 'night-action' &&
              (action.abilityId === antidoteAbilityId || action.abilityId === poisonAbilityId),
          )
          assertRule(!usedPotionThisPhase, 'Witch can use only one potion per night')
        }
      },
      effects: (context) => {
        assertRule(context.action.type === 'night-action', 'Poison is a night action')
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
        if (
          context.action.type !== 'night-action' ||
          context.action.option === 'pass' ||
          !context.action.targetIds[0]
        ) {
          return []
        }
        return [
          {
            payload: {
              type: 'witch.potion-used',
              actorId: context.actor.id,
              potion: 'poison',
              targetId: context.action.targetIds[0],
            },
            stage: 'before-usage',
            visibility: { kind: 'players', playerIds: [context.actor.id] },
          },
        ]
      },
    },
  ]
}
