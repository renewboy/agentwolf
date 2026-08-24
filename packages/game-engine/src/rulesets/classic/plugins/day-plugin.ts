import type { RulePlugin } from '../../../plugins/loader.js'
import type { RulesetBuilder } from '../../../plugins/ruleset.js'
import { visibility, type RuleRuntime } from '../../../rule-registry.js'
import { resolveDaySpeechOrder } from '../../../speech-order.js'
import { emitVoteResolution } from '../../../vote-resolution.js'
import { classicPluginIds } from './ids.js'
import { appendFinalDeath, bySeat, phase } from './shared.js'

export const classicDayPlugin: RulePlugin<RulesetBuilder> = {
  id: classicPluginIds.day,
  version: 1,
  register: ({ interrupts, rules }) => {
    interrupts.register({
      id: 'classic-day-detonation',
      events: (runtime, definition) =>
        definition.context === 'sheriff-election' &&
        runtime.board.policies.sheriffExplosion === 'single-explosion-loses-badge'
          ? [
              {
                payload: {
                  type: 'sheriff.badge-lost' as const,
                  reason: 'self-destruct-during-election',
                },
                visibility: visibility.public,
              },
            ]
          : [],
      nextPhase: (runtime, definition) => {
        if (rules.evaluate('has-death-trigger', runtime)) return phase('phase-death-triggers')
        if (rules.evaluate('has-winner', runtime)) return phase('phase-match-ended')
        if (definition.context === 'sheriff-election') return phase('phase-day-announcement')
        if (rules.evaluate('dead-sheriff-holds-badge', runtime)) {
          return phase('phase-sheriff-transfer')
        }
        return phase('phase-last-words')
      },
    })
    rules.registerActorSelector('day-speech-order', (runtime) => runtime.state.speechOrder)
    rules.registerActorSelector('eligible-voters', (runtime) =>
      bySeat(
        runtime,
        [...runtime.state.players.values()]
          .filter((player) => player.alive && player.canVote)
          .map((player) => player.id),
      ),
    )
    rules.registerActorSelector('exile-tied-players', (runtime) =>
      bySeat(runtime, runtime.state.lastVote?.tiedPlayerIds ?? []),
    )
    rules.registerActorSelector('eligible-runoff-voters', (runtime) => {
      const tied = new Set(runtime.state.lastVote?.tiedPlayerIds ?? [])
      return bySeat(
        runtime,
        [...runtime.state.players.values()]
          .filter((player) => player.alive && player.canVote && !tied.has(player.id))
          .map((player) => player.id),
      )
    })
    rules.registerPredicate(
      'exile-vote-tied',
      (runtime) => (runtime.state.lastVote?.tiedPlayerIds.length ?? 0) > 1,
    )
    rules.registerPhaseHandler(phase('phase-day-speech-order'), resolveDaySpeechOrder, {
      id: 'classic-day-speech-order',
    })
    rules.registerPhaseHandler(
      phase('phase-day-vote'),
      (runtime) => emitVoteResolution(runtime, 'exile', true),
      { id: 'classic-day-vote' },
    )
    rules.registerPhaseHandler(
      phase('phase-day-runoff-vote'),
      (runtime) => emitVoteResolution(runtime, 'exile-runoff', true),
      { id: 'classic-day-runoff-vote' },
    )
    rules.registerPhaseHandler(
      phase('phase-day-resolve'),
      (runtime) => runtime.append({ type: 'day.completed' }, visibility.god),
      { id: 'classic-day-complete', order: -200 },
    )
    rules.registerPhaseHandler(phase('phase-day-resolve'), resolveExile, {
      id: 'classic-exile-resolve',
    })
  },
}

function resolveExile(runtime: RuleRuntime): void {
  const targetId = runtime.state.lastVote?.selectedPlayerId
  if (!targetId) {
    runtime.append(
      { type: 'public.announcement', code: 'no-exile', playerIds: [], params: {} },
      visibility.public,
    )
    return
  }
  if (runtime.state.preventedExilePlayerId === targetId) return
  appendFinalDeath(runtime, targetId, ['exile'])
}
