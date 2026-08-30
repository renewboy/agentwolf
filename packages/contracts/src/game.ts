import { z } from 'zod'
import {
  AgentProfileIdSchema,
  BoardIdSchema,
  CharacterIdSchema,
  MatchIdSchema,
  PlayerIdSchema,
  RoleIdSchema,
} from './ids.js'
import { CharacterCardSnapshotSchema, CharacterSummarySchema } from './characters.js'
import { AgentConfigurationSummarySchema } from './agents.js'
import { PlayerMarkerIdSchema, RoleEffectCueSchema } from './effects.js'
import { RulesetLockSchema } from './plugins.js'
import { PostgameReviewViewSchema } from './postgame.js'
import { SpeechCharacterLimitSchema } from './settings.js'

export const MatchStatusSchema = z.enum(['draft', 'starting', 'running', 'paused', 'ended'])
export type MatchStatus = z.infer<typeof MatchStatusSchema>

export const PublicSpeechInterruptModeSchema = z.enum(['legacy', 'rolling'])
export type PublicSpeechInterruptMode = z.infer<typeof PublicSpeechInterruptModeSchema>

export const SpectatorViewSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('god') }),
  z.object({ kind: z.literal('closed-eye') }),
  z.object({ kind: z.literal('player'), playerId: PlayerIdSchema }),
])
export type SpectatorView = z.infer<typeof SpectatorViewSchema>

export const SeatAssignmentInputSchema = z.object({
  seat: z.number().int().positive(),
  name: z.string().trim().min(1).max(24),
  profileId: AgentProfileIdSchema.optional(),
  roleId: RoleIdSchema.optional(),
  characterId: CharacterIdSchema.nullable().optional(),
})
export type SeatAssignmentInput = z.infer<typeof SeatAssignmentInputSchema>

export const CreateMatchRequestSchema = z.object({
  boardId: BoardIdSchema,
  seats: z.array(SeatAssignmentInputSchema).min(6).max(24),
  roleAssignment: z.enum(['random', 'manual']).default('random'),
})
export type CreateMatchRequest = z.infer<typeof CreateMatchRequestSchema>

export const MatchSeatSnapshotSchema = SeatAssignmentInputSchema.omit({ characterId: true }).extend(
  {
    profileId: AgentProfileIdSchema,
    character: CharacterCardSnapshotSchema.nullable().default(null),
  },
)
export type MatchSeatSnapshot = z.infer<typeof MatchSeatSnapshotSchema>

export const MatchSetupSnapshotSchema = CreateMatchRequestSchema.omit({ seats: true }).extend({
  seats: z.array(MatchSeatSnapshotSchema).min(6).max(24),
  speechCharacterLimit: SpeechCharacterLimitSchema.default(300),
  publicSpeechInterruptMode: PublicSpeechInterruptModeSchema.default('legacy'),
})
export type MatchSetupSnapshot = z.infer<typeof MatchSetupSnapshotSchema>

export const BoardVictorySchema = z.enum(['slaughter-edge', 'slaughter-all'])
export type BoardVictory = z.infer<typeof BoardVictorySchema>

export const BoardRoleSlotSchema = z.object({
  roleId: RoleIdSchema,
  count: z.number().int().positive().max(24),
})
export type BoardRoleSlot = z.infer<typeof BoardRoleSlotSchema>

export const BoardCharacterSlotSchema = z.object({
  seat: z.number().int().positive().max(24),
  characterId: CharacterIdSchema.nullable(),
})
export type BoardCharacterSlot = z.infer<typeof BoardCharacterSlotSchema>

export const BoardAgentProfileSlotSchema = z.object({
  seat: z.number().int().positive().max(24),
  profileId: AgentProfileIdSchema.nullable(),
})
export type BoardAgentProfileSlot = z.infer<typeof BoardAgentProfileSlotSchema>

export const CustomBoardInputSchema = z.object({
  name: z.string().trim().min(1).max(48),
  description: z.string().trim().max(240).default(''),
  roles: z.array(BoardRoleSlotSchema).min(2).max(24),
  characters: z.array(BoardCharacterSlotSchema).max(24).default([]),
  agentProfiles: z.array(BoardAgentProfileSlotSchema).max(24).default([]),
  sheriff: z.boolean(),
  victory: BoardVictorySchema,
})
export type CustomBoardInput = z.infer<typeof CustomBoardInputSchema>

export const CustomBoardSchema = CustomBoardInputSchema.extend({
  id: BoardIdSchema,
  revision: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type CustomBoard = z.infer<typeof CustomBoardSchema>

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
  characters: z.array(BoardCharacterSlotSchema).max(24).default([]),
  agentProfiles: z.array(BoardAgentProfileSlotSchema).max(24).default([]),
  sheriff: z.boolean(),
  victory: BoardVictorySchema,
  source: z.enum(['built-in', 'custom']),
  editable: z.boolean(),
  revision: z.number().int().positive(),
})
export type BoardSummary = z.infer<typeof BoardSummarySchema>

const MatchBoardSnapshotFields = {
  id: BoardIdSchema,
  name: z.string().min(1),
  description: z.string(),
  roles: z.array(BoardRoleSlotSchema).min(2).max(24),
  characters: z.array(BoardCharacterSlotSchema).max(24).default([]),
  agentProfiles: z.array(BoardAgentProfileSlotSchema).max(24).default([]),
  playerCount: z.number().int().min(6).max(24),
  sheriff: z.boolean(),
  victory: BoardVictorySchema,
  source: z.enum(['built-in', 'custom']),
  revision: z.number().int().positive(),
} as const

export const BoardPolicySnapshotSchema = z.object({
  witchSelfSave: z.enum(['never', 'first-night', 'always']),
  witchPotionsPerNight: z.union([z.literal(1), z.literal(2)]),
  guardAntidoteCollision: z.enum(['death', 'survive']),
  guardCanSelfProtect: z.boolean(),
  sheriffExplosion: z.enum(['single-explosion-loses-badge', 'double-explosion-loses-badge']),
  nightLastWords: z.enum(['first-night-only', 'every-night', 'none']),
  victory: BoardVictorySchema,
})
export type BoardPolicySnapshot = z.infer<typeof BoardPolicySnapshotSchema>

export const MatchBoardSnapshotSchema = z.object({
  schemaVersion: z.literal(3),
  rulesetId: z.literal('classic'),
  ruleset: RulesetLockSchema,
  policies: BoardPolicySnapshotSchema,
  ...MatchBoardSnapshotFields,
})
export type MatchBoardSnapshot = z.infer<typeof MatchBoardSnapshotSchema>

export const RoleSummarySchema = z.object({
  id: RoleIdSchema,
  name: z.string(),
  faction: z.enum(['village', 'werewolf', 'independent']),
  kind: z.enum(['villager', 'god', 'werewolf', 'independent']),
})
export type RoleSummary = z.infer<typeof RoleSummarySchema>

export const SeatViewSchema = z.object({
  playerId: PlayerIdSchema,
  seat: z.number().int().positive(),
  name: z.string(),
  agent: AgentConfigurationSummarySchema.nullable(),
  alive: z.boolean(),
  canVote: z.boolean(),
  sheriff: z.boolean(),
  sheriffCandidate: z.boolean().default(false),
  active: z.boolean(),
  markers: z.array(PlayerMarkerIdSchema).default([]),
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
  character: CharacterSummarySchema.nullable().default(null),
})
export type SeatView = z.infer<typeof SeatViewSchema>

export const TimelineItemSchema = z.object({
  sequence: z.number().int().positive(),
  kind: z.string(),
  title: z.string(),
  detail: z.string().optional(),
  playerIds: z.array(PlayerIdSchema),
  occurredAt: z.string().datetime(),
  postgame: z.boolean().default(false),
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
  lastSequence: z.number().int().nonnegative().default(0),
  seats: z.array(SeatViewSchema),
  timeline: z.array(TimelineItemSchema),
  effectCues: z.array(RoleEffectCueSchema).default([]),
  activeSpeech: z
    .object({
      playerId: PlayerIdSchema,
      text: z.string(),
      final: z.boolean(),
    })
    .nullable(),
  winner: z.enum(['village', 'werewolf', 'independent']).nullable(),
  winningPlayerIds: z.array(PlayerIdSchema).default([]),
  pausedReason: z.string().nullable(),
  postgameReview: PostgameReviewViewSchema.nullable().default(null),
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
