import { z } from 'zod'
import { AbilityIdSchema, PlayerIdSchema, RoleIdSchema } from './ids.js'

export const RoleEffectIdSchema = z.enum([
  'werewolf-attack',
  'werewolf-self-destruct',
  'seer-inspect',
  'witch-antidote',
  'witch-poison',
  'hunter-shot',
  'idiot-reveal',
  'guard-protect',
])
export type RoleEffectId = z.infer<typeof RoleEffectIdSchema>

export const RoleEffectCueSchema = z.object({
  cueId: z.string().min(1).max(160),
  sequence: z.number().int().positive(),
  effectId: RoleEffectIdSchema,
  roleId: RoleIdSchema,
  abilityId: AbilityIdSchema.nullable(),
  sourcePlayerIds: z.array(PlayerIdSchema),
  targetPlayerIds: z.array(PlayerIdSchema),
  variant: z.string().max(80).nullable(),
  tier: z.enum(['medium', 'large']),
  occurredAt: z.string().datetime(),
})
export type RoleEffectCue = z.infer<typeof RoleEffectCueSchema>

export const RoleEffectModeSchema = z.enum(['full', 'reduced', 'off'])
export type RoleEffectMode = z.infer<typeof RoleEffectModeSchema>
