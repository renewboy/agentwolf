import { MatchIdSchema, PlayerIdSchema } from '@agentwolf/contracts'
import { createClassicRuleset } from '@agentwolf/game-engine'
import { describe, expect, it, vi } from 'vitest'
import { createMatchPostgameCoordinator, ensurePostgameCountdown } from '../src/match-postgame.js'

const matchId = MatchIdSchema.parse('match-postgame-guards')
const first = PlayerIdSchema.parse('player-1')
const second = PlayerIdSchema.parse('player-2')

describe('match postgame guards', () => {
  it('rejects missing, foreign, and one-sided victory outcomes plus missing terminal events', () => {
    const createCountdown = vi.fn()
    const base = {
      engine: {
        state: {
          matchId,
          players: new Map([
            [first, { id: first }],
            [second, { id: second }],
          ]),
          lastSequence: 10,
        },
        events: [{ payload: { type: 'match.ended' } }],
      },
      board: {},
      repository: { postgameReviews: { createCountdown } },
    }
    const run = (victory: unknown, events = base.engine.events) =>
      ensurePostgameCountdown({
        ...base,
        engine: { ...base.engine, events },
        ruleset: { victories: { evaluate: () => victory }, roles: {} },
      } as never)

    expect(() => run(null)).toThrow(/no victory outcome/)
    expect(() =>
      run({ winner: 'village', winningPlayerIds: [PlayerIdSchema.parse('player-99')] }),
    ).toThrow(/outside the Match/)
    expect(() => run({ winner: 'village', winningPlayerIds: [] })).toThrow(/winning and losing/)
    expect(() => run({ winner: 'village', winningPlayerIds: [first, second] })).toThrow(
      /winning and losing/,
    )
    expect(() => run({ winner: 'village', winningPlayerIds: [first] }, [])).toThrow(
      /no match.ended event/,
    )
    run({ winner: 'village', winningPlayerIds: [first] })
    expect(createCountdown).toHaveBeenCalledWith(
      expect.objectContaining({ winningPlayerIds: [first], losingPlayerIds: [second] }),
    )
  })

  it('requires a terminal event before constructing the coordinator', () => {
    expect(() =>
      createMatchPostgameCoordinator({
        engine: { state: { matchId }, events: [] },
        ruleset: createClassicRuleset(),
      } as never),
    ).toThrow(/requires a match.ended event/)
  })
})
