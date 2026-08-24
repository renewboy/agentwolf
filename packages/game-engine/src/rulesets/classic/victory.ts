import type { Faction } from '@agentwolf/contracts'
import type { BoardManifest, GameState } from '../../types.js'
import type { RoleRegistry } from '../../roles/registry.js'

export interface VictoryResult {
  readonly winner: Faction
  readonly reason: string
}

export function evaluateVictory(
  state: GameState,
  board: BoardManifest,
  roles: RoleRegistry,
): VictoryResult | null {
  const living = [...state.players.values()].filter((player) => player.alive)
  const wolves = living.filter((player) => player.faction === 'werewolf')
  if (wolves.length === 0) {
    return { winner: 'village', reason: 'all-werewolves-eliminated' }
  }

  if (board.policies.victory === 'slaughter-all') {
    const nonWolves = living.filter((player) => player.faction !== 'werewolf')
    return nonWolves.length === 0
      ? { winner: 'werewolf', reason: 'all-non-werewolves-eliminated' }
      : null
  }

  const livingVillagers = living.filter((player) => {
    if (!player.roleId) return false
    return roles.role(player.roleId).kind === 'villager'
  })
  const livingGods = living.filter((player) => {
    if (!player.roleId || player.faction !== 'village') return false
    return roles.role(player.roleId).kind === 'god'
  })
  if (livingVillagers.length === 0) {
    return { winner: 'werewolf', reason: 'all-villagers-eliminated' }
  }
  if (livingGods.length === 0) {
    return { winner: 'werewolf', reason: 'all-gods-eliminated' }
  }
  return null
}
