import { PlayerIdSchema, type CharacterCardSnapshot } from '@agentwolf/contracts'
import { describe, expect, it, vi } from 'vitest'
import type { ContextEnvelope, ContextRenderer } from '../src/context-renderer.js'
import { bootstrapPendingPlayers, playerCharacters } from '../src/player-bootstrap.js'
import type { PlayerRuntime } from '../src/player-runtime.js'

const playerOne = PlayerIdSchema.parse('player-1')
const playerTwo = PlayerIdSchema.parse('player-2')
const foundation: ContextEnvelope = {
  prompt: 'FOUNDATION',
  toSequence: 1,
  visibleEvents: [],
  gameStatus: 'starting',
  pausedReason: null,
  continuation: false,
}

describe('player foundation bootstrap', () => {
  it('delivers only pending players through the compact bootstrap envelope', async () => {
    const bootstrap = vi.fn(async () => undefined)
    const acknowledgedBootstrap = vi.fn()
    const assertOpen = vi.fn()
    const ready = { needsBootstrap: true, bootstrap } as unknown as PlayerRuntime
    const acknowledged = {
      needsBootstrap: false,
      bootstrap: acknowledgedBootstrap,
    } as unknown as PlayerRuntime
    const renderer = {
      bootstrap: (envelope: ContextEnvelope) => ({ ...envelope, prompt: 'BOOTSTRAP' }),
    } as ContextRenderer

    await bootstrapPendingPlayers({
      foundations: new Map([[playerOne, foundation]]),
      playerIds: [playerOne, playerTwo],
      players: new Map([
        [playerOne, ready],
        [playerTwo, acknowledged],
      ]),
      renderer,
      concurrency: 2,
      assertOpen,
    })

    expect(assertOpen).toHaveBeenCalledOnce()
    expect(bootstrap).toHaveBeenCalledWith({ ...foundation, prompt: 'BOOTSTRAP' })
    expect(acknowledgedBootstrap).not.toHaveBeenCalled()
  })

  it('fails when a pending player has no rendered foundation', async () => {
    await expect(
      bootstrapPendingPlayers({
        foundations: new Map(),
        playerIds: [playerOne],
        players: new Map([
          [playerOne, { needsBootstrap: true, bootstrap: vi.fn() } as unknown as PlayerRuntime],
        ]),
        renderer: { bootstrap: vi.fn() } as unknown as ContextRenderer,
        concurrency: 1,
        assertOpen: vi.fn(),
      }),
    ).rejects.toThrow(/has no rendered foundation/)
  })

  it('maps configured characters by player seat', () => {
    const character = { id: 'character-test' } as CharacterCardSnapshot
    expect(
      playerCharacters(
        [
          { id: playerOne, seat: 1 },
          { id: playerTwo, seat: 2 },
        ],
        [{ seat: 1, character }],
      ),
    ).toEqual(
      new Map([
        [playerOne, character],
        [playerTwo, null],
      ]),
    )
  })
})
