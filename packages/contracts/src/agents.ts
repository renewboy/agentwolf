import { z } from 'zod'
import { AgentProfileIdSchema, AgentToolIdSchema } from './ids.js'

export const AGENT_PROMPT_TIMEOUT_DEFAULT_MS = 600_000

export const AgentToolKindSchema = z.enum(['trae-cli', 'codex', 'claude', 'codebuddy', 'custom'])
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
  reasoningEffort: z.string().trim().min(1).max(80).optional(),
  mode: z.string().trim().min(1).optional(),
  promptTimeoutMs: z
    .number()
    .int()
    .min(5_000)
    .max(600_000)
    .default(AGENT_PROMPT_TIMEOUT_DEFAULT_MS),
  connection: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type AgentProfile = z.infer<typeof AgentProfileSchema>

export const AgentConfigurationSummarySchema = z.object({
  name: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(160),
  reasoningEffort: z.string().trim().min(1).max(80).nullable(),
})
export type AgentConfigurationSummary = z.infer<typeof AgentConfigurationSummarySchema>

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

export const AgentDiscoveryInputSchema = z.object({
  model: z.string().trim().min(1).max(160).optional(),
})
export type AgentDiscoveryInput = z.infer<typeof AgentDiscoveryInputSchema>

export const AgentProbeResultSchema = z.object({
  ok: z.boolean(),
  agentName: z.string().optional(),
  agentVersion: z.string().optional(),
  protocolVersion: z.number().int().optional(),
  models: z.array(z.string()),
  currentModel: z.string().optional(),
  reasoningEfforts: z.array(z.string()).default([]),
  currentReasoningEffort: z.string().optional(),
  modes: z.array(z.string()),
  message: z.string(),
  durationMs: z.number().int().nonnegative(),
})
export type AgentProbeResult = z.infer<typeof AgentProbeResultSchema>
