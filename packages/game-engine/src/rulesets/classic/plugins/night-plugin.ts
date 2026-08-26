import { assertRule } from '../../../errors.js'
import type { RulePlugin } from '../../../plugins/loader.js'
import type { RulesetBuilder } from '../../../plugins/ruleset.js'
import { addAbilityEffects, appendAbilityOutcomes, effectsForActions } from '../../../resolution.js'
import { visibility, type RuleRuntime } from '../../../rule-registry.js'
import { classicCapabilities } from '../capabilities.js'
import { v1AbilityIds } from '../ability-ids.js'
import { classicPluginIds } from './ids.js'
import { bySeat, currentNightActions, phase } from './shared.js'

export const classicNightPlugin: RulePlugin<RulesetBuilder> = {
  id: classicPluginIds.night,
  version: 1,
  requires: [{ id: classicPluginIds.resolution, version: 1 }],
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
        edges: [
          { to: phase('phase-death-triggers'), when: 'has-death-trigger' },
          { to: phase('phase-match-ended'), when: 'has-winner' },
          { to: phase('phase-sheriff-transfer'), when: 'dead-sheriff-holds-badge' },
          { to: phase('phase-last-words'), when: 'has-last-words' },
          { to: phase('phase-night-guard'), when: 'interrupted-to-night' },
          { to: phase('phase-day-speech-order') },
        ],
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
  const actions = submittedNightActions.filter(
    (action) =>
      (action.type === 'night-action' || action.type === 'skill-trigger') &&
      action.option !== 'pass',
  )
  const { agenda, consumedAbilityIds } = effectsForActions(
    runtime.state,
    runtime.board,
    runtime.roles,
    actions,
    runtime.resolution,
    runtime.queries,
  )
  const hasSubmittedNightAttack = actions.some(
    (action) =>
      action.type === 'night-action' && runtime.roles.ability(action.abilityId).ability.nightAttack,
  )
  if (runtime.state.nightAttackTargetId && !hasSubmittedNightAttack) {
    const source = [...runtime.state.players.values()].find(
      (player) => player.alive && runtime.roles.hasCapability(player, classicCapabilities.wolfKill),
    )
    assertRule(source, 'A resolved Werewolf attack requires an eligible living attacker')
    addAbilityEffects(agenda, runtime.state, runtime.board, runtime.roles, {
      type: 'night-action',
      matchId: runtime.state.matchId,
      actorId: source.id,
      abilityId: v1AbilityIds.werewolfKill,
      targetIds: [runtime.state.nightAttackTargetId],
    })
  }
  const result = agenda.settle(runtime.state, runtime.board, runtime.roles)

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
      { type: 'death.pending', playerId: death.playerId, causes: [...death.causes] },
      visibility.god,
    )
  }
  runtime.append({ type: 'day.started', day: runtime.state.day + 1 }, visibility.public)
}

function finalizeNightDeaths(runtime: RuleRuntime): void {
  const deaths = bySeat(runtime, runtime.state.pendingDeaths.keys())
  if (deaths.length === 0) {
    runtime.append(
      { type: 'public.announcement', code: 'peaceful-night', playerIds: [], params: {} },
      visibility.public,
    )
    return
  }
  for (const playerId of deaths) {
    const death = runtime.state.pendingDeaths.get(playerId)
    assertRule(death, `Missing pending death for ${playerId}`)
    const player = runtime.state.players.get(playerId)
    assertRule(player, `Unknown pending death player ${playerId}`)
    runtime.append(
      { type: 'player.died', playerId, causes: [...death.causes], announced: true },
      visibility.god,
    )
  }
  runtime.append(
    { type: 'public.announcement', code: 'night-deaths', playerIds: deaths, params: {} },
    visibility.public,
  )
}
