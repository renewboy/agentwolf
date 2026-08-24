import { PhaseIdSchema, type PlayerAction, type PlayerId } from '@agentwolf/contracts'
import { assertRule } from '../../../errors.js'
import { visibility, type RuleRuntime } from '../../../rule-registry.js'

export function phase(id: string): ReturnType<typeof PhaseIdSchema.parse> {
  return PhaseIdSchema.parse(id)
}

export function bySeat(runtime: RuleRuntime, ids: Iterable<PlayerId>): PlayerId[] {
  return [...ids].sort((left, right) => {
    const leftSeat = runtime.state.players.get(left)?.seat ?? Number.MAX_SAFE_INTEGER
    const rightSeat = runtime.state.players.get(right)?.seat ?? Number.MAX_SAFE_INTEGER
    return leftSeat - rightSeat
  })
}

export function appendFinalDeath(
  runtime: RuleRuntime,
  playerId: PlayerId,
  causes: readonly string[],
): void {
  const player = runtime.state.players.get(playerId)
  assertRule(player, `Unknown death target ${playerId}`)
  runtime.append(
    { type: 'player.died', playerId, causes: [...causes], announced: false },
    visibility.god,
  )
  runtime.append(
    {
      type: 'public.announcement',
      code: 'player-eliminated',
      playerIds: [playerId],
      params: {},
    },
    visibility.public,
  )
}

export function currentNightActions(runtime: RuleRuntime): PlayerAction[] {
  const nightStart = [...runtime.events]
    .reverse()
    .find((event) => event.payload.type === 'night.started')
  const fromSequence = nightStart?.sequence ?? 0
  return runtime.events
    .filter((event) => event.sequence > fromSequence && event.payload.type === 'action.submitted')
    .map((event) => {
      assertRule(event.payload.type === 'action.submitted', 'Expected submitted action event')
      return event.payload.action
    })
}
