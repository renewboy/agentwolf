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

  it('rejects unknown reviewers, duplicate/self/unexpected ratings, and allows a sole self nominee', () => {
    const eligibility = outcome(['player-1'], ['player-2', 'player-3'])
    const completeRatings = eligibility.playerIds
      .filter((playerId) => playerId !== 'player-1')
      .map((playerId) => rating(playerId))
    expect(() =>
      validatePostgameReviewSubmission(eligibility, 'player-99' as PlayerId, {
        mvpPlayerId: 'player-1' as PlayerId,
        svpPlayerId: 'player-2' as PlayerId,
        ratings: completeRatings,
      }),
    ).toThrow(/Unknown postgame reviewer/)
    expect(() =>
      validatePostgameReviewSubmission(eligibility, 'player-1' as PlayerId, {
        mvpPlayerId: 'player-1' as PlayerId,
        svpPlayerId: 'player-2' as PlayerId,
        ratings: [rating('player-2'), rating('player-2')],
      }),
    ).toThrow(/repeat a player/)
    expect(() =>
      validatePostgameReviewSubmission(eligibility, 'player-1' as PlayerId, {
        mvpPlayerId: 'player-1' as PlayerId,
        svpPlayerId: 'player-2' as PlayerId,
        ratings: [rating('player-1'), rating('player-2')],
      }),
    ).toThrow(/cannot rate itself/)
    expect(() =>
      validatePostgameReviewSubmission(eligibility, 'player-1' as PlayerId, {
        mvpPlayerId: 'player-1' as PlayerId,
        svpPlayerId: 'player-2' as PlayerId,
        ratings: [rating('player-2'), rating('player-99')],
      }),
    ).toThrow(/missing: player-3.*unexpected: player-99/)
    expect(
      validatePostgameReviewSubmission(eligibility, 'player-1' as PlayerId, {
        mvpPlayerId: 'player-1' as PlayerId,
        svpPlayerId: 'player-2' as PlayerId,
        ratings: completeRatings,
      }).mvpPlayerId,
    ).toBe('player-1')
  })

  it('rejects incomplete/duplicate/missing reviewers and malformed rating coverage during aggregation', () => {
    const eligibility = outcome(['player-1', 'player-2'], ['player-3', 'player-4'])
    const valid = buildTiedSubmissions(eligibility, false)
    expect(() => aggregatePostgameReview(eligibility, valid.slice(0, 3))).toThrow(
      /requires 4 submissions/,
    )
    expect(() =>
      aggregatePostgameReview(eligibility, [valid[0]!, valid[0]!, valid[2]!, valid[3]!]),
    ).toThrow(/one entry per player/)
    expect(() =>
      aggregatePostgameReview(eligibility, [
        valid[0]!,
        valid[1]!,
        valid[2]!,
        { ...valid[3]!, reviewerId: 'player-99' as PlayerId },
      ]),
    ).toThrow(/Missing postgame submission/)
    expect(() =>
      aggregatePostgameReview(eligibility, [
        { ...valid[0]!, ratings: [...valid[0]!.ratings, rating('player-99')] },
        ...valid.slice(1),
      ]),
    ).toThrow(/Unknown rated player/)
    expect(() =>
      aggregatePostgameReview(eligibility, [
        { ...valid[0]!, ratings: valid[0]!.ratings.slice(1) },
        ...valid.slice(1),
      ]),
    ).toThrow(/received 2 ratings/)
  })

  it('rejects empty award pools and ballots outside an award pool', () => {
    const noWinners = outcome([], ['player-1', 'player-2'])
    const submissions = noWinners.playerIds.map((reviewerId) => ({
      matchId: noWinners.matchId,
      reviewerId,
      mvpPlayerId: 'player-1' as PlayerId,
      svpPlayerId: reviewerId === 'player-1' ? ('player-2' as PlayerId) : ('player-1' as PlayerId),
      ratings: noWinners.playerIds
        .filter((playerId) => playerId !== reviewerId)
        .map((playerId) => rating(playerId)),
      submittedAt: '2026-08-28T00:00:00.000Z',
    }))
    expect(() => aggregatePostgameReview(noWinners, submissions)).toThrow(/MVP has no eligible/)

    const eligibility = outcome(['player-1'], ['player-2'])
    const invalid = eligibility.playerIds.map((reviewerId) => ({
      matchId: eligibility.matchId,
      reviewerId,
      mvpPlayerId: 'player-99' as PlayerId,
      svpPlayerId: 'player-2' as PlayerId,
      ratings: eligibility.playerIds
        .filter((playerId) => playerId !== reviewerId)
        .map((playerId) => rating(playerId)),
      submittedAt: '2026-08-28T00:00:00.000Z',
    }))
    expect(() => aggregatePostgameReview(eligibility, invalid)).toThrow(/Invalid MVP ballot/)
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
