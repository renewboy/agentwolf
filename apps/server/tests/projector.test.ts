import { GameEventSchema, MatchIdSchema, PlayerIdSchema } from '@agentwolf/contracts'
import type { NarrationCatalog } from '@agentwolf/assets'
import { describe, expect, it } from 'vitest'
import { projectTimeline } from '../src/projector.js'

describe('vote timeline projection', () => {
  it('groups ballots by target using seat numbers without player names', () => {
    const matchId = MatchIdSchema.parse('match-vote-projection')
    const players = new Map(
      Array.from({ length: 6 }, (_, index) => {
        const playerId = PlayerIdSchema.parse(`player-${index + 1}`)
        return [
          playerId,
          { playerId, seat: index + 1, name: `不应展示的名字${index + 1}` },
        ] as const
      }),
    )
    const catalog: NarrationCatalog = {
      players,
      roleName: (roleId) => roleId,
    }
    const votes = [
      ['player-2', 'player-1'],
      ['player-3', 'player-1'],
      ['player-4', 'player-1'],
      ['player-1', 'player-4'],
      ['player-5', 'player-4'],
      ['player-6', 'player-4'],
    ] as const
    const events = votes.map(([voterId, targetId], index) =>
      GameEventSchema.parse({
        matchId,
        sequence: index + 1,
        occurredAt: '2026-08-23T00:00:00.000Z',
        visibility: { kind: 'public' },
        payload: {
          type: 'vote.cast',
          voterId,
          targetId,
          kind: 'exile',
          weight: 1,
        },
      }),
    )
    events.push(
      GameEventSchema.parse({
        matchId,
        sequence: 7,
        occurredAt: '2026-08-23T00:00:01.000Z',
        visibility: { kind: 'public' },
        payload: {
          type: 'vote.resolved',
          kind: 'exile',
          totals: { 'player-1': 3, 'player-4': 3 },
          tiedPlayerIds: ['player-1', 'player-4'],
          selectedPlayerId: null,
        },
      }),
    )

    const result = projectTimeline(events, catalog)
    expect(result).toHaveLength(1)
    expect(result[0]?.title).toBe('投票结算：1号、4号同为3票。')
    expect(result[0]?.detail).toBe('投1号：2号、3号、4号\n投4号：1号、5号、6号')
    expect(`${result[0]?.title}\n${result[0]?.detail}`).not.toContain('不应展示的名字')
  })

  it('keeps weighted ballots and abstentions visible in grouped rows', () => {
    const matchId = MatchIdSchema.parse('match-weighted-vote-projection')
    const player1 = PlayerIdSchema.parse('player-1')
    const player2 = PlayerIdSchema.parse('player-2')
    const player3 = PlayerIdSchema.parse('player-3')
    const catalog: NarrationCatalog = {
      players: new Map([
        [player1, { playerId: player1, seat: 1, name: '甲' }],
        [player2, { playerId: player2, seat: 2, name: '乙' }],
        [player3, { playerId: player3, seat: 3, name: '丙' }],
      ]),
      roleName: (roleId) => roleId,
    }
    const events = [
      GameEventSchema.parse({
        matchId,
        sequence: 1,
        occurredAt: '2026-08-23T00:00:00.000Z',
        visibility: { kind: 'public' },
        payload: {
          type: 'vote.cast',
          voterId: player1,
          targetId: player3,
          kind: 'sheriff',
          weight: 1.5,
        },
      }),
      GameEventSchema.parse({
        matchId,
        sequence: 2,
        occurredAt: '2026-08-23T00:00:00.000Z',
        visibility: { kind: 'public' },
        payload: {
          type: 'vote.cast',
          voterId: player2,
          targetId: null,
          kind: 'sheriff',
          weight: 1,
        },
      }),
      GameEventSchema.parse({
        matchId,
        sequence: 3,
        occurredAt: '2026-08-23T00:00:01.000Z',
        visibility: { kind: 'public' },
        payload: {
          type: 'vote.resolved',
          kind: 'sheriff',
          totals: { 'player-3': 1.5 },
          tiedPlayerIds: [player3],
          selectedPlayerId: player3,
        },
      }),
    ]

    const result = projectTimeline(events, catalog)
    expect(result[0]?.title).toBe('投票结算：3号以1.5票获得最高票。')
    expect(result[0]?.detail).toBe('投3号：1号（1.5票）\n弃票：2号')
  })
})
