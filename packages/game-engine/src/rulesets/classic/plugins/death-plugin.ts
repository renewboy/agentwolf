import type { PlayerAction } from '@agentwolf/contracts'
import { assertRule } from '../../../errors.js'
import type { RulePlugin } from '../../../plugins/loader.js'
import type { RulesetBuilder } from '../../../plugins/ruleset.js'
import { appendAbilityOutcomes, effectsForActions } from '../../../resolution.js'
import { visibility, type RuleRuntime } from '../../../rule-registry.js'
import { classicPluginIds } from './ids.js'
import { appendFinalDeath, bySeat, phase } from './shared.js'

export const classicDeathPlugin: RulePlugin<RulesetBuilder> = {
  id: classicPluginIds.death,
  version: 1,
  requires: [{ id: classicPluginIds.resolution, version: 1 }],
  register: ({ rules }) => {
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
    rules.registerActorSelector('last-words-eligible', (runtime) =>
      bySeat(
        runtime,
        [...runtime.state.recentDeaths.values()]
          .filter((death) => {
            const nightDeath = death.causes.some(
              (cause) => cause === 'werewolf' || cause === 'poison',
            )
            if (!nightDeath) return true
            if (runtime.board.policies.nightLastWords === 'every-night') return true
            return (
              runtime.board.policies.nightLastWords === 'first-night-only' &&
              runtime.state.day === 1
            )
          })
          .map((death) => death.playerId),
      ),
    )
    rules.registerPredicate(
      'has-death-trigger',
      (runtime) => rules.selectActors('pending-death-trigger-owners', runtime).length > 0,
    )
    rules.registerPredicate(
      'has-last-words',
      (runtime) => rules.selectActors('last-words-eligible', runtime).length > 0,
    )
    rules.registerPhaseHandler(phase('phase-death-triggers'), resolveDeathTriggers, {
      id: 'classic-death-triggers',
    })
  },
}

function resolveDeathTriggers(runtime: RuleRuntime): void {
  const actions = runtime.state.phaseActions.filter(
    (action): action is Extract<PlayerAction, { type: 'skill-trigger' }> =>
      action.type === 'skill-trigger',
  )
  for (const action of actions) {
    const player = runtime.state.players.get(action.actorId)
    assertRule(player, `Unknown trigger actor ${action.actorId}`)
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
      appendFinalDeath(runtime, death.playerId, death.causes)
    }
  }
}
