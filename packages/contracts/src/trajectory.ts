import { z } from 'zod'
import { MatchIdSchema, PhaseIdSchema, PlayerIdSchema } from './ids.js'

export const RuntimeConfigSchema = z.object({ developerMode: z.boolean() })
export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>

export const TrajectoryOwnerIdSchema = z.union([z.literal('system'), PlayerIdSchema])
export type TrajectoryOwnerId = z.infer<typeof TrajectoryOwnerIdSchema>

export const TrajectoryTurnStatusSchema = z.enum([
  'running',
  'completed',
  'failed',
  'uncertain',
  'cancelled',
])
export type TrajectoryTurnStatus = z.infer<typeof TrajectoryTurnStatusSchema>

export const TrajectoryTimelineGroupSchema = z.object({
  kind: z.enum(['setup', 'night', 'sheriff', 'day', 'end']),
  index: z.number().int().positive().nullable(),
})
export type TrajectoryTimelineGroup = z.infer<typeof TrajectoryTimelineGroupSchema>

export const TrajectoryUsageSchema = z.object({
  used: z.number().int().nonnegative(),
  size: z.number().int().nonnegative(),
  cost: z
    .object({ amount: z.number(), currency: z.string().min(1) })
    .nullable()
    .default(null),
})
export type TrajectoryUsage = z.infer<typeof TrajectoryUsageSchema>

export const TrajectoryTurnSchema = z.object({
  matchId: MatchIdSchema,
  turnId: z.string().min(1).max(160),
  ownerId: TrajectoryOwnerIdSchema,
  sessionId: z.string().min(1).max(320),
  sessionGeneration: z.number().int().positive(),
  ordinal: z.number().int().positive(),
  attempt: z.number().int().positive(),
  kind: z.enum(['bootstrap', 'action']),
  phaseId: PhaseIdSchema.nullable(),
  actionType: z.string().min(1).max(80),
  timelineGroup: TrajectoryTimelineGroupSchema.default({ kind: 'setup', index: null }),
  fromSequence: z.number().int().nonnegative(),
  toSequence: z.number().int().nonnegative(),
  visibleEventSequences: z.array(z.number().int().positive()).default([]),
  gameStatus: z.enum(['draft', 'starting', 'running', 'paused', 'ended']).nullable().default(null),
  pausedReasonAtRender: z.string().nullable().default(null),
  continuation: z.boolean().default(false),
  status: TrajectoryTurnStatusSchema,
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  stopReason: z.string().max(120).nullable(),
  error: z.string().max(16_384).nullable(),
  usage: TrajectoryUsageSchema.nullable(),
  revision: z.number().int().nonnegative(),
})
export type TrajectoryTurn = z.infer<typeof TrajectoryTurnSchema>

export const TrajectoryRecordKindSchema = z.enum([
  'prompt',
  'reasoning',
  'message',
  'tool',
  'permission',
  'action',
  'usage',
  'diagnostic',
  'lifecycle',
  'error',
])
export type TrajectoryRecordKind = z.infer<typeof TrajectoryRecordKindSchema>

export const TrajectoryRecordSchema = z.object({
  matchId: MatchIdSchema,
  recordId: z.string().min(1).max(240),
  turnId: z.string().min(1).max(160),
  ownerId: TrajectoryOwnerIdSchema,
  ordinal: z.number().int().positive(),
  step: z.number().int().positive(),
  kind: TrajectoryRecordKindSchema,
  title: z.string().min(1).max(160),
  status: z.string().max(120).nullable(),
  text: z.string().max(131_072).nullable(),
  input: z.string().max(131_072).nullable(),
  output: z.string().max(131_072).nullable(),
  usage: TrajectoryUsageSchema.nullable(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  truncatedFields: z.array(z.enum(['text', 'input', 'output'])),
  revision: z.number().int().nonnegative(),
})
export type TrajectoryRecord = z.infer<typeof TrajectoryRecordSchema>

export const TrajectoryOwnerSummarySchema = z.object({
  ownerId: TrajectoryOwnerIdSchema,
  label: z.string(),
  turnCount: z.number().int().nonnegative(),
  recordCount: z.number().int().nonnegative(),
})
export type TrajectoryOwnerSummary = z.infer<typeof TrajectoryOwnerSummarySchema>

export const TrajectorySummarySchema = z.object({
  matchId: MatchIdSchema,
  revision: z.number().int().nonnegative(),
  owners: z.array(TrajectoryOwnerSummarySchema),
  turns: z.array(TrajectoryTurnSchema),
})
export type TrajectorySummary = z.infer<typeof TrajectorySummarySchema>

export const TrajectoryPageSchema = z.object({
  matchId: MatchIdSchema,
  revision: z.number().int().nonnegative(),
  ownerId: TrajectoryOwnerIdSchema,
  turns: z.array(TrajectoryTurnSchema),
  records: z.array(TrajectoryRecordSchema),
  nextBeforeTurn: z.number().int().positive().nullable(),
})
export type TrajectoryPage = z.infer<typeof TrajectoryPageSchema>

export const TrajectoryDeltaSchema = z.object({
  type: z.literal('trajectory.delta'),
  revision: z.number().int().nonnegative(),
  turns: z.array(TrajectoryTurnSchema),
  records: z.array(TrajectoryRecordSchema),
})
export type TrajectoryDelta = z.infer<typeof TrajectoryDeltaSchema>

export const TrajectoryAuditIssueSchema = z.object({
  turnId: z.string(),
  code: z.enum([
    'missing-prompt',
    'duplicate-prompt',
    'prompt-mismatch',
    'range-mismatch',
    'missing-delivery',
    'missing-acknowledgement',
    'actor-mismatch',
    'visible-events-mismatch',
    'context-budget-exceeded',
    'reconstruction-failed',
  ]),
  detail: z.string(),
})
export type TrajectoryAuditIssue = z.infer<typeof TrajectoryAuditIssueSchema>

export const TrajectoryAuditReportSchema = z.object({
  matchId: MatchIdSchema,
  ok: z.boolean(),
  auditedTurns: z.number().int().nonnegative(),
  issues: z.array(TrajectoryAuditIssueSchema),
})
export type TrajectoryAuditReport = z.infer<typeof TrajectoryAuditReportSchema>
