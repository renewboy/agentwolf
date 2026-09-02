import { AbilityIdSchema, RoleIdSchema } from '@agentwolf/contracts'
import { assertRule } from '../../../errors.js'
import type { AbilityDefinition } from '../../../roles/base.js'
import { Role } from '../../../roles/base.js'
import { requireAliveTarget, requireTargetCount } from '../../../roles/helpers.js'
import { classicCapabilities } from '../capabilities.js'

const protectAbilityId = AbilityIdSchema.parse('ability-guard-protect')

export class GuardRole extends Role {
  public readonly id = RoleIdSchema.parse('role-guard')
  public readonly displayNameKey = 'roles.guard'
  public readonly faction = 'village' as const
  public readonly kind = 'god' as const
  public readonly endgameModel = 'plugin' as const
  public override readonly capabilities = [classicCapabilities.guardProtect] as const
  public readonly abilities: readonly AbilityDefinition[] = [
    {
      id: protectAbilityId,
      endgameImpact: 'material',
      nightResolutionStage: 'wolf-priority',
      requiredCapability: classicCapabilities.guardProtect,
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
            blocks: ['werewolf'],
          },
        ]
      },
      outcomes: (context) => {
        if (context.action.type !== 'night-action') return []
        return [
          {
            payload: {
              type: 'guard.protected',
              actorId: context.actor.id,
              targetId: context.action.targetIds[0] ?? null,
            },
            stage: 'before-usage',
            visibility: { kind: 'players', playerIds: [context.actor.id] },
          },
        ]
      },
    },
  ]
}
