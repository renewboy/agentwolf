import type { PlayerAction, PlayerId } from '@agentwolf/contracts'
import { assertRule } from '../../../errors.js'
import type { RulePlugin } from '../../../plugins/loader.js'
import type { RulesetBuilder } from '../../../plugins/ruleset.js'
import { appendAbilityOutcomes, effectsForActions } from '../../../resolution.js'
import { visibility, type RuleRuntime } from '../../../rule-registry.js'
import { classicPluginIds } from './ids.js'
import { afterDeathBatchEdges, appendFinalDeath, bySeat, phase } from './shared.js'
import { hasWolfKnifeVictoryLock } from './victory-plugin.js'

export const classicDeathPlugin: RulePlugin<RulesetBuilder> = {
  id: classicPluginIds.death,
  version: 3,
  requires: [
    { id: classicPluginIds.resolution, version: 1 },
    { id: classicPluginIds.victory, version: 1 },
  ],
  register: ({ phases, rules }) => {
    phases.registerAll([
      {
        id: phase('phase-death-triggers'),
        labelKey: 'phases.deathTriggers',
        mode: 'sequential',
        action: {
          type: 'skill-trigger',
          abilityIds: [],
          abilitySource: 'decision-trigger',
          triggerSignal: 'player-death',
          validation: 'role-ability',
          visibility: 'actor',
        },
        actorSelector: 'pending-death-trigger-owners',
        edges: afterDeathBatchEdges([
          { to: phase('phase-night-guard'), when: 'interrupted-to-night' },
          { to: phase('phase-day-speech-order') },
        ]),
      },
      {
        id: phase('phase-last-words'),
        labelKey: 'phases.lastWords',
        mode: 'sequential',
        action: { type: 'speech', kind: 'last-words', visibility: 'public' },
        actorSelector: 'last-words-eligible',
        edges: [
          { to: phase('phase-match-ended'), when: 'has-winner' },
          { to: phase('phase-sheriff-transfer'), when: 'dead-sheriff-holds-badge' },
          { to: phase('phase-night-guard'), when: 'interrupted-to-night' },
          { to: phase('phase-day-speech-order') },
        ],
      },
    ])
    rules.registerActorSelector('pending-death-trigger-owners', (runtime) =>
      bySeat(
        runtime,
        [...runtime.state.recentDeaths.values()]
          .filter((death) => {
            const player = runtime.state.players.get(death.playerId)
            return Boolean(
              player &&
              runtime.triggers.abilityIdsFor(
                'player-death',
                player,
                runtime.state,
                runtime.board,
                runtime.roles,
              ).length > 0,
            )
          })
          .map((death) => death.playerId),
      ),
    )
    rules.registerActorSelector('last-words-eligible', (runtime) => {
      const eligible = [...runtime.state.recentDeaths.values()].filter((death) => {
        if (hasDeliveredLastWords(runtime, death.playerId)) {
          return false
        }
        const nightDeath = death.timing === 'night'
        if (!nightDeath) return true
        if (runtime.board.policies.nightLastWords === 'every-night') return true
        return (
          runtime.board.policies.nightLastWords === 'first-night-only' && runtime.state.day === 1
        )
      })
      const playerIds = eligible.map((death) => death.playerId)
      return eligible.every((death) => death.timing === 'day')
        ? playerIds
        : bySeat(runtime, playerIds)
    })
    rules.registerPredicate(
      'has-death-trigger',
      (runtime) =>
        !hasWolfKnifeVictoryLock(runtime.state) &&
        rules.selectActors('pending-death-trigger-owners', runtime).length > 0,
    )
    rules.registerPredicate(
      'has-last-words',
      (runtime) => rules.selectActors('last-words-eligible', runtime).length > 0,
    )
    rules.registerPredicate(
      'has-terminal-last-words',
      (runtime) =>
        rules.evaluate('has-winner', runtime) && rules.evaluate('has-last-words', runtime),
    )
    rules.registerPhaseHandler(phase('phase-death-triggers'), resolveDeathTriggers, {
      id: 'classic-death-triggers',
    })
  },
}

function hasDeliveredLastWords(runtime: RuleRuntime, playerId: PlayerId): boolean {
  const deathSequence = runtime.events.findLast(
    (event) => event.payload.type === 'player.died' && event.payload.playerId === playerId,
  )?.sequence
  if (!deathSequence) return false
  return runtime.events.some(
    (event) =>
      event.sequence > deathSequence &&
      event.payload.type === 'speech.committed' &&
      event.payload.playerId === playerId &&
      event.payload.kind === 'last-words',
  )
}

function resolveDeathTriggers(runtime: RuleRuntime): void {
  const actions = runtime.state.phaseActions.filter(
    (action): action is Extract<PlayerAction, { type: 'skill-trigger' }> =>
      action.type === 'skill-trigger',
  )
  for (const action of actions) {
    const player = runtime.state.players.get(action.actorId)
    assertRule(player, `Unknown trigger actor ${action.actorId}`)
    const triggerDeath =
      runtime.state.pendingDeaths.get(action.actorId) ??
      runtime.state.recentDeaths.get(action.actorId)
    assertRule(triggerDeath, `Trigger actor ${action.actorId} has no death record`)
    const count = (player.roleState.abilityUses[action.abilityId] ?? 0) + 1
    const result =
      action.option === 'pass' || !action.targetId
        ? null
        : effectsForActions(
            runtime.state,
            runtime.board,
            runtime.roles,
            [action],
            runtime.resolution,
            runtime.queries,
          ).agenda.settle(runtime.state, runtime.board, runtime.roles)
    runtime.append(
      { type: 'ability.used', playerId: player.id, abilityId: action.abilityId, count },
      visibility.players([player.id]),
    )
    if (!result) continue
    appendAbilityOutcomes(runtime, action, result)
    for (const death of result.pendingDeaths) {
      appendFinalDeath(runtime, death.playerId, death.causes, triggerDeath.timing ?? 'day')
    }
  }
}
