import type { CharacterCardSnapshot, PlayerId } from '@agentwolf/contracts'
import type { ContextEnvelope, ContextRenderer } from './context-renderer.js'
import { mapConcurrently } from './match-runtime-helpers.js'
import type { PlayerRuntime } from './player-runtime.js'

export async function bootstrapPendingPlayers(options: {
  readonly foundations: ReadonlyMap<PlayerId, ContextEnvelope>
  readonly playerIds: readonly PlayerId[]
  readonly players: ReadonlyMap<PlayerId, PlayerRuntime>
  readonly renderer: ContextRenderer
  readonly assertOpen: () => void
}): Promise<void> {
  const pending = options.playerIds
    .filter((playerId) => options.players.get(playerId)?.needsBootstrap)
    .map((playerId) => {
      const foundation = options.foundations.get(playerId)
      if (!foundation) throw new Error(`Player ${playerId} has no rendered foundation`)
      return { playerId, envelope: options.renderer.bootstrap(foundation) }
    })
  await mapConcurrently(pending, async ({ playerId, envelope }) => {
    options.assertOpen()
    const runtime = options.players.get(playerId)!
    await runtime.bootstrap(envelope)
  })
}

export function playerCharacters(
  players: readonly { readonly id: PlayerId; readonly seat: number }[],
  seats: readonly {
    readonly seat: number
    readonly character?: CharacterCardSnapshot | null
  }[],
): ReadonlyMap<PlayerId, CharacterCardSnapshot | null> {
  const setupBySeat = new Map(seats.map((seat) => [seat.seat, seat]))
  return new Map(
    players.map((player) => [player.id, setupBySeat.get(player.seat)?.character ?? null]),
  )
}
