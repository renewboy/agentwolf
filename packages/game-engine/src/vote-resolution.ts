import type { EventVisibility, PlayerAction, PlayerId } from '@agentwolf/contracts'
import { deterministicIndex } from './deterministic.js'
import { visibility, type RuleRuntime } from './rule-registry.js'

export function emitVoteResolution(
  runtime: RuleRuntime,
  kind: string,
  sheriffWeight: boolean,
  eventVisibility: EventVisibility = visibility.public,
  randomTieKey?: string,
): PlayerId | null {
  const votes = runtime.state.phaseActions.filter(
    (action): action is Extract<PlayerAction, { type: 'vote' }> => action.type === 'vote',
  )
  const totals: Record<string, number> = {}
  let noTargetTotal = 0
  for (const vote of [...votes].sort((left, right) => {
    const leftSeat = runtime.state.players.get(left.actorId)?.seat ?? 0
    const rightSeat = runtime.state.players.get(right.actorId)?.seat ?? 0
    return leftSeat - rightSeat
  })) {
    const weight = sheriffWeight && runtime.state.sheriff.holderId === vote.actorId ? 1.5 : 1
    runtime.append(
      {
        type: 'vote.cast',
        voterId: vote.actorId,
        targetId: vote.targetId,
        kind,
        weight,
      },
      eventVisibility,
    )
    if (vote.targetId) {
      totals[vote.targetId] = (totals[vote.targetId] ?? 0) + weight
    } else {
      noTargetTotal += weight
    }
  }
  const ranked = Object.entries(totals).sort(
    ([leftId, left], [rightId, right]) => right - left || leftId.localeCompare(rightId),
  )
  const maximum = ranked[0]?.[1] ?? 0
  const noTargetWins = kind === 'wolf-kill' && noTargetTotal > maximum
  const tiedPlayerIds = noTargetWins
    ? []
    : ranked.filter(([, total]) => total === maximum && maximum > 0).map(([id]) => id as PlayerId)
  const selectedPlayerId =
    tiedPlayerIds.length === 1
      ? (tiedPlayerIds[0] ?? null)
      : tiedPlayerIds.length > 1 && randomTieKey
        ? tiedPlayerIds[
            deterministicIndex(
              `${randomTieKey}:targets:${tiedPlayerIds.join(',')}`,
              tiedPlayerIds.length,
            )
          ]!
        : null
  runtime.append(
    { type: 'vote.resolved', kind, totals, tiedPlayerIds, selectedPlayerId },
    eventVisibility,
  )
  return selectedPlayerId
}
