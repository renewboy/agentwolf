import { z } from 'zod'
import { MatchIdSchema, PlayerIdSchema } from './ids.js'

export const PostgameReviewScoresSchema = z
  .object({
    information: z.number().int().min(1).max(10),
    communication: z.number().int().min(1).max(10),
    decision: z.number().int().min(1).max(10),
    objective: z.number().int().min(1).max(10),
    adaptability: z.number().int().min(1).max(10),
  })
  .strict()
export type PostgameReviewScores = z.infer<typeof PostgameReviewScoresSchema>

export const PostgamePlayerRatingSchema = z
  .object({
    playerId: PlayerIdSchema,
    scores: PostgameReviewScoresSchema,
  })
  .strict()
export type PostgamePlayerRating = z.infer<typeof PostgamePlayerRatingSchema>

export const PostgameReviewSubmissionInputSchema = z
  .object({
    mvpPlayerId: PlayerIdSchema,
    svpPlayerId: PlayerIdSchema,
    ratings: z.array(PostgamePlayerRatingSchema).min(1).max(23),
  })
  .strict()
export type PostgameReviewSubmissionInput = z.infer<typeof PostgameReviewSubmissionInputSchema>

export const PostgameReviewSubmissionSchema = PostgameReviewSubmissionInputSchema.extend({
  matchId: MatchIdSchema,
  reviewerId: PlayerIdSchema,
  submittedAt: z.string().datetime(),
}).strict()
export type PostgameReviewSubmission = z.infer<typeof PostgameReviewSubmissionSchema>

export const PostgameAggregateScoresSchema = z
  .object({
    information: z.number().min(1).max(10),
    communication: z.number().min(1).max(10),
    decision: z.number().min(1).max(10),
    objective: z.number().min(1).max(10),
    adaptability: z.number().min(1).max(10),
  })
  .strict()
export type PostgameAggregateScores = z.infer<typeof PostgameAggregateScoresSchema>

export const PostgamePlayerResultSchema = z
  .object({
    playerId: PlayerIdSchema,
    scores: PostgameAggregateScoresSchema,
    overall: z.number().min(1).max(10),
    ratingCount: z.number().int().positive(),
  })
  .strict()
export type PostgamePlayerResult = z.infer<typeof PostgamePlayerResultSchema>

export const PostgameAwardSchema = z
  .object({
    playerId: PlayerIdSchema,
    votes: z.number().int().nonnegative(),
    resolvedBy: z.enum(['votes', 'score', 'stable-draw']),
  })
  .strict()
export type PostgameAward = z.infer<typeof PostgameAwardSchema>

export const PostgameReviewResultSchema = z
  .object({
    mvp: PostgameAwardSchema,
    svp: PostgameAwardSchema,
    players: z.array(PostgamePlayerResultSchema).min(2).max(24),
    completedAt: z.string().datetime(),
  })
  .strict()
export type PostgameReviewResult = z.infer<typeof PostgameReviewResultSchema>

export const PostgameReflectionSchema = z
  .object({
    matchId: MatchIdSchema,
    playerId: PlayerIdSchema,
    seat: z.number().int().positive().max(24),
    speechSequence: z.number().int().positive(),
    text: z.string().trim().min(1).max(8_000),
    occurredAt: z.string().datetime(),
  })
  .strict()
export type PostgameReflection = z.infer<typeof PostgameReflectionSchema>

export const PostgameReviewStateSchema = z.enum([
  'countdown',
  'collecting',
  'speaking',
  'paused',
  'completed',
  'skipped',
])
export type PostgameReviewState = z.infer<typeof PostgameReviewStateSchema>

export const PostgameReviewViewSchema = z
  .object({
    state: PostgameReviewStateSchema,
    decisionDeadlineAt: z.string().datetime().nullable(),
    startedAt: z.string().datetime().nullable(),
    winningPlayerIds: z.array(PlayerIdSchema).min(1).max(24),
    losingPlayerIds: z.array(PlayerIdSchema).min(1).max(24),
    submittedCount: z.number().int().nonnegative(),
    totalPlayers: z.number().int().min(2).max(24),
    currentSpeakerId: PlayerIdSchema.nullable(),
    submissions: z.array(PostgameReviewSubmissionSchema).max(24),
    result: PostgameReviewResultSchema.nullable(),
    reflections: z.array(PostgameReflectionSchema).max(24),
    pausedReason: z.string().nullable(),
  })
  .strict()
export type PostgameReviewView = z.infer<typeof PostgameReviewViewSchema>
