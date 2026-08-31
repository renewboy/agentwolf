import type { MatchId, SimulationCapture, SimulationFixture } from '@agentwolf/contracts'
import {
  boardManifestFromSnapshot,
  deterministicIndex as defaultDeterministicIndex,
  GameEngine,
  type DeterministicIndexResolver,
} from '@agentwolf/game-engine'
import { RulesetCatalog } from './ruleset-catalog.js'

type SimulationInput = SimulationCapture | SimulationFixture

export interface CreateSimulationEngineOptions {
  readonly matchId?: MatchId
  readonly onDeterministicIndex?: (key: string, length: number, index: number) => void
}

export function createSimulationEngine(
  simulation: SimulationInput,
  options: CreateSimulationEngineOptions = {},
) {
  const board = boardManifestFromSnapshot(simulation.setup.board)
  const ruleset = new RulesetCatalog().forExecution(simulation.setup.board)
  const matchId = options.matchId ?? simulation.setup.matchId
  const deterministicControls = new Map<
    string,
    Extract<SimulationInput['controls'][number], { type: 'deterministic.index' }>
  >()
  for (const control of simulation.controls) {
    if (control.type !== 'deterministic.index') continue
    if (deterministicControls.has(control.key)) {
      throw new Error(`Duplicate deterministic index control for ${control.key}`)
    }
    deterministicControls.set(control.key, control)
  }
  const deterministicIndex: DeterministicIndexResolver = (key, length) => {
    const control = deterministicControls.get(key)
    if (control) {
      if (control.length !== length || control.index >= length) {
        throw new Error(`Invalid deterministic index control for ${key}`)
      }
      return control.index
    }
    const index = defaultDeterministicIndex(key, length)
    options.onDeterministicIndex?.(key, length, index)
    return index
  }
  let tick = 0
  const clock = (): Date => new Date(Date.UTC(2000, 0, 1, 0, 0, tick++))
  const engine = GameEngine.create({
    matchId,
    board,
    players: simulation.setup.players.map((player) => ({
      id: player.playerId,
      seat: player.seat,
      name: player.name,
      profileId: player.profileId,
      roleId: player.roleId,
    })),
    roleAssignment: 'manual',
    seed: 1,
    clock,
    ruleset,
    deterministicIndex,
  })
  return { board, clock, deterministicIndex, engine, matchId, ruleset }
}
