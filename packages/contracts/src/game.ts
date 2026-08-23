import { z } from 'zod'
import {
  AgentProfileIdSchema,
  BoardIdSchema,
  MatchIdSchema,
  PlayerIdSchema,
  RoleIdSchema,
} from './ids.js'

export const MatchStatusSchema = z.enum(['draft', 'starting', 'running', 'paused', 'ended'])
export type MatchStatus = z.infer<typeof MatchStatusSchema>

export const SpectatorViewSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('god') }),
  z.object({ kind: z.literal('closed-eye') }),
  z.object({ kind: z.literal('player'), playerId: PlayerIdSchema }),
])
export type SpectatorView = z.infer<typeof SpectatorViewSchema>

export const SeatAssignmentInputSchema = z.object({
  seat: z.number().int().positive(),
  name: z.string().trim().min(1).max(24),
  profileId: AgentProfileIdSchema,
  roleId: RoleIdSchema.optional(),
})
export type SeatAssignmentInput = z.infer<typeof SeatAssignmentInputSchema>

export const CreateMatchRequestSchema = z.object({
  boardId: BoardIdSchema,
  seats: z.array(SeatAssignmentInputSchema).min(6).max(24),
  roleAssignment: z.enum(['random', 'manual']).default('random'),
})
export type CreateMatchRequest = z.infer<typeof CreateMatchRequestSchema>

export const BoardSummarySchema = z.object({
  id: BoardIdSchema,
  name: z.string(),
  description: z.string(),
  playerCount: z.number().int().positive(),
  roles: z.array(
    z.object({
      roleId: RoleIdSchema,
      count: z.number().int().positive(),
      name: z.string(),
    }),
  ),
  sheriff: z.boolean(),
})
export type BoardSummary = z.infer<typeof BoardSummarySchema>

export const SeatViewSchema = z.object({
  playerId: PlayerIdSchema,
  seat: z.number().int().positive(),
  name: z.string(),
  alive: z.boolean(),
  canVote: z.boolean(),
  sheriff: z.boolean(),
  active: z.boolean(),
  roleId: RoleIdSchema.optional(),
  roleName: z.string().optional(),
  faction: z.enum(['village', 'werewolf', 'independent']).optional(),
  sessionStatus: z.enum([
    'idle',
    'starting',
    'ready',
    'syncing',
    'thinking',
    'submitted',
    'failed',
    'closed',
  ]),
})
export type SeatView = z.infer<typeof SeatViewSchema>

export const TimelineItemSchema = z.object({
  sequence: z.number().int().positive(),
  kind: z.string(),
  title: z.string(),
  detail: z.string().optional(),
  playerIds: z.array(PlayerIdSchema),
  occurredAt: z.string().datetime(),
})
export type TimelineItem = z.infer<typeof TimelineItemSchema>

export const MatchViewSchema = z.object({
  id: MatchIdSchema,
  boardId: BoardIdSchema,
  boardName: z.string(),
  status: MatchStatusSchema,
  day: z.number().int().nonnegative(),
  phaseId: z.string(),
  phaseLabel: z.string(),
  seats: z.array(SeatViewSchema),
  timeline: z.array(TimelineItemSchema),
  activeSpeech: z
    .object({
      playerId: PlayerIdSchema,
      text: z.string(),
      final: z.boolean(),
    })
    .nullable(),
  winner: z.enum(['village', 'werewolf', 'independent']).nullable(),
  pausedReason: z.string().nullable(),
})
export type MatchView = z.infer<typeof MatchViewSchema>

export const SpeechPlaybackStateSchema = z.object({
  enabled: z.boolean(),
  controlledByThisClient: z.boolean(),
  pendingSequence: z.number().int().positive().nullable(),
})
export type SpeechPlaybackState = z.infer<typeof SpeechPlaybackStateSchema>

export const LiveClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('view.set'), view: SpectatorViewSchema }),
  z.object({ type: z.literal('speech-playback.set'), enabled: z.boolean() }),
  z.object({
    type: z.literal('speech-playback.resolve'),
    sequence: z.number().int().positive(),
    outcome: z.enum(['completed', 'skipped']),
  }),
])
export type LiveClientMessage = z.infer<typeof LiveClientMessageSchema>

export const LiveErrorCodeSchema = z.enum([
  'invalid-live-message',
  'speech-playback-controller-busy',
  'speech-playback-invalid-resolution',
])
export type LiveErrorCode = z.infer<typeof LiveErrorCodeSchema>

export const LiveMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('snapshot'), view: SpectatorViewSchema, data: MatchViewSchema }),
  z.object({
    type: z.literal('speech-chunk'),
    matchId: MatchIdSchema,
    playerId: PlayerIdSchema,
    text: z.string(),
  }),
  z.object({ type: z.literal('speech-playback.state'), state: SpeechPlaybackStateSchema }),
  z.object({ type: z.literal('event'), sequence: z.number().int().positive() }),
  z.object({ type: z.literal('error'), code: LiveErrorCodeSchema.optional(), message: z.string() }),
])
export type LiveMessage = z.infer<typeof LiveMessageSchema>
