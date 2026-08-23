import { z } from 'zod'
import { AgentProfileIdSchema, AgentToolIdSchema } from './ids.js'

export const AgentToolKindSchema = z.enum(['trae-cli', 'codex', 'claude', 'custom'])
export type AgentToolKind = z.infer<typeof AgentToolKindSchema>

export const EnvironmentBindingSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('process'),
    variable: z.string().regex(/^[A-Z_][A-Z0-9_]*$/),
  }),
  z.object({
    source: z.literal('literal'),
    value: z.string().max(2048),
    secret: z.literal(false),
  }),
])
export type EnvironmentBinding = z.infer<typeof EnvironmentBindingSchema>

export const AgentToolSchema = z.object({
  id: AgentToolIdSchema,
  name: z.string().trim().min(1).max(80),
  kind: AgentToolKindSchema,
  command: z.string().trim().min(1),
  args: z.array(z.string()).max(32),
  environment: z.record(z.string(), EnvironmentBindingSchema),
  initialMode: z.string().trim().min(1).optional(),
  modelConfigKey: z.string().trim().min(1).default('model'),
  builtIn: z.boolean(),
})
export type AgentTool = z.infer<typeof AgentToolSchema>

export const AgentToolInputSchema = AgentToolSchema.omit({ id: true, builtIn: true })
export type AgentToolInput = z.infer<typeof AgentToolInputSchema>

export const AgentProfileSchema = z.object({
  id: AgentProfileIdSchema,
  name: z.string().trim().min(1).max(80),
  toolId: AgentToolIdSchema,
  model: z.string().trim().min(1).max(160),
  mode: z.string().trim().min(1).optional(),
  promptTimeoutMs: z.number().int().min(5_000).max(600_000).default(180_000),
  connection: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type AgentProfile = z.infer<typeof AgentProfileSchema>

export const AgentProfileInputSchema = AgentProfileSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
export type AgentProfileInput = z.infer<typeof AgentProfileInputSchema>

export const AgentProfileOrderInputSchema = z.object({
  profileIds: z
    .array(AgentProfileIdSchema)
    .refine((profileIds) => new Set(profileIds).size === profileIds.length, {
      message: 'Agent Profile order contains duplicate IDs',
    }),
})
export type AgentProfileOrderInput = z.infer<typeof AgentProfileOrderInputSchema>

export const AgentProbeResultSchema = z.object({
  ok: z.boolean(),
  agentName: z.string().optional(),
  agentVersion: z.string().optional(),
  protocolVersion: z.number().int().optional(),
  models: z.array(z.string()),
  modes: z.array(z.string()),
  message: z.string(),
  durationMs: z.number().int().nonnegative(),
})
export type AgentProbeResult = z.infer<typeof AgentProbeResultSchema>
