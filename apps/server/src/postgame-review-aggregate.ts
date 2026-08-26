import { createHash } from 'node:crypto'
import {
  PostgameReviewResultSchema,
  PostgameReviewSubmissionInputSchema,
  PostgameReviewSubmissionSchema,
  type MatchId,
  type PlayerId,
  type PostgameAward,
  type PostgamePlayerResult,
  type PostgameReviewScores,
  type PostgameReviewSubmission,
  type PostgameReviewSubmissionInput,
} from '@agentwolf/contracts'

const scoreKeys = [
  'information',
  'communication',
  'decision',
  'objective',
  'adaptability',
] as const satisfies readonly (keyof PostgameReviewScores)[]

export interface PostgameReviewEligibility {
  readonly matchId: MatchId
  readonly playerIds: readonly PlayerId[]
  readonly winningPlayerIds: readonly PlayerId[]
  readonly losingPlayerIds: readonly PlayerId[]
}

export function validatePostgameReviewSubmission(
  eligibility: PostgameReviewEligibility,
  reviewerId: PlayerId,
  input: PostgameReviewSubmissionInput,
  submittedAt = new Date().toISOString(),
): PostgameReviewSubmission {
  const parsed = PostgameReviewSubmissionInputSchema.parse(input)
  const players = new Set(eligibility.playerIds)
  if (!players.has(reviewerId)) throw new Error(`Unknown postgame reviewer ${reviewerId}`)
  validateNominee('MVP', parsed.mvpPlayerId, reviewerId, eligibility.winningPlayerIds)
  validateNominee('SVP', parsed.svpPlayerId, reviewerId, eligibility.losingPlayerIds)

  const expectedTargets = eligibility.playerIds.filter((playerId) => playerId !== reviewerId)
  const actualTargets = parsed.ratings.map((rating) => rating.playerId)
  if (new Set(actualTargets).size !== actualTargets.length) {
    throw new Error('Postgame ratings repeat a player')
  }
  if (actualTargets.includes(reviewerId)) throw new Error('A player cannot rate itself')
  const missing = expectedTargets.filter((playerId) => !actualTargets.includes(playerId))
  const unexpected = actualTargets.filter((playerId) => !expectedTargets.includes(playerId))
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `Postgame ratings must cover every other player exactly once; missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'}`,
    )
  }
  return PostgameReviewSubmissionSchema.parse({
    ...parsed,
    ratings: expectedTargets.map((playerId) =>
      parsed.ratings.find((rating) => rating.playerId === playerId),
    ),
    matchId: eligibility.matchId,
    reviewerId,
    submittedAt,
  })
}

export function aggregatePostgameReview(
  eligibility: PostgameReviewEligibility,
  submissions: readonly PostgameReviewSubmission[],
  completedAt = new Date().toISOString(),
) {
  if (submissions.length !== eligibility.playerIds.length) {
    throw new Error(
      `Postgame review requires ${eligibility.playerIds.length} submissions, received ${submissions.length}`,
    )
  }
  const byReviewer = new Map(submissions.map((submission) => [submission.reviewerId, submission]))
  if (byReviewer.size !== eligibility.playerIds.length) {
    throw new Error('Postgame review submissions must contain one entry per player')
  }
  for (const playerId of eligibility.playerIds) {
    if (!byReviewer.has(playerId)) throw new Error(`Missing postgame submission from ${playerId}`)
  }

  const totals = new Map<PlayerId, Record<keyof PostgameReviewScores, number>>()
  const counts = new Map<PlayerId, number>()
  for (const playerId of eligibility.playerIds) {
    totals.set(playerId, emptyScores())
    counts.set(playerId, 0)
  }
  for (const submission of submissions) {
    for (const rating of submission.ratings) {
      const scoreTotal = totals.get(rating.playerId)
      if (!scoreTotal) throw new Error(`Unknown rated player ${rating.playerId}`)
      for (const key of scoreKeys) scoreTotal[key] += rating.scores[key]
      counts.set(rating.playerId, (counts.get(rating.playerId) ?? 0) + 1)
    }
  }
  const players: PostgamePlayerResult[] = eligibility.playerIds.map((playerId) => {
    const count = counts.get(playerId) ?? 0
    if (count !== eligibility.playerIds.length - 1) {
      throw new Error(`Player ${playerId} received ${count} ratings`)
    }
    const total = totals.get(playerId)!
    const scores = Object.fromEntries(scoreKeys.map((key) => [key, total[key] / count])) as Record<
      keyof PostgameReviewScores,
      number
    >
    return {
      playerId,
      scores,
      overall: scoreKeys.reduce((sum, key) => sum + total[key], 0) / (count * scoreKeys.length),
      ratingCount: count,
    }
  })
  const ratingTotals = new Map(
    eligibility.playerIds.map((playerId) => [
      playerId,
      scoreKeys.reduce((sum, key) => sum + totals.get(playerId)![key], 0),
    ]),
  )
  return PostgameReviewResultSchema.parse({
    mvp: resolveAward(
      eligibility.matchId,
      'mvp',
      eligibility.winningPlayerIds,
      submissions.map((submission) => submission.mvpPlayerId),
      ratingTotals,
    ),
    svp: resolveAward(
      eligibility.matchId,
      'svp',
      eligibility.losingPlayerIds,
      submissions.map((submission) => submission.svpPlayerId),
      ratingTotals,
    ),
    players,
    completedAt,
  })
}

function validateNominee(
  award: 'MVP' | 'SVP',
  nomineeId: PlayerId,
  reviewerId: PlayerId,
  candidates: readonly PlayerId[],
): void {
  if (!candidates.includes(nomineeId)) {
    throw new Error(`${award} nominee ${nomineeId} is not eligible`)
  }
  if (nomineeId === reviewerId && candidates.some((candidate) => candidate !== reviewerId)) {
    throw new Error(`A player cannot nominate itself for ${award} when another candidate exists`)
  }
}

function resolveAward(
  matchId: MatchId,
  kind: 'mvp' | 'svp',
  candidates: readonly PlayerId[],
  ballots: readonly PlayerId[],
  ratingTotals: ReadonlyMap<PlayerId, number>,
): PostgameAward {
  if (candidates.length === 0) throw new Error(`${kind.toUpperCase()} has no eligible candidates`)
  const votes = new Map(candidates.map((candidate) => [candidate, 0]))
  for (const ballot of ballots) {
    if (!votes.has(ballot)) throw new Error(`Invalid ${kind.toUpperCase()} ballot ${ballot}`)
    votes.set(ballot, votes.get(ballot)! + 1)
  }
  const maximumVotes = Math.max(...votes.values())
  const voteTies = candidates.filter((candidate) => votes.get(candidate) === maximumVotes)
  if (voteTies.length === 1) {
    return { playerId: voteTies[0]!, votes: maximumVotes, resolvedBy: 'votes' }
  }
  const maximumScore = Math.max(...voteTies.map((candidate) => ratingTotals.get(candidate) ?? 0))
  const scoreTies = voteTies.filter(
    (candidate) => (ratingTotals.get(candidate) ?? 0) === maximumScore,
  )
  if (scoreTies.length === 1) {
    return { playerId: scoreTies[0]!, votes: maximumVotes, resolvedBy: 'score' }
  }
  const ordered = [...scoreTies].sort((left, right) => left.localeCompare(right))
  const digest = createHash('sha256')
    .update(`${matchId}:${kind}:${ordered.join(',')}`)
    .digest('hex')
  const index = Number.parseInt(digest.slice(0, 12), 16) % ordered.length
  return { playerId: ordered[index]!, votes: maximumVotes, resolvedBy: 'stable-draw' }
}

function emptyScores(): Record<keyof PostgameReviewScores, number> {
  return {
    information: 0,
    communication: 0,
    decision: 0,
    objective: 0,
    adaptability: 0,
  }
}
