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
        events: [
          {
            payload: {
              type: 'match.ended',
              winner: 'village',
              winningPlayerIds: [first],
              reason: 'test',
            },
          },
        ],
      },
      board: {},
      repository: { postgameReviews: { createCountdown } },
    }
    const run = (winningPlayerIds: readonly string[], events = base.engine.events) =>
      ensurePostgameCountdown({
        ...base,
        engine: {
          ...base.engine,
          events:
            events === base.engine.events
              ? [
                  {
                    payload: {
                      type: 'match.ended',
                      winner: 'village',
                      winningPlayerIds,
                      reason: 'test',
                    },
                  },
                ]
              : events,
        },
        ruleset: { roles: {} },
      } as never)

    expect(() => run([PlayerIdSchema.parse('player-99')])).toThrow(/outside the Match/)
    expect(() => run([])).toThrow(/winning and losing/)
    expect(() => run([first, second])).toThrow(/winning and losing/)
    expect(() => run([first], [])).toThrow(/no match.ended event/)
    run([first])
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
