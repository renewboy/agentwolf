import type { PlayerAction } from '@agentwolf/contracts'
import { assertRule } from '../../../errors.js'
import { appendFactionKnowledge } from '../../../faction-knowledge.js'
import type { RulePlugin } from '../../../plugins/loader.js'
import type { RulesetBuilder } from '../../../plugins/ruleset.js'
import { visibility, type RuleRuntime } from '../../../rule-registry.js'
import { classicCapabilities } from '../capabilities.js'
import {
  ThiefRole,
  initialThiefState,
  thiefAbilityIds,
  thiefEventTypes,
  thiefRoleId,
  thiefSelectionDataSchema,
  thiefState,
  thiefStateSchema,
} from '../roles/thief.js'
import { classicPluginIds } from './ids.js'
import { phase } from './shared.js'

const thiefPhaseId = phase('phase-night-thief')
const hiddenNightPhaseId = phase('phase-night-hidden')
const matchEndedPhaseId = phase('phase-match-ended')

export const thiefPlugin: RulePlugin<RulesetBuilder> = {
  id: classicPluginIds.thief,
  version: 1,
  requires: [
    { id: classicPluginIds.phases, version: 1 },
    { id: classicPluginIds.cupid, version: 3 },
    { id: classicPluginIds.terminal, version: 3 },
  ],
  register: ({ deals, events, phases, roles, rules }) => {
    roles.register(new ThiefRole())
    events.register({
      pluginId: classicPluginIds.thief,
      eventType: thiefEventTypes.selected,
      schemaVersion: 1,
      stateSchema: thiefStateSchema,
      dataSchema: thiefSelectionDataSchema,
      initialState: initialThiefState,
      reduce: (state, data) => {
        if (state.selection && JSON.stringify(state.selection) !== JSON.stringify(data)) {
          throw new Error('Thief selection cannot be replaced')
        }
        return { selection: data }
      },
    })
    events.register({
      pluginId: classicPluginIds.thief,
      eventType: thiefEventTypes.revealed,
      schemaVersion: 1,
      stateSchema: thiefStateSchema,
      dataSchema: thiefSelectionDataSchema,
      initialState: initialThiefState,
      reduce: (state) => state,
    })
    deals.register({
      id: 'thief-official-reserves',
      validateBoard: (board) => {
        const thiefCount = board.roles
          .filter((slot) => slot.roleId === thiefRoleId)
          .reduce((total, slot) => total + slot.count, 0)
        if (thiefCount === 0) return
        assertRule(thiefCount === 1, 'Thief boards require exactly one Thief card')
        assertRule(board.reserveCount === 2, 'Thief boards require exactly two reserve cards')
      },
      validateDeal: ({ board, roles: registry, assignments, reserveCards }) => {
        if (!board.roles.some((slot) => slot.roleId === thiefRoleId)) return
        const thiefAssigned = assignments.some((card) => card.roleId === thiefRoleId)
        const thiefReserved = reserveCards.some((card) => card.roleId === thiefRoleId)
        assertRule(thiefAssigned !== thiefReserved, 'Thief card must be assigned or reserved')
        const reservedWolves = reserveCards.filter(
          (card) => registry.role(card.roleId).faction === 'werewolf',
        )
        if (thiefAssigned) {
          assertRule(reservedWolves.length <= 1, 'Thief cannot receive two Werewolf reserve cards')
        } else {
          assertRule(
            reservedWolves.length === 0,
            'A reserved Thief card cannot be paired with a Werewolf card',
          )
        }
      },
    })
    phases.insert({
      node: {
        id: thiefPhaseId,
        labelKey: 'phases.nightThief',
        mode: 'parallel',
        presentation: {
          visibility: 'actors',
          hiddenPhaseId: hiddenNightPhaseId,
          hiddenLabelKey: 'phases.nightHidden',
        },
        action: {
          type: 'night-action',
          abilityIds: [thiefAbilityIds.chooseCard],
          passAllowed: false,
          visibility: 'actor',
        },
        actorSelector: `capability-alive:${classicCapabilities.thiefChooseCard}`,
        activeWhen: 'thief-choice-active',
        edges: [],
      },
      after: null,
      before: phase('phase-night-cupid'),
      rewireIncoming: true,
    })
    rules.registerPredicate('thief-choice-active', (runtime) => {
      if (runtime.state.night !== 1 || thiefState(runtime.state).selection) return false
      return [...runtime.state.players.values()].some(
        (player) =>
          player.alive && runtime.roles.hasCapability(player, classicCapabilities.thiefChooseCard),
      )
    })
    rules.registerPhaseHandler(thiefPhaseId, settleThiefChoice, { id: 'thief-choice' })
    rules.registerPhaseHandler(matchEndedPhaseId, revealThiefChoice, {
      id: 'thief-choice-reveal',
      order: 90,
    })
  },
}

function settleThiefChoice(runtime: RuleRuntime): void {
  const action = runtime.state.phaseActions.find(
    (candidate): candidate is Extract<PlayerAction, { type: 'night-action' }> =>
      candidate.type === 'night-action' && candidate.abilityId === thiefAbilityIds.chooseCard,
  )
  assertRule(action?.roleCardId, 'Thief phase requires a role-card choice')
  const selectedCard = runtime.state.reservedRoleCards.find((card) => card.id === action.roleCardId)
  assertRule(selectedCard, `Unknown reserve role card ${action.roleCardId}`)
  const buriedCard = runtime.state.reservedRoleCards.find((card) => card.id !== selectedCard.id)
  assertRule(buriedCard, 'Thief phase requires one buried role card')
  const actor = runtime.state.players.get(action.actorId)
  assertRule(actor?.roleId === thiefRoleId, 'Thief choice actor no longer has the Thief role')
  const selectedRole = runtime.roles.role(selectedCard.roleId)
  runtime.append(
    { type: 'ability.used', playerId: actor.id, abilityId: thiefAbilityIds.chooseCard, count: 1 },
    visibility.players([actor.id]),
  )
  runtime.append(
    {
      type: 'plugin.event',
      pluginId: classicPluginIds.thief,
      eventType: thiefEventTypes.selected,
      schemaVersion: 1,
      data: { playerId: actor.id, selectedCard, buriedCard },
    },
    visibility.players([actor.id]),
  )
  runtime.append(
    {
      type: 'role.transformed',
      playerId: actor.id,
      fromRoleId: thiefRoleId,
      toRoleId: selectedRole.id,
      faction: selectedRole.faction,
    },
    visibility.players([actor.id]),
  )
  appendFactionKnowledge(runtime)
}

function revealThiefChoice(runtime: RuleRuntime): void {
  const selection = thiefState(runtime.state).selection
  if (!selection) return
  runtime.append(
    {
      type: 'plugin.event',
      pluginId: classicPluginIds.thief,
      eventType: thiefEventTypes.revealed,
      schemaVersion: 1,
      data: selection,
    },
    visibility.public,
  )
}

export const thiefPhaseIds = { choose: thiefPhaseId } as const
