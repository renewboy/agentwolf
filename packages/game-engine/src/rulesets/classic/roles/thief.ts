import { z } from 'zod'
import {
  AbilityIdSchema,
  PlayerIdSchema,
  PluginEventTypeSchema,
  RoleCardSchema,
  RoleIdSchema,
} from '@agentwolf/contracts'
import { assertRule } from '../../../errors.js'
import { Role, type AbilityDefinition } from '../../../roles/base.js'
import type { GameState } from '../../../types.js'
import { classicCapabilities } from '../capabilities.js'
import { classicPluginIds } from '../plugins/ids.js'

export const thiefRoleId = RoleIdSchema.parse('role-thief')
const chooseCardAbilityId = AbilityIdSchema.parse('ability-thief-choose-card')

export const thiefEventTypes = {
  selected: PluginEventTypeSchema.parse('event-thief-selected'),
  revealed: PluginEventTypeSchema.parse('event-thief-revealed'),
} as const

export const thiefSelectionDataSchema = z.object({
  playerId: PlayerIdSchema,
  selectedCard: RoleCardSchema,
  buriedCard: RoleCardSchema,
})

export const thiefStateSchema = z.object({
  selection: thiefSelectionDataSchema.nullable(),
})

export type ThiefState = z.infer<typeof thiefStateSchema>

export const initialThiefState: ThiefState = { selection: null }

export function thiefState(state: GameState): ThiefState {
  return thiefStateSchema.parse(state.pluginState.get(classicPluginIds.thief) ?? initialThiefState)
}

export class ThiefRole extends Role {
  public readonly id = thiefRoleId
  public readonly displayNameKey = 'roles.thief'
  public readonly faction = 'independent' as const
  public readonly kind = 'independent' as const
  public readonly endgameModel = 'plugin' as const
  public override readonly maximumCount = 1
  public override readonly requiredReserveCount = 2
  public override readonly capabilities = [classicCapabilities.thiefChooseCard] as const
  public readonly abilities: readonly AbilityDefinition[] = [
    {
      id: chooseCardAbilityId,
      endgameImpact: 'material',
      requiredCapability: classicCapabilities.thiefChooseCard,
      resolutionTiming: 'phase',
      actionTypes: ['night-action'],
      roleCardChoices: ({ state, roles }) => {
        const wolfRequired = state.reservedRoleCards.some(
          (card) => roles.role(card.roleId).faction === 'werewolf',
        )
        return state.reservedRoleCards.map((card) => ({
          card,
          selectable: !wolfRequired || roles.role(card.roleId).faction === 'werewolf',
          ...(wolfRequired && roles.role(card.roleId).faction !== 'werewolf'
            ? { reason: 'werewolf-card-required' }
            : {}),
        }))
      },
      validate: (context) => {
        assertRule(context.action.type === 'night-action', 'Thief choice is a night action')
        const action = context.action
        assertRule(context.state.night === 1, 'Thief can choose a role only on the first night')
        assertRule(context.board.reserveCount === 2, 'Thief requires exactly two reserve cards')
        assertRule(action.targetIds.length === 0, 'Thief choice cannot target a player')
        assertRule(action.option !== 'pass', 'Thief cannot pass')
        assertRule(action.roleCardId, 'Thief choice requires a role card')
        assertRule(!thiefState(context.state).selection, 'Thief has already chosen a role card')
        const selected = context.state.reservedRoleCards.find(
          (card) => card.id === action.roleCardId,
        )
        assertRule(selected, `Unknown reserve role card ${action.roleCardId}`)
        const wolfRequired = context.state.reservedRoleCards.some(
          (card) => context.roles.role(card.roleId).faction === 'werewolf',
        )
        assertRule(
          !wolfRequired || context.roles.role(selected.roleId).faction === 'werewolf',
          'Thief must choose the Werewolf card',
        )
      },
      effects: () => [],
    },
  ]
}

export const thiefAbilityIds = { chooseCard: chooseCardAbilityId } as const
