import { AbilityIdSchema, RoleIdSchema, type PlayerId } from '@agentwolf/contracts'
import { assertRule } from '../../../errors.js'
import type { AbilityDefinition } from '../../../roles/base.js'
import { Role } from '../../../roles/base.js'
import { requireAliveTarget, requireTargetCount } from '../../../roles/helpers.js'
import { classicCapabilities } from '../capabilities.js'

const killAbilityId = AbilityIdSchema.parse('ability-werewolf-kill')
const selfDestructAbilityId = AbilityIdSchema.parse('ability-werewolf-self-destruct')

export class WerewolfRole extends Role {
  public readonly id = RoleIdSchema.parse('role-werewolf')
  public readonly displayNameKey = 'roles.werewolf'
  public readonly faction = 'werewolf' as const
  public readonly kind = 'werewolf' as const
  public readonly endgameModel = 'plugin' as const
  public override readonly sharesFactionKnowledge = true
  public override readonly capabilities = [
    classicCapabilities.wolfCouncil,
    classicCapabilities.wolfKill,
    classicCapabilities.wolfSelfDestruct,
  ] as const
  public readonly abilities: readonly AbilityDefinition[] = [
    {
      id: killAbilityId,
      endgameImpact: 'material',
      nightResolutionStage: 'wolf-priority',
      requiredCapability: classicCapabilities.wolfKill,
      nightAttack: true,
      actionTypes: ['vote', 'night-action'],
      validate: (context) => {
        let targetId: PlayerId | null
        if (context.action.type === 'vote') {
          assertRule(context.action.kind === 'wolf-kill', 'Werewolf kill requires a wolf-kill vote')
          targetId = context.action.targetId
        } else {
          assertRule(context.action.type === 'night-action', 'Werewolf kill is a night action')
          assertRule(context.action.abilityId === killAbilityId, 'Unexpected werewolf ability')
          targetId = requireTargetCount(context, 1)[0]
        }
        if (!targetId) return
        requireAliveTarget(context, targetId, { allowSelf: true })
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
      endgameImpact: 'material',
      requiredCapability: classicCapabilities.wolfSelfDestruct,
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
      outcomes: (context) => [
        {
          stage: 'after-usage',
          payload: {
            type: 'public.announcement',
            code: 'werewolf-self-destruct',
            playerIds: [context.actor.id],
            params: {},
          },
          visibility: { kind: 'public' },
        },
        {
          stage: 'after-usage',
          payload: { type: 'day.interrupted', reason: 'self-destruct' },
          visibility: { kind: 'public' },
        },
      ],
    },
  ]
}
