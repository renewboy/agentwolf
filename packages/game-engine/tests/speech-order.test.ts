import { MatchIdSchema, PlayerIdSchema, type PlayerId } from '@agentwolf/contracts'
import { describe, expect, it } from 'vitest'
import { daySpeechOrder, sheriffCampaignOrder } from '../src/index.js'

const players = Array.from({ length: 6 }, (_, index) => ({
  id: PlayerIdSchema.parse(`player-${index + 1}`),
  seat: index + 1,
  alive: true,
}))
const playerMap = new Map(players.map((player) => [player.id, player]))
const id = (seat: number): PlayerId => PlayerIdSchema.parse(`player-${seat}`)
const matchId = MatchIdSchema.parse('match-speech-order')

describe('day speech order', () => {
  it('uses a single night death as the anchor and keeps the Sheriff last', () => {
    expect(
      daySpeechOrder({
        matchId,
        day: 1,
        players: players.map((player) => ({ ...player, alive: player.seat !== 3 })),
        recentDeathIds: [id(3)],
        sheriffId: id(6),
        sheriffDirection: 'clockwise',
      }),
    ).toEqual({
      playerIds: [id(4), id(5), id(1), id(2), id(6)],
      basis: 'night-death',
      anchorPlayerId: id(3),
      direction: 'clockwise',
    })
    expect(
      daySpeechOrder({
        matchId,
        day: 1,
        players: players.map((player) => ({ ...player, alive: player.seat !== 3 })),
        recentDeathIds: [id(3)],
        sheriffId: id(6),
        sheriffDirection: 'counterclockwise',
      }).playerIds,
    ).toEqual([id(2), id(1), id(5), id(4), id(6)])
  })

  it('uses the Sheriff as the anchor for peaceful nights and multiple deaths', () => {
    expect(
      daySpeechOrder({
        matchId,
        day: 2,
        players,
        recentDeathIds: [],
        sheriffId: id(3),
        sheriffDirection: 'clockwise',
      }),
    ).toMatchObject({
      playerIds: [id(4), id(5), id(6), id(1), id(2), id(3)],
      basis: 'sheriff',
      anchorPlayerId: id(3),
    })
    expect(
      daySpeechOrder({
        matchId,
        day: 2,
        players: players.map((player) => ({
          ...player,
          alive: player.seat !== 2 && player.seat !== 5,
        })),
        recentDeathIds: [id(5), id(2)],
        sheriffId: id(3),
        sheriffDirection: 'counterclockwise',
      }),
    ).toMatchObject({
      playerIds: [id(1), id(6), id(4), id(3)],
      basis: 'sheriff',
      anchorPlayerId: id(3),
      direction: 'counterclockwise',
    })
  })

  it('uses deterministic random direction around one or more deaths without a Sheriff', () => {
    const singleInput = {
      matchId,
      day: 1,
      players: players.map((player) => ({ ...player, alive: player.seat !== 3 })),
      recentDeathIds: [id(3)],
      sheriffId: null,
    }
    const single = daySpeechOrder(singleInput)
    expect(daySpeechOrder(singleInput)).toEqual(single)
    expect(single.playerIds[0]).toBe(single.direction === 'clockwise' ? id(4) : id(2))
    expect(new Set(single.playerIds)).toEqual(new Set([id(1), id(2), id(4), id(5), id(6)]))

    const multiple = daySpeechOrder({
      matchId,
      day: 2,
      players: players.map((player) => ({
        ...player,
        alive: player.seat !== 2 && player.seat !== 5,
      })),
      recentDeathIds: [id(5), id(2)],
      sheriffId: null,
    })
    expect(multiple.anchorPlayerId).toBe(id(2))
    expect(multiple.playerIds[0]).toBe(multiple.direction === 'clockwise' ? id(3) : id(1))
  })

  it('uses deterministic random start and direction after a peaceful night without a Sheriff', () => {
    const input = { matchId, day: 3, players, recentDeathIds: [], sheriffId: null }
    const decision = daySpeechOrder(input)
    expect(daySpeechOrder(input)).toEqual(decision)
    expect(decision.basis).toBe('random')
    expect(decision.playerIds[0]).toBe(decision.anchorPlayerId)
    expect(new Set(decision.playerIds)).toEqual(new Set(players.map((player) => player.id)))
    for (let index = 1; index < decision.playerIds.length; index += 1) {
      const previous = playerMap.get(decision.playerIds[index - 1]!)!.seat
      const current = playerMap.get(decision.playerIds[index]!)!.seat
      const expected =
        decision.direction === 'clockwise'
          ? (previous % players.length) + 1
          : ((previous + players.length - 2) % players.length) + 1
      expect(current).toBe(expected)
    }
  })
})

describe('sheriff campaign order', () => {
  it('chooses a replay-stable random first candidate and then follows seat order', () => {
    const candidates = [id(1), id(3), id(4), id(6)]
    const first = sheriffCampaignOrder(matchId, 1, candidates, playerMap)
    expect(sheriffCampaignOrder(matchId, 1, candidates, playerMap)).toEqual(first)
    expect(new Set(first)).toEqual(new Set(candidates))
    expect(
      new Set(
        Array.from(
          { length: 16 },
          (_, index) =>
            sheriffCampaignOrder(
              MatchIdSchema.parse(`match-speech-order-${index}`),
              1,
              candidates,
              playerMap,
            )[0],
        ),
      ).size,
    ).toBeGreaterThan(1)
  })
})
