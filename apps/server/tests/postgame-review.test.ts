import {
  MatchIdSchema,
  PlayerIdSchema,
  type PlayerId,
  type PostgameReviewSubmission,
} from '@agentwolf/contracts'
import { describe, expect, it } from 'vitest'
import {
  aggregatePostgameReview,
  validatePostgameReviewSubmission,
  type PostgameReviewEligibility,
} from '../src/postgame-review-aggregate.js'

describe('postgame review aggregation', () => {
  it('uses explicit winning players and rates every other seat across multiple losing factions', () => {
    const eligibility = outcome(
      ['player-3'],
      ['player-1', 'player-2', 'player-4', 'player-5', 'player-6'],
    )
    const submissions = eligibility.playerIds.map((reviewerId) =>
      validatePostgameReviewSubmission(eligibility, reviewerId, {
        mvpPlayerId: 'player-3' as PlayerId,
        svpPlayerId:
          reviewerId === 'player-1' ? ('player-2' as PlayerId) : ('player-1' as PlayerId),
        ratings: eligibility.playerIds
          .filter((playerId) => playerId !== reviewerId)
          .map((playerId) => ({
            playerId,
            scores: {
              information: Number(playerId.slice(-1)),
              communication: 6,
              decision: 7,
              objective: 8,
              adaptability: 9,
            },
          })),
      }),
    )

    const result = aggregatePostgameReview(eligibility, submissions)
    expect(result.mvp).toMatchObject({ playerId: 'player-3', votes: 6, resolvedBy: 'votes' })
    expect(result.svp).toMatchObject({ playerId: 'player-1', votes: 5, resolvedBy: 'votes' })
    expect(result.players.find((player) => player.playerId === 'player-4')).toMatchObject({
      scores: { information: 4, communication: 6, decision: 7, objective: 8, adaptability: 9 },
      ratingCount: 5,
    })
  })

  it('rejects incomplete sheets, self ratings, and nominees outside the outcome pools', () => {
    const eligibility = outcome(
      ['player-1', 'player-2'],
      ['player-3', 'player-4', 'player-5', 'player-6'],
    )
    expect(() =>
      validatePostgameReviewSubmission(eligibility, 'player-1' as PlayerId, {
        mvpPlayerId: 'player-1' as PlayerId,
        svpPlayerId: 'player-3' as PlayerId,
        ratings: [rating('player-1')],
      }),
    ).toThrow('cannot nominate itself')
    expect(() =>
      validatePostgameReviewSubmission(eligibility, 'player-1' as PlayerId, {
        mvpPlayerId: 'player-3' as PlayerId,
        svpPlayerId: 'player-4' as PlayerId,
        ratings: eligibility.playerIds.slice(1, -1).map((playerId) => rating(playerId)),
      }),
    ).toThrow('MVP nominee')
  })

  it('uses exact score totals and then a stable draw after tied ballots', () => {
    const eligibility = outcome(['player-1', 'player-2'], ['player-3', 'player-4'])
    const tied = buildTiedSubmissions(eligibility, false)
    const scoreResolved = aggregatePostgameReview(
      eligibility,
      buildTiedSubmissions(eligibility, true),
    )
    expect(scoreResolved.mvp).toMatchObject({ playerId: 'player-1', resolvedBy: 'score' })
    const first = aggregatePostgameReview(eligibility, tied)
    const second = aggregatePostgameReview(eligibility, tied)
    expect(first.mvp.resolvedBy).toBe('stable-draw')
    expect(second.mvp).toEqual(first.mvp)
    expect(first.players.every((player) => player.overall === 7)).toBe(true)
  })
})

function outcome(winners: string[], losers: string[]): PostgameReviewEligibility {
  const winningPlayerIds = winners.map((value) => PlayerIdSchema.parse(value))
  const losingPlayerIds = losers.map((value) => PlayerIdSchema.parse(value))
  return {
    matchId: MatchIdSchema.parse('match-postgame-review-test'),
    playerIds: [...winningPlayerIds, ...losingPlayerIds].sort((left, right) =>
      left.localeCompare(right),
    ),
    winningPlayerIds,
    losingPlayerIds,
  }
}

function rating(playerId: string, score = 7) {
  return {
    playerId: PlayerIdSchema.parse(playerId),
    scores: {
      information: score,
      communication: score,
      decision: score,
      objective: score,
      adaptability: score,
    },
  }
}

function buildTiedSubmissions(
  eligibility: PostgameReviewEligibility,
  favorFirstWinner: boolean,
): PostgameReviewSubmission[] {
  return eligibility.playerIds.map((reviewerId, index) =>
    validatePostgameReviewSubmission(eligibility, reviewerId, {
      mvpPlayerId:
        reviewerId === 'player-1' || (reviewerId !== 'player-2' && index % 2 === 1)
          ? ('player-2' as PlayerId)
          : ('player-1' as PlayerId),
      svpPlayerId:
        reviewerId === 'player-3' || (reviewerId !== 'player-4' && index % 2 === 1)
          ? ('player-4' as PlayerId)
          : ('player-3' as PlayerId),
      ratings: eligibility.playerIds
        .filter((playerId) => playerId !== reviewerId)
        .map((playerId) => rating(playerId, favorFirstWinner && playerId === 'player-1' ? 8 : 7)),
    }),
  )
}
