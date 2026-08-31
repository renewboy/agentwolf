import { z } from 'zod'
import { AbilityIdSchema, MatchIdSchema, PlayerIdSchema, RoleCardIdSchema } from './ids.js'

const ActionBaseSchema = z.object({
  matchId: MatchIdSchema,
  actorId: PlayerIdSchema,
})

export const SpeechActionSchema = ActionBaseSchema.extend({
  type: z.literal('speech'),
  text: z.string().trim().min(1).max(8_000),
  kind: z.enum(['sheriff', 'day', 'runoff', 'last-words', 'wolf-council']),
})

export const VoteActionSchema = ActionBaseSchema.extend({
  type: z.literal('vote'),
  targetId: PlayerIdSchema.nullable(),
  kind: z.enum(['sheriff', 'sheriff-runoff', 'exile', 'exile-runoff', 'wolf-kill']),
})

export const NightActionSchema = ActionBaseSchema.extend({
  type: z.literal('night-action'),
  abilityId: AbilityIdSchema,
  targetIds: z.array(PlayerIdSchema).max(3),
  roleCardId: RoleCardIdSchema.optional(),
  option: z.string().max(80).optional(),
})

export const SheriffActionKindSchema = z.enum([
  'join',
  'decline',
  'withdraw',
  'keep-running',
  'speech-clockwise',
  'speech-counterclockwise',
  'transfer',
  'destroy-badge',
])
export type SheriffActionKind = z.infer<typeof SheriffActionKindSchema>

export const SheriffActionSchema = ActionBaseSchema.extend({
  type: z.literal('sheriff-action'),
  action: SheriffActionKindSchema,
  targetId: PlayerIdSchema.nullable().optional(),
})

export const SkillTriggerActionSchema = ActionBaseSchema.extend({
  type: z.literal('skill-trigger'),
  abilityId: AbilityIdSchema,
  targetId: PlayerIdSchema.nullable(),
  option: z.string().max(80).optional(),
})

export const PlayerActionSchema = z.discriminatedUnion('type', [
  SpeechActionSchema,
  VoteActionSchema,
  NightActionSchema,
  SheriffActionSchema,
  SkillTriggerActionSchema,
])
export type PlayerAction = z.infer<typeof PlayerActionSchema>

export const ActionReceiptSchema = z.object({
  accepted: z.boolean(),
  actionId: z.string(),
  message: z.string(),
})
export type ActionReceipt = z.infer<typeof ActionReceiptSchema>
