import {
  PhaseIdSchema,
  type DeathTiming,
  type PlayerAction,
  type PlayerId,
} from '@agentwolf/contracts'
import { appendIndividualDeaths } from '../../../death-resolution.js'
import { assertRule } from '../../../errors.js'
import type { RuleRuntime } from '../../../rule-registry.js'

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
  timing: DeathTiming = 'day',
  persistTiming = true,
): void {
  appendIndividualDeaths(runtime, [{ playerId, causes }], timing, persistTiming)
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
