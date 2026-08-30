import { z } from 'zod'
import { PluginIdSchema, RulesetIdSchema } from './ids.js'

export const JsonValueSchema = z.json()
export type JsonValue = z.infer<typeof JsonValueSchema>

export const PluginLockSchema = z.object({
  id: PluginIdSchema,
  version: z.number().int().positive(),
  config: JsonValueSchema.default({}),
  configHash: z.string().regex(/^[a-f0-9]{64}$/),
})
export type PluginLock = z.infer<typeof PluginLockSchema>

export const RulesetLockSchema = z.object({
  id: RulesetIdSchema,
  revision: z.number().int().positive(),
  plugins: z.array(PluginLockSchema).min(1),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
})
export type RulesetLock = z.infer<typeof RulesetLockSchema>
