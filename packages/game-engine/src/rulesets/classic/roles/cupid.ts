import { z } from 'zod'
import {
  AbilityIdSchema,
  DeathTimingSchema,
  PlayerIdSchema,
  PluginEventTypeSchema,
  RoleIdSchema,
  type PlayerId,
} from '@agentwolf/contracts'
import { assertRule } from '../../../errors.js'
import { Role, type AbilityDefinition } from '../../../roles/base.js'
import { abilityUseCount, requireAliveTarget, requireTargetCount } from '../../../roles/helpers.js'
import type { GameState } from '../../../types.js'
import { classicCapabilities } from '../capabilities.js'
import { classicPluginIds } from '../plugins/ids.js'

export const cupidRoleId = RoleIdSchema.parse('role-cupid')
const linkAbilityId = AbilityIdSchema.parse('ability-cupid-link')

export const cupidEventTypes = {
  linked: PluginEventTypeSchema.parse('event-cupid-linked'),
  linkedDeath: PluginEventTypeSchema.parse('event-cupid-linked-death'),
} as const

export const cupidLinkDataSchema = z.object({
  loverIds: z.tuple([PlayerIdSchema, PlayerIdSchema]).refine(([left, right]) => left !== right, {
    message: 'Cupid lovers must be distinct',
  }),
})

export const cupidLinkedDeathDataSchema = z.object({
  sourceId: PlayerIdSchema,
  targetId: PlayerIdSchema,
  timing: DeathTimingSchema,
})

export const cupidStateSchema = z.object({
  loverIds: z.tuple([PlayerIdSchema, PlayerIdSchema]).nullable(),
  linkedDeaths: z.array(cupidLinkedDeathDataSchema),
})

export type CupidState = z.infer<typeof cupidStateSchema>

export const initialCupidState: CupidState = {
  loverIds: null,
  linkedDeaths: [],
}

export function cupidState(state: GameState): CupidState {
  return cupidStateSchema.parse(state.pluginState.get(classicPluginIds.cupid) ?? initialCupidState)
}

export function cupidPlayerId(state: GameState): PlayerId | null {
  return [...state.players.values()].find((player) => player.roleId === cupidRoleId)?.id ?? null
}

export class CupidRole extends Role {
  public readonly id = cupidRoleId
  public readonly displayNameKey = 'roles.cupid'
  public readonly faction = 'independent' as const
  public readonly kind = 'independent' as const
  public override readonly maximumCount = 1
  public override readonly capabilities = [classicCapabilities.cupidLink] as const
  public readonly abilities: readonly AbilityDefinition[] = [
    {
      id: linkAbilityId,
      requiredCapability: classicCapabilities.cupidLink,
      actionTypes: ['night-action'],
      validate: (context) => {
        assertRule(context.action.type === 'night-action', 'Cupid link is a night action')
        const loverIds = requireTargetCount(context, 2)
        assertRule(new Set(loverIds).size === 2, 'Cupid must link two distinct players')
        for (const loverId of loverIds) requireAliveTarget(context, loverId, { allowSelf: true })
        const current = cupidState(context.state)
        if (current.loverIds) {
          assertRule(samePlayers(current.loverIds, loverIds), 'Cupid has already linked lovers')
          return
        }
        assertRule(abilityUseCount(context, linkAbilityId) === 0, 'Cupid has already linked lovers')
        assertRule(context.state.night === 1, 'Cupid can link lovers only on the first night')
      },
      effects: () => [],
    },
  ]
}

function samePlayers(left: readonly PlayerId[], right: readonly PlayerId[]): boolean {
  return left.length === right.length && left.every((playerId) => right.includes(playerId))
}

export const cupidAbilityIds = { link: linkAbilityId } as const
