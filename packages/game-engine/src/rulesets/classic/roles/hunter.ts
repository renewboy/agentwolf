import { AbilityIdSchema, RoleIdSchema } from '@agentwolf/contracts'
import { assertRule } from '../../../errors.js'
import type { AbilityDefinition } from '../../../roles/base.js'
import { Role } from '../../../roles/base.js'
import { abilityUseCount, requireAliveTarget } from '../../../roles/helpers.js'
import { classicCapabilities } from '../capabilities.js'

const shotAbilityId = AbilityIdSchema.parse('ability-hunter-shot')

export function hunterCanFire(context: {
  readonly state: Parameters<AbilityDefinition['validate']>[0]['state']
  readonly actor: Parameters<AbilityDefinition['validate']>[0]['actor']
}): boolean {
  if ((context.actor.roleState.abilityUses[shotAbilityId] ?? 0) > 0) return false
  const death =
    context.state.pendingDeaths.get(context.actor.id) ??
    context.state.recentDeaths.get(context.actor.id)
  return (
    death?.causes.some(
      (cause) => cause === 'werewolf' || cause === 'exile' || cause === 'white-wolf-detonate',
    ) ?? false
  )
}

export class HunterRole extends Role {
  public readonly id = RoleIdSchema.parse('role-hunter')
  public readonly displayNameKey = 'roles.hunter'
  public readonly faction = 'village' as const
  public readonly kind = 'god' as const
  public override readonly capabilities = [classicCapabilities.hunterShot] as const
  public readonly abilities: readonly AbilityDefinition[] = [
    {
      id: shotAbilityId,
      requiredCapability: classicCapabilities.hunterShot,
      actionTypes: ['skill-trigger'],
      validate: (context) => {
        assertRule(context.action.type === 'skill-trigger', 'Hunter shot is a skill trigger')
        assertRule(abilityUseCount(context, shotAbilityId) === 0, 'Hunter has already fired')
        assertRule(context.action.targetId, 'Hunter shot requires a target')
        requireAliveTarget(context, context.action.targetId, { allowSelf: false })
        assertRule(hunterCanFire(context), 'Hunter can fire only after a werewolf attack or exile')
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
      outcomes: (context) => {
        if (
          context.action.type !== 'skill-trigger' ||
          context.action.option === 'pass' ||
          !context.action.targetId
        ) {
          return []
        }
        return [
          {
            payload: {
              type: 'hunter.shot',
              playerId: context.actor.id,
              targetId: context.action.targetId,
            },
            stage: 'after-usage',
            visibility: { kind: 'public' },
          },
        ]
      },
    },
  ]
}
