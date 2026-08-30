import type { PlayerId } from '@agentwolf/contracts'
import type { PromptPlayerFact } from './facts.js'

export function playerFact(
  playerId: PlayerId,
  players: ReadonlyMap<PlayerId, PromptPlayerFact>,
): PromptPlayerFact {
  const player = players.get(playerId)
  if (!player) throw new Error(`Unknown Prompt Player ${playerId}`)
  return player
}

export function seatLabel(
  playerId: PlayerId,
  players: ReadonlyMap<PlayerId, PromptPlayerFact>,
): string {
  return `${playerFact(playerId, players).seat} 号玩家`
}

export function speakerLabel(
  playerId: PlayerId,
  players: ReadonlyMap<PlayerId, PromptPlayerFact>,
): string {
  const player = playerFact(playerId, players)
  return `${player.name}（${player.seat} 号玩家）`
}

export function initialPlayerLabel(
  playerId: PlayerId,
  players: ReadonlyMap<PlayerId, PromptPlayerFact>,
): string {
  const player = playerFact(playerId, players)
  return `${player.name}（${player.seat} 号玩家，Player ID：${player.playerId}）`
}
