import {
  GameEventSchema,
  type AbilityId,
  type PlayerAction,
  type PlayerId,
} from '@agentwolf/contracts'
import { assertRule } from '../../../errors.js'
import { appendAutomaticDeathEvents, resolveDeathBatch } from '../../../death-resolution.js'
import type { RulePlugin } from '../../../plugins/loader.js'
import type { RulesetBuilder } from '../../../plugins/ruleset.js'
import {
  abilityEffectsForAction,
  appendAbilityOutcomes,
  ResolutionAgenda,
} from '../../../resolution.js'
import { visibility, type RuleRuntime } from '../../../rule-registry.js'
import { reduceGameEvent } from '../../../state.js'
import type { ResolutionEffect, ResolutionResult } from '../../../types.js'
import { classicCapabilities } from '../capabilities.js'
import { v1AbilityIds } from '../ability-ids.js'
import { classicPluginIds } from './ids.js'
import { afterDeathBatchEdges, bySeat, currentNightActions, phase } from './shared.js'
import { appendWolfKnifeVictoryLock } from './victory-plugin.js'

export const classicNightPlugin: RulePlugin<RulesetBuilder> = {
  id: classicPluginIds.night,
  version: 3,
  requires: [
    { id: classicPluginIds.resolution, version: 1 },
    { id: classicPluginIds.victory, version: 1 },
  ],
  register: ({ phases, rules }) => {
    phases.registerAll([
      {
        id: phase('phase-night-resolve'),
        labelKey: 'phases.nightResolve',
        mode: 'automatic',
        edges: [
          { to: phase('phase-day-announcement'), when: 'has-winner' },
          { to: phase('phase-sheriff-signup'), when: 'first-day-with-sheriff' },
          { to: phase('phase-day-announcement') },
        ],
      },
      {
        id: phase('phase-day-announcement'),
        labelKey: 'phases.dayAnnouncement',
        mode: 'automatic',
        edges: afterDeathBatchEdges([
          { to: phase('phase-night-guard'), when: 'interrupted-to-night' },
          { to: phase('phase-day-speech-order') },
        ]),
      },
    ])
    rules.registerPhaseHandler(phase('phase-night-resolve'), resolveNight, {
      id: 'classic-night-resolve',
    })
    rules.registerPhaseHandler(phase('phase-day-announcement'), finalizeNightDeaths, {
      id: 'classic-night-death-announcement',
    })
  },
}

function resolveNight(runtime: RuleRuntime): void {
  const submittedNightActions = currentNightActions(runtime)
  const actions = resolvableNightActions(runtime, submittedNightActions)
  const preparedActions = prepareNightActions(runtime, actions)
  const wolfPriorityActions = preparedActions.filter((entry) => entry.stage === 'wolf-priority')
  const wolfPrioritySubmittedActions = submittedNightActions.filter(
    (action): action is Extract<PlayerAction, { type: 'night-action' | 'skill-trigger' }> =>
      (action.type === 'night-action' || action.type === 'skill-trigger') &&
      runtime.roles.ability(action.abilityId).ability.resolutionTiming !== 'phase' &&
      runtime.roles.ability(action.abilityId).ability.nightResolutionStage === 'wolf-priority',
  )
  const wolfPriority = settleNightActions(runtime, wolfPriorityActions)
  const wolfKnifeVictory = evaluateWolfKnifeCheckpoint(runtime, wolfPriority.result)
  if (wolfKnifeVictory) {
    appendNightSettlement(
      runtime,
      wolfPrioritySubmittedActions,
      wolfPriority.consumedAbilityIds,
      wolfPriority.result,
    )
    appendWolfKnifeVictoryLock(runtime, wolfKnifeVictory)
    runtime.append({ type: 'day.started', day: runtime.state.day + 1 }, visibility.public)
    return
  }

  const complete = settleNightActions(runtime, preparedActions)
  appendNightSettlement(
    runtime,
    submittedNightActions.filter(
      (action): action is Extract<PlayerAction, { type: 'night-action' | 'skill-trigger' }> =>
        action.type === 'night-action' || action.type === 'skill-trigger',
    ),
    complete.consumedAbilityIds,
    complete.result,
  )
  runtime.append({ type: 'day.started', day: runtime.state.day + 1 }, visibility.public)
}

function resolvableNightActions(
  runtime: RuleRuntime,
  actions: readonly PlayerAction[],
): Array<Extract<PlayerAction, { type: 'night-action' | 'skill-trigger' }>> {
  return actions.filter(
    (action): action is Extract<PlayerAction, { type: 'night-action' | 'skill-trigger' }> =>
      (action.type === 'night-action' || action.type === 'skill-trigger') &&
      action.option !== 'pass' &&
      runtime.roles.ability(action.abilityId).ability.resolutionTiming !== 'phase',
  )
}

interface PreparedNightAction {
  readonly action: Extract<PlayerAction, { type: 'night-action' | 'skill-trigger' }>
  readonly effects: readonly ResolutionEffect[]
  readonly stage: 'wolf-priority' | 'post-wolf-priority'
  readonly consume: boolean
}

function prepareNightActions(
  runtime: RuleRuntime,
  actions: readonly Extract<PlayerAction, { type: 'night-action' | 'skill-trigger' }>[],
): PreparedNightAction[] {
  const prepared = actions.map((action): PreparedNightAction => {
    const ability = runtime.roles.ability(action.abilityId).ability
    assertRule(ability.nightResolutionStage, `Night ability ${ability.id} has no resolution stage`)
    return {
      action,
      effects: abilityEffectsForAction(runtime.state, runtime.board, runtime.roles, action),
      stage: ability.nightResolutionStage,
      consume: true,
    }
  })
  const hasSubmittedNightAttack = actions.some(
    (action) =>
      action.type === 'night-action' && runtime.roles.ability(action.abilityId).ability.nightAttack,
  )
  if (runtime.state.nightAttackTargetId && !hasSubmittedNightAttack) {
    const source = [...runtime.state.players.values()].find(
      (player) => player.alive && runtime.roles.hasCapability(player, classicCapabilities.wolfKill),
    )
    assertRule(source, 'A resolved Werewolf attack requires an eligible living attacker')
    const action: Extract<PlayerAction, { type: 'night-action' }> = {
      type: 'night-action',
      matchId: runtime.state.matchId,
      actorId: source.id,
      abilityId: v1AbilityIds.werewolfKill,
      targetIds: [runtime.state.nightAttackTargetId],
    }
    prepared.push({
      action,
      effects: abilityEffectsForAction(runtime.state, runtime.board, runtime.roles, action),
      stage: 'wolf-priority',
      consume: false,
    })
  }
  return prepared
}

function settleNightActions(
  runtime: RuleRuntime,
  actions: readonly PreparedNightAction[],
): {
  readonly result: ResolutionResult
  readonly consumedAbilityIds: readonly {
    readonly playerId: PlayerId
    readonly abilityId: AbilityId
  }[]
} {
  const agenda = new ResolutionAgenda(runtime.resolution, runtime.queries)
  for (const entry of actions) agenda.addAll(entry.effects)
  return {
    result: agenda.settle(runtime.state, runtime.board, runtime.roles),
    consumedAbilityIds: actions
      .filter((entry) => entry.consume)
      .map((entry) => ({
        playerId: entry.action.actorId,
        abilityId: entry.action.abilityId,
      })),
  }
}

function appendNightSettlement(
  runtime: RuleRuntime,
  submittedNightActions: readonly Extract<
    PlayerAction,
    { type: 'night-action' | 'skill-trigger' }
  >[],
  consumedAbilityIds: readonly {
    readonly playerId: PlayerId
    readonly abilityId: AbilityId
  }[],
  result: ResolutionResult,
): void {
  for (const action of submittedNightActions) {
    if (action.type === 'night-action') {
      appendAbilityOutcomes(runtime, action, result, 'before-usage')
    }
  }
  for (const consumed of consumedAbilityIds) {
    const player = runtime.state.players.get(consumed.playerId)
    const count = (player?.roleState.abilityUses[consumed.abilityId] ?? 0) + 1
    runtime.append(
      { type: 'ability.used', playerId: consumed.playerId, abilityId: consumed.abilityId, count },
      visibility.players([consumed.playerId]),
    )
  }
  for (const action of submittedNightActions) {
    if (action.type === 'night-action') {
      appendAbilityOutcomes(runtime, action, result, 'after-usage')
    }
  }
  for (const playerId of result.savedPlayerIds) {
    runtime.append({ type: 'player.saved', playerId, reason: 'night-protection' }, visibility.god)
  }
  for (const death of result.pendingDeaths) {
    runtime.append(
      {
        type: 'death.pending',
        playerId: death.playerId,
        causes: [...death.causes],
        timing: 'night',
      },
      visibility.god,
    )
  }
}

function evaluateWolfKnifeCheckpoint(
  runtime: RuleRuntime,
  result: ResolutionResult,
): ReturnType<RuleRuntime['victories']['evaluateFormal']> {
  if (!result.pendingDeaths.some((death) => death.causes.includes('werewolf'))) return null
  const resolved = resolveDeathBatch(runtime, result.pendingDeaths, 'night')
  let state = runtime.state
  const events = [...runtime.events]
  const occurredAt = events.at(-1)?.occurredAt ?? new Date(0).toISOString()
  const appendHypothetical = (
    payload: Parameters<RuleRuntime['append']>[0],
    eventVisibility: Parameters<RuleRuntime['append']>[1],
  ): void => {
    const event = GameEventSchema.parse({
      matchId: state.matchId,
      sequence: state.lastSequence + 1,
      occurredAt,
      visibility: eventVisibility,
      payload,
    })
    events.push(event)
    state = reduceGameEvent(state, event, runtime.pluginEvents)
  }
  for (const entry of resolved) {
    appendHypothetical(
      {
        type: 'player.died',
        playerId: entry.death.playerId,
        causes: [...entry.death.causes],
        announced: true,
        timing: entry.death.timing,
      },
      visibility.god,
    )
  }
  appendHypothetical(
    {
      type: 'public.announcement',
      code: 'night-deaths',
      playerIds: resolved.map((entry) => entry.death.playerId),
      params: {},
    },
    visibility.public,
  )
  for (const entry of resolved) {
    for (const event of entry.events) appendHypothetical(event.payload, event.visibility)
  }
  const candidate = runtime.victories.evaluateFormal({
    state,
    board: runtime.board,
    roles: runtime.roles,
    events,
  })
  return candidate?.winner === 'werewolf' ? candidate : null
}

function finalizeNightDeaths(runtime: RuleRuntime): void {
  const pendingPlayerIds = bySeat(runtime, runtime.state.pendingDeaths.keys())
  if (pendingPlayerIds.length === 0) {
    runtime.append(
      { type: 'public.announcement', code: 'peaceful-night', playerIds: [], params: {} },
      visibility.public,
    )
    return
  }
  const pendingDeaths = pendingPlayerIds.map((playerId) => {
    const death = runtime.state.pendingDeaths.get(playerId)
    assertRule(death, `Missing pending death for ${playerId}`)
    return death
  })
  const resolved = resolveDeathBatch(runtime, pendingDeaths, 'night')
  for (const { death } of resolved) {
    const player = runtime.state.players.get(death.playerId)
    assertRule(player?.alive, `Unknown or dead pending death player ${death.playerId}`)
    runtime.append(
      {
        type: 'player.died',
        playerId: death.playerId,
        causes: [...death.causes],
        announced: true,
        timing: death.timing,
      },
      visibility.god,
    )
  }
  const deaths = resolved.map((entry) => entry.death.playerId)
  runtime.append(
    { type: 'public.announcement', code: 'night-deaths', playerIds: deaths, params: {} },
    visibility.public,
  )
  appendAutomaticDeathEvents(runtime, resolved, {
    suppressPublicEvents: true,
  })
}
