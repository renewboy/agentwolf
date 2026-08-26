import { z } from 'zod'
import {
  MatchIdSchema,
  PlayerIdSchema,
  PostgameReflectionSchema,
  PostgameReviewResultSchema,
  PostgameReviewStateSchema,
  type MatchId,
  type PlayerId,
  type PostgameReviewResult,
  type PostgameReviewState,
} from '@agentwolf/contracts'

export const PostgameReviewRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    matchId: MatchIdSchema,
    state: PostgameReviewStateSchema,
    resumeState: z.enum(['collecting', 'speaking']).nullable(),
    terminalSequence: z.number().int().positive(),
    decisionDeadlineAt: z.string().datetime().nullable(),
    winningPlayerIds: z.array(PlayerIdSchema).min(1).max(24),
    losingPlayerIds: z.array(PlayerIdSchema).min(1).max(24),
    currentSpeakerId: PlayerIdSchema.nullable(),
    result: PostgameReviewResultSchema.nullable(),
    pausedReason: z.string().nullable(),
    createdAt: z.string().datetime(),
    startedAt: z.string().datetime().nullable(),
    completedAt: z.string().datetime().nullable(),
    updatedAt: z.string().datetime(),
  })
  .strict()
export type PostgameReviewRecord = z.infer<typeof PostgameReviewRecordSchema>

export const PostgameReviewTurnRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    matchId: MatchIdSchema,
    playerId: PlayerIdSchema,
    kind: z.enum(['submission', 'reflection']),
    state: z.enum(['running', 'failed', 'completed']),
    attempts: z.number().int().positive(),
    uncertainFailures: z.number().int().nonnegative(),
    lastError: z.string().nullable(),
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
    updatedAt: z.string().datetime(),
  })
  .strict()
export type PostgameReviewTurnRecord = z.infer<typeof PostgameReviewTurnRecordSchema>

export interface CreatePostgameReviewInput {
  readonly matchId: MatchId
  readonly terminalSequence: number
  readonly winningPlayerIds: readonly PlayerId[]
  readonly losingPlayerIds: readonly PlayerId[]
  readonly decisionDeadlineAt: string
}

export function createPostgameReviewRecord(
  input: CreatePostgameReviewInput,
  timestamp = new Date().toISOString(),
): PostgameReviewRecord {
  return PostgameReviewRecordSchema.parse({
    schemaVersion: 1,
    matchId: input.matchId,
    state: 'countdown',
    resumeState: null,
    terminalSequence: input.terminalSequence,
    decisionDeadlineAt: input.decisionDeadlineAt,
    winningPlayerIds: input.winningPlayerIds,
    losingPlayerIds: input.losingPlayerIds,
    currentSpeakerId: null,
    result: null,
    pausedReason: null,
    createdAt: timestamp,
    startedAt: null,
    completedAt: null,
    updatedAt: timestamp,
  })
}

export function withPostgameState(
  record: PostgameReviewRecord,
  state: PostgameReviewState,
  options: {
    readonly resumeState?: 'collecting' | 'speaking' | null
    readonly currentSpeakerId?: PlayerId | null
    readonly result?: PostgameReviewResult | null
    readonly pausedReason?: string | null
    readonly timestamp?: string
  } = {},
): PostgameReviewRecord {
  const timestamp = options.timestamp ?? new Date().toISOString()
  return PostgameReviewRecordSchema.parse({
    ...record,
    state,
    resumeState: options.resumeState ?? null,
    decisionDeadlineAt: state === 'countdown' ? record.decisionDeadlineAt : null,
    currentSpeakerId: options.currentSpeakerId ?? null,
    result: options.result === undefined ? record.result : options.result,
    pausedReason: options.pausedReason ?? null,
    startedAt:
      record.startedAt ?? (state === 'collecting' || state === 'speaking' ? timestamp : null),
    completedAt: state === 'completed' || state === 'skipped' ? timestamp : record.completedAt,
    updatedAt: timestamp,
  })
}

export function reflectionSequence(record: PostgameReviewRecord, seat: number): number {
  return PostgameReflectionSchema.shape.speechSequence.parse(record.terminalSequence + seat)
}
