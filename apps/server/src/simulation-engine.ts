import type { SimulationCapture, SimulationFixture } from '@agentwolf/contracts'
import { boardManifestFromSnapshot, GameEngine } from '@agentwolf/game-engine'

type SimulationInput = SimulationCapture | SimulationFixture

export function createSimulationEngine(simulation: SimulationInput) {
  const board = boardManifestFromSnapshot(simulation.setup.board)
  let tick = 0
  const clock = (): Date => new Date(Date.UTC(2000, 0, 1, 0, 0, tick++))
  const engine = GameEngine.create({
    matchId: simulation.setup.matchId,
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
  })
  return { board, clock, engine }
}
