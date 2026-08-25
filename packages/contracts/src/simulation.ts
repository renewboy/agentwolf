import { z } from 'zod'
import { PlayerActionSchema } from './actions.js'
import { CharacterCardSnapshotSchema } from './characters.js'
import { EventVisibilitySchema, FactionSchema, GameEventPayloadSchema } from './events.js'
import { MatchBoardSnapshotSchema } from './game.js'
import {
  AgentProfileIdSchema,
  MatchIdSchema,
  PhaseIdSchema,
  PlayerIdSchema,
  RoleIdSchema,
  SimulationIdSchema,
} from './ids.js'
import { SpeechCharacterLimitSchema } from './settings.js'

export const SimulationFaultSchema = z.enum([
  'uncertain-delivery',
  'timeout',
  'process-exit',
  'invalid-action',
  'cancelled',
  'other',
])
export type SimulationFault = z.infer<typeof SimulationFaultSchema>

export const SimulationVariantSchema = z.enum([
  'recorded',
  'parallel-seat-order',
  'parallel-reverse-order',
  'transient-delivery',
  'restart-boundary',
  'playback-completed',
  'playback-skipped',
  'playback-disconnected',
])
export type SimulationVariant = z.infer<typeof SimulationVariantSchema>

export const SimulationPlayerSchema = z.object({
  playerId: PlayerIdSchema,
  seat: z.number().int().positive(),
  name: z.string().min(1).max(80),
  profileId: AgentProfileIdSchema,
  roleId: RoleIdSchema,
  character: CharacterCardSnapshotSchema.nullable().default(null),
})
export type SimulationPlayer = z.infer<typeof SimulationPlayerSchema>

export const SimulationSetupSchema = z.object({
  matchId: MatchIdSchema,
  board: MatchBoardSnapshotSchema,
  players: z.array(SimulationPlayerSchema).min(6).max(24),
  speechCharacterLimit: SpeechCharacterLimitSchema.default(300),
})
export type SimulationSetup = z.infer<typeof SimulationSetupSchema>

export const SimulationTurnSchema = z.object({
  ordinal: z.number().int().positive(),
  kind: z.enum(['bootstrap', 'action']),
  playerId: PlayerIdSchema,
  phaseId: PhaseIdSchema.nullable(),
  actionType: z.string().min(1).max(80),
  mode: z.enum(['parallel', 'sequential']).nullable(),
  expectedActors: z.array(PlayerIdSchema),
  fromSequence: z.number().int().nonnegative(),
  toSequence: z.number().int().nonnegative(),
  visibleEventSequences: z.array(z.number().int().positive()),
  sessionGeneration: z.number().int().positive(),
  attempt: z.number().int().positive(),
  completionOrder: z.number().int().positive(),
  status: z.enum(['completed', 'failed', 'uncertain', 'cancelled']),
  fault: SimulationFaultSchema.nullable(),
  action: PlayerActionSchema.nullable(),
})
export type SimulationTurn = z.infer<typeof SimulationTurnSchema>

export const SimulationControlSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('playback.enabled'),
    order: z.number().int().positive(),
    enabled: z.boolean(),
  }),
  z.object({
    type: z.literal('playback.resolved'),
    order: z.number().int().positive(),
    sequence: z.number().int().positive(),
    outcome: z.enum(['completed', 'skipped']),
  }),
  z.object({
    type: z.literal('playback.disconnected'),
    order: z.number().int().positive(),
    sequence: z.number().int().positive().nullable(),
  }),
])
export type SimulationControl = z.infer<typeof SimulationControlSchema>

export const CanonicalSimulationEventSchema = z.object({
  sequence: z.number().int().positive(),
  visibility: EventVisibilitySchema,
  payload: GameEventPayloadSchema,
})
export type CanonicalSimulationEvent = z.infer<typeof CanonicalSimulationEventSchema>

export const SimulationCheckpointSchema = z.object({
  status: z.enum(['draft', 'starting', 'running', 'paused', 'ended']),
  day: z.number().int().nonnegative(),
  night: z.number().int().nonnegative(),
  phaseId: PhaseIdSchema.nullable(),
  winner: FactionSchema.nullable(),
  sheriffId: PlayerIdSchema.nullable(),
  alivePlayerIds: z.array(PlayerIdSchema),
  votingPlayerIds: z.array(PlayerIdSchema),
  lastSequence: z.number().int().nonnegative(),
})
export type SimulationCheckpoint = z.infer<typeof SimulationCheckpointSchema>

export const SimulationExpectedSchema = z.object({
  events: z.array(CanonicalSimulationEventSchema),
  checkpoint: SimulationCheckpointSchema,
})
export type SimulationExpected = z.infer<typeof SimulationExpectedSchema>

export const SimulationReviewedExpectedSchema = z.object({
  eventCount: z.number().int().nonnegative(),
  eventDigest: z.string().regex(/^[a-f0-9]{64}$/),
  eventTypes: z.array(z.string().min(1).max(120)),
  checkpoint: SimulationCheckpointSchema,
})
export type SimulationReviewedExpected = z.infer<typeof SimulationReviewedExpectedSchema>

const SimulationCommonSchema = z.object({
  schemaVersion: z.literal(1),
  simulationId: SimulationIdSchema,
  title: z.string().min(1).max(120),
  setup: SimulationSetupSchema,
  turns: z.array(SimulationTurnSchema),
  controls: z.array(SimulationControlSchema).default([]),
})

export const SimulationCaptureSchema = SimulationCommonSchema.extend({
  stage: z.literal('candidate'),
  source: z.object({
    matchId: MatchIdSchema,
    status: z.enum(['paused', 'ended']),
    cutoffSequence: z.number().int().nonnegative(),
    capturedAt: z.string().datetime(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  observed: SimulationExpectedSchema,
  warnings: z.array(z.string().max(2_000)),
})
export type SimulationCapture = z.infer<typeof SimulationCaptureSchema>

export const SimulationFixtureSchema = SimulationCommonSchema.extend({
  stage: z.literal('approved'),
  source: z.object({
    status: z.enum(['paused', 'ended']),
    cutoffSequence: z.number().int().nonnegative(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  expected: SimulationReviewedExpectedSchema,
  variants: z.array(SimulationVariantSchema).min(1),
  browser: z.boolean(),
})
export type SimulationFixture = z.infer<typeof SimulationFixtureSchema>

export const SimulationCandidateResultSchema = z.object({
  simulationId: SimulationIdSchema,
  relativePath: z.string().min(1),
  created: z.boolean(),
  warnings: z.array(z.string()),
})
export type SimulationCandidateResult = z.infer<typeof SimulationCandidateResultSchema>

export const SimulationReviewResultSchema = z.object({
  simulationId: SimulationIdSchema,
  relativePath: z.string().min(1),
  sourceStatus: z.enum(['paused', 'ended']),
  turns: z.number().int().nonnegative(),
  events: z.number().int().nonnegative(),
  deterministic: z.boolean(),
  replayOk: z.boolean(),
  orchestrationDeterministic: z.boolean(),
  orchestrationOk: z.boolean(),
  runnersAgree: z.boolean(),
  canApprove: z.boolean(),
  canAcceptCurrent: z.boolean(),
  failures: z.array(z.string()),
  warnings: z.array(z.string()),
  secretWarnings: z.array(z.string()),
})
export type SimulationReviewResult = z.infer<typeof SimulationReviewResultSchema>

export const SimulationApprovalRequestSchema = z.object({
  acceptCurrent: z.boolean().default(false),
  acknowledgeWarnings: z.boolean().default(false),
})
export type SimulationApprovalRequest = z.infer<typeof SimulationApprovalRequestSchema>

export const SimulationApprovalResultSchema = z.object({
  simulationId: SimulationIdSchema,
  relativePath: z.string().min(1),
  created: z.boolean(),
  variants: z.array(SimulationVariantSchema).min(1),
})
export type SimulationApprovalResult = z.infer<typeof SimulationApprovalResultSchema>

export const SimulationRunReportSchema = z.object({
  simulationId: SimulationIdSchema,
  variant: SimulationVariantSchema,
  seed: z.string().regex(/^[a-f0-9]{16}$/),
  ok: z.boolean(),
  failures: z.array(z.string()),
  actual: SimulationExpectedSchema,
})
export type SimulationRunReport = z.infer<typeof SimulationRunReportSchema>
