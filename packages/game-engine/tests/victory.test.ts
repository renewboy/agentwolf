import { describe, expect, it } from 'vitest'
import { evaluateVictory, sixPlayerBoard, standardBoard, type GameState } from '../src/index.js'
import { actorsWithRole, createManualEngine } from './helpers.js'

describe('victory policy', () => {
  it('awards the village when all werewolves are dead', () => {
    const engine = createManualEngine(standardBoard)
    const wolves = new Set(actorsWithRole(engine, 'role-werewolf'))
    expect(evaluateVictory(withDead(engine.state, wolves), standardBoard)?.winner).toBe('village')
  })

  it('awards werewolves after either village edge is eliminated', () => {
    const engine = createManualEngine(standardBoard)
    const villagers = new Set(actorsWithRole(engine, 'role-villager'))
    expect(evaluateVictory(withDead(engine.state, villagers), standardBoard)?.reason).toBe(
      'all-villagers-eliminated',
    )
    const gods = new Set(
      [...engine.state.players.values()]
        .filter((player) => player.faction === 'village' && player.roleId !== 'role-villager')
        .map((player) => player.id),
    )
    expect(evaluateVictory(withDead(engine.state, gods), standardBoard)?.reason).toBe(
      'all-gods-eliminated',
    )
  })

  it('returns no winner while both edges and a wolf remain', () => {
    const engine = createManualEngine(standardBoard)
    expect(evaluateVictory(engine.state, standardBoard)).toBeNull()
  })

  it('requires every non-werewolf to die on the six-player board', () => {
    const engine = createManualEngine(sixPlayerBoard)
    const villagers = new Set(actorsWithRole(engine, 'role-villager'))
    expect(evaluateVictory(withDead(engine.state, villagers), sixPlayerBoard)).toBeNull()

    const village = new Set(
      [...engine.state.players.values()]
        .filter((player) => player.faction === 'village')
        .map((player) => player.id),
    )
    expect(evaluateVictory(withDead(engine.state, village), sixPlayerBoard)?.reason).toBe(
      'all-non-werewolves-eliminated',
    )
  })
})

function withDead(state: GameState, ids: ReadonlySet<string>): GameState {
  return {
    ...state,
    players: new Map(
      [...state.players].map(([id, player]) => [
        id,
        ids.has(id) ? { ...player, alive: false, canVote: false } : player,
      ]),
    ),
  }
}
