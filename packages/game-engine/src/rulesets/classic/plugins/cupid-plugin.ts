import { TriggerIdSchema, type PlayerAction, type PlayerId } from '@agentwolf/contracts'
import { assertRule } from '../../../errors.js'
import type { RulePlugin } from '../../../plugins/loader.js'
import type { VictoryCandidate } from '../../../plugins/victory-registry.js'
import type { RulesetBuilder } from '../../../plugins/ruleset.js'
import { visibility, type RuleRuntime } from '../../../rule-registry.js'
import type { GameState, PhaseNode } from '../../../types.js'
import { classicCapabilities } from '../capabilities.js'
import {
  CupidRole,
  cupidAbilityIds,
  cupidEventTypes,
  cupidLinkDataSchema,
  cupidLinkedDeathDataSchema,
  cupidPlayerId,
  cupidState,
  cupidStateSchema,
  initialCupidState,
} from '../roles/cupid.js'
import { classicPluginIds } from './ids.js'
import { phase } from './shared.js'

const cupidPhaseId = phase('phase-night-cupid')
const hiddenNightPhaseId = phase('phase-night-hidden')
const linkedDeathTriggerId = TriggerIdSchema.parse('trigger-cupid-linked-death')

export const cupidPlugin: RulePlugin<RulesetBuilder> = {
  id: classicPluginIds.cupid,
  version: 1,
  requires: [
    { id: classicPluginIds.phases, version: 1 },
    { id: classicPluginIds.guard, version: 1 },
    { id: classicPluginIds.victory, version: 1 },
    { id: classicPluginIds.night, version: 2 },
    { id: classicPluginIds.death, version: 2 },
    { id: classicPluginIds.day, version: 2 },
    { id: classicPluginIds.terminal, version: 2 },
  ],
  register: ({ events, phases, roles, rules, triggers, victories }) => {
    roles.register(new CupidRole())
    events.register({
      pluginId: classicPluginIds.cupid,
      eventType: cupidEventTypes.linked,
      schemaVersion: 1,
      stateSchema: cupidStateSchema,
      dataSchema: cupidLinkDataSchema,
      initialState: initialCupidState,
      reduce: (state, data) => {
        if (state.loverIds && !samePlayers(state.loverIds, data.loverIds)) {
          throw new Error('Cupid lovers cannot be replaced')
        }
        return { ...state, loverIds: data.loverIds }
      },
    })
    events.register({
      pluginId: classicPluginIds.cupid,
      eventType: cupidEventTypes.linkedDeath,
      schemaVersion: 1,
      stateSchema: cupidStateSchema,
      dataSchema: cupidLinkedDeathDataSchema,
      initialState: initialCupidState,
      reduce: (state, data) => ({
        ...state,
        linkedDeaths: [...state.linkedDeaths, data],
      }),
    })
    phases.insert({
      node: {
        id: cupidPhaseId,
        labelKey: 'phases.nightCupid',
        mode: 'parallel',
        presentation: {
          visibility: 'actors',
          hiddenPhaseId: hiddenNightPhaseId,
          hiddenLabelKey: 'phases.nightHidden',
        },
        action: {
          type: 'night-action',
          abilityIds: [cupidAbilityIds.link],
          passAllowed: false,
          visibility: 'actor',
        },
        actorSelector: `capability-alive:${classicCapabilities.cupidLink}`,
        activeWhen: 'cupid-link-active',
        edges: [],
      },
      after: null,
      before: phase('phase-night-guard'),
      rewireIncoming: true,
    })
    rules.registerPredicate('cupid-link-active', (runtime) => {
      if (runtime.state.night !== 1 || cupidState(runtime.state).loverIds) return false
      return [...runtime.state.players.values()].some(
        (player) =>
          player.alive && runtime.roles.hasCapability(player, classicCapabilities.cupidLink),
      )
    })
    rules.registerPhaseHandler(cupidPhaseId, settleLink, { id: 'cupid-link' })
    rules.registerActionValidator('cupid-lovers-cannot-exile-each-other', validateLoverVote)
    triggers.registerAutomaticDeath({
      id: linkedDeathTriggerId,
      signal: 'player-death',
      react: ({ state, death, scheduledPlayerIds }) => {
        const loverIds = cupidState(state).loverIds
        if (!loverIds?.includes(death.playerId)) return []
        const targetId = loverIds.find((playerId) => playerId !== death.playerId)
        if (!targetId || scheduledPlayerIds.has(targetId) || !state.players.get(targetId)?.alive)
          return []
        return [
          {
            death: { playerId: targetId, causes: ['linked'], timing: death.timing },
            events: [
              {
                payload: {
                  type: 'plugin.event',
                  pluginId: classicPluginIds.cupid,
                  eventType: cupidEventTypes.linkedDeath,
                  schemaVersion: 1,
                  data: { sourceId: death.playerId, targetId, timing: death.timing },
                },
                visibility: visibility.public,
              },
            ],
          },
        ]
      },
    })
    victories.registerModifier({
      id: 'cupid-lovers-victory',
      order: 100,
      transform: (context, current) => modifyVictory(context.state, current),
    })
  },
}

function settleLink(runtime: RuleRuntime): void {
  const action = runtime.state.phaseActions.find(
    (candidate): candidate is Extract<PlayerAction, { type: 'night-action' }> =>
      candidate.type === 'night-action' && candidate.abilityId === cupidAbilityIds.link,
  )
  assertRule(action, 'Cupid phase requires a link action')
  const loverIds = [...action.targetIds].sort(
    (left, right) =>
      (runtime.state.players.get(left)?.seat ?? Number.MAX_SAFE_INTEGER) -
      (runtime.state.players.get(right)?.seat ?? Number.MAX_SAFE_INTEGER),
  ) as [PlayerId, PlayerId]
  const current = cupidState(runtime.state)
  if (current.loverIds) {
    assertRule(samePlayers(current.loverIds, loverIds), 'Cupid lovers cannot be replaced')
    return
  }
  runtime.append(
    {
      type: 'plugin.event',
      pluginId: classicPluginIds.cupid,
      eventType: cupidEventTypes.linked,
      schemaVersion: 1,
      data: { loverIds },
    },
    visibility.players([...new Set([action.actorId, ...loverIds])]),
  )
}

function validateLoverVote(_node: PhaseNode, action: PlayerAction, runtime: RuleRuntime): void {
  if (
    action.type !== 'vote' ||
    !action.targetId ||
    (action.kind !== 'exile' && action.kind !== 'exile-runoff')
  ) {
    return
  }
  const loverIds = cupidState(runtime.state).loverIds
  if (!loverIds?.includes(action.actorId)) return
  assertRule(!loverIds.includes(action.targetId), 'Lovers cannot vote to exile each other')
}

function modifyVictory(
  state: GameState,
  current: VictoryCandidate | null,
): VictoryCandidate | null {
  const loverIds = cupidState(state).loverIds
  const cupidId = cupidPlayerId(state)
  if (!loverIds || !cupidId) return current
  const lovers = loverIds.map((playerId) => state.players.get(playerId))
  if (lovers.some((player) => !player?.faction)) throw new Error('Cupid lover has no faction')
  const werewolfCount = lovers.filter((player) => player?.faction === 'werewolf').length
  if (werewolfCount === 0 || werewolfCount === 2) {
    const alignedWinner = werewolfCount === 2 ? 'werewolf' : 'village'
    return current?.winner === alignedWinner
      ? { ...current, winningPlayerIds: [...new Set([...current.winningPlayerIds, cupidId])] }
      : current
  }

  const cohort = [...new Set([cupidId, ...loverIds])]
  const cupidAlive = state.players.get(cupidId)?.alive === true
  const loversAlive = loverIds.every((playerId) => state.players.get(playerId)?.alive === true)
  const active = cupidAlive || loversAlive
  if (active) {
    const livingOutsiders = [...state.players.values()].filter(
      (player) => player.alive && !cohort.includes(player.id),
    )
    return livingOutsiders.length === 0
      ? {
          winner: 'independent',
          winningPlayerIds: cohort,
          reason: 'cupid-lovers-last-standing',
        }
      : null
  }
  return current
    ? {
        ...current,
        winningPlayerIds: current.winningPlayerIds.filter((playerId) => !cohort.includes(playerId)),
      }
    : null
}

function samePlayers(left: readonly PlayerId[], right: readonly PlayerId[]): boolean {
  return left.length === right.length && left.every((playerId) => right.includes(playerId))
}

export const cupidPhaseIds = { link: cupidPhaseId } as const
