import type { RulePlugin } from '../../../plugins/loader.js'
import type { RulesetBuilder } from '../../../plugins/ruleset.js'
import { visibility, type RuleRuntime } from '../../../rule-registry.js'
import { sheriffCampaignOrder } from '../../../speech-order.js'
import { emitVoteResolution } from '../../../vote-resolution.js'
import { classicPluginIds } from './ids.js'
import { bySeat, phase } from './shared.js'

export const classicSheriffPlugin: RulePlugin<RulesetBuilder> = {
  id: classicPluginIds.sheriff,
  version: 1,
  register: ({ rules }) => {
    rules.registerActorSelector('publicly-alive', (runtime) =>
      bySeat(
        runtime,
        [...runtime.state.players.values()]
          .filter((player) => player.alive)
          .map((player) => player.id),
      ),
    )
    rules.registerActorSelector('standing-sheriff-candidates', (runtime) =>
      sheriffCampaignOrder(
        runtime.state.matchId,
        runtime.state.day,
        [...runtime.state.sheriff.standingCandidates],
        runtime.state.players,
      ),
    )
    rules.registerActorSelector('original-sheriff-noncandidates', (runtime) =>
      bySeat(
        runtime,
        [...runtime.state.players.values()]
          .filter(
            (player) => player.alive && !runtime.state.sheriff.initialCandidates.has(player.id),
          )
          .map((player) => player.id),
      ),
    )
    rules.registerActorSelector('sheriff-tied-candidates', (runtime) =>
      bySeat(runtime, runtime.state.lastVote?.tiedPlayerIds ?? []),
    )
    rules.registerActorSelector('sheriff-or-system', (runtime) => {
      const sheriffId = runtime.state.sheriff.holderId
      if (!sheriffId || !runtime.state.players.get(sheriffId)?.alive) return []
      return [sheriffId]
    })
    rules.registerActorSelector('dead-sheriff', (runtime) => {
      const sheriffId = runtime.state.sheriff.holderId
      return sheriffId && !runtime.state.players.get(sheriffId)?.alive ? [sheriffId] : []
    })

    rules.registerPredicate('first-day-with-sheriff', (runtime) =>
      Boolean(runtime.board.sheriff && runtime.state.day === 1 && !runtime.state.sheriff.badgeLost),
    )
    rules.registerPredicate(
      'multiple-standing-candidates',
      (runtime) => runtime.state.sheriff.standingCandidates.size > 1,
    )
    rules.registerPredicate(
      'sheriff-vote-tied',
      (runtime) => (runtime.state.lastVote?.tiedPlayerIds.length ?? 0) > 1,
    )
    rules.registerPredicate('dead-sheriff-holds-badge', (runtime) => {
      const sheriffId = runtime.state.sheriff.holderId
      return Boolean(sheriffId && !runtime.state.players.get(sheriffId)?.alive)
    })

    rules.registerPhaseHandler(
      phase('phase-sheriff-vote'),
      (runtime) => emitVoteResolution(runtime, 'sheriff', false),
      { id: 'classic-sheriff-vote' },
    )
    rules.registerPhaseHandler(
      phase('phase-sheriff-runoff-vote'),
      (runtime) => emitVoteResolution(runtime, 'sheriff-runoff', false),
      { id: 'classic-sheriff-runoff-vote' },
    )
    rules.registerPhaseHandler(phase('phase-sheriff-resolve'), resolveSheriff, {
      id: 'classic-sheriff-resolve',
    })
  },
}

function resolveSheriff(runtime: RuleRuntime): void {
  const standing = [...runtime.state.sheriff.standingCandidates]
  if (standing.length === 1) {
    runtime.append({ type: 'sheriff.elected', playerId: standing[0]! }, visibility.public)
    return
  }
  const sheriffVote = runtime.state.lastVote
  if (
    sheriffVote?.selectedPlayerId &&
    (sheriffVote.kind === 'sheriff' || sheriffVote.kind === 'sheriff-runoff')
  ) {
    runtime.append(
      { type: 'sheriff.elected', playerId: sheriffVote.selectedPlayerId },
      visibility.public,
    )
    return
  }
  runtime.append({ type: 'sheriff.badge-lost', reason: 'no-unique-winner' }, visibility.public)
}
