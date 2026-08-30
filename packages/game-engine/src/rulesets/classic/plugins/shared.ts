import {
  PhaseIdSchema,
  type DeathTiming,
  type PlayerAction,
  type PlayerId,
} from '@agentwolf/contracts'
import { appendIndividualDeaths } from '../../../death-resolution.js'
import { assertRule } from '../../../errors.js'
import type { RuleRuntime } from '../../../rule-registry.js'
import type { PhaseEdge } from '../../../types.js'

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
): void {
  appendIndividualDeaths(runtime, [{ playerId, causes }], timing)
}

export function afterDeathBatchEdges(tail: readonly PhaseEdge[]): PhaseEdge[] {
  return [
    { to: phase('phase-death-triggers'), when: 'has-death-trigger' },
    { to: phase('phase-last-words'), when: 'has-terminal-last-words' },
    { to: phase('phase-match-ended'), when: 'has-winner' },
    { to: phase('phase-sheriff-transfer'), when: 'dead-sheriff-holds-badge' },
    { to: phase('phase-last-words'), when: 'has-last-words' },
    ...tail,
  ]
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
