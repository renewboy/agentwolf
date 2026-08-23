import { AbilityIdSchema, RoleIdSchema } from '@agentwolf/contracts'
import { assertRule } from '../errors.js'
import type { AbilityDefinition } from './base.js'
import { Role } from './base.js'
import { requireAliveTarget, requireTargetCount } from './helpers.js'

const killAbilityId = AbilityIdSchema.parse('ability-werewolf-kill')
const selfDestructAbilityId = AbilityIdSchema.parse('ability-werewolf-self-destruct')

export class WerewolfRole extends Role {
  public readonly id = RoleIdSchema.parse('role-werewolf')
  public readonly displayNameKey = 'roles.werewolf'
  public readonly faction = 'werewolf' as const
  public readonly kind = 'werewolf' as const
  public readonly abilities: readonly AbilityDefinition[] = [
    {
      id: killAbilityId,
      labelKey: 'abilities.werewolfKill',
      actionTypes: ['night-action'],
      validate: (context) => {
        assertRule(context.action.type === 'night-action', 'Werewolf kill is a night action')
        assertRule(context.action.abilityId === killAbilityId, 'Unexpected werewolf ability')
        const [targetId] = requireTargetCount(context, 1)
        requireAliveTarget(context, targetId, { allowSelf: false })
        const target = context.state.players.get(targetId)
        assertRule(target?.faction !== 'werewolf', 'Werewolves cannot attack a werewolf')
      },
      effects: (context) => {
        assertRule(context.action.type === 'night-action', 'Werewolf kill is a night action')
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
      id: selfDestructAbilityId,
      labelKey: 'abilities.werewolfSelfDestruct',
      actionTypes: ['skill-trigger'],
      validate: (context) => {
        assertRule(context.action.type === 'skill-trigger', 'Self-destruct is a skill trigger')
        assertRule(context.action.targetId === null, 'Self-destruct has no target')
      },
      effects: (context) => [
        {
          kind: 'damage',
          priority: 700,
          sourceId: context.actor.id,
          targetId: context.actor.id,
          cause: 'self-destruct',
        },
      ],
    },
  ]
}
