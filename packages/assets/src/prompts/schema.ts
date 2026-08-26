import { z } from 'zod'
import { AbilityIdSchema, PhaseIdSchema, PluginIdSchema, RoleIdSchema } from '@agentwolf/contracts'

export const PromptAudienceSchema = z.enum(['public', 'player', 'faction', 'god'])
export type PromptAudience = z.infer<typeof PromptAudienceSchema>

export const PromptToolNameSchema = z.enum([
  'submit_speech',
  'submit_vote',
  'submit_night_action',
  'submit_sheriff_action',
  'trigger_skill',
  'submit_postgame_review',
])
export type PromptToolName = z.infer<typeof PromptToolNameSchema>

const BundleIdSchema = z.union([z.literal('_core'), PluginIdSchema])
const TemplateRefSchema = z
  .string()
  .min(5)
  .max(240)
  .superRefine((value, context) => {
    const normalized = value.startsWith('@') ? value.slice(1) : value
    if (
      normalized.startsWith('/') ||
      normalized.includes('\\') ||
      normalized.split('/').includes('..') ||
      !/^[a-z0-9_][a-z0-9_./-]*\.njk$/.test(normalized)
    ) {
      context.addIssue({ code: 'custom', message: `Invalid Prompt template reference ${value}` })
    }
  })

const AtomicTextSchema = z
  .string()
  .min(1)
  .max(4_000)
  .superRefine((value, context) => {
    if (value.includes('\n') || value.includes('\r')) {
      context.addIssue({ code: 'custom', message: 'Atomic Prompt text must be one logical line' })
    }
    if (value.includes('{%') || value.includes('{#')) {
      context.addIssue({ code: 'custom', message: 'Atomic Prompt text cannot contain block logic' })
    }
  })

const AbilityPresentationSchema = z
  .object({
    id: AbilityIdSchema,
    label: AtomicTextSchema,
    foundation: z.boolean().default(true),
    interruptTemplate: TemplateRefSchema.optional(),
  })
  .strict()

const RolePresentationSchema = z
  .object({
    id: RoleIdSchema,
    label: AtomicTextSchema,
    template: TemplateRefSchema,
    abilities: z.array(AbilityPresentationSchema).default([]),
  })
  .strict()

const PhasePresentationSchema = z
  .object({
    id: PhaseIdSchema,
    label: AtomicTextSchema,
    audience: PromptAudienceSchema,
    daytime: z.boolean(),
    template: TemplateRefSchema.nullable().default(null),
  })
  .strict()

const MatchValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.object({ exists: z.literal(true) }).strict(),
])

const PresentationShape = {
  audience: PromptAudienceSchema,
  text: AtomicTextSchema.optional(),
  template: TemplateRefSchema.optional(),
  omit: z.literal(true).optional(),
}

const EventPresentationSchema = z
  .object({
    eventType: z.string().min(1).max(120),
    where: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.]*$/), MatchValueSchema).default({}),
    paragraphAfter: z.boolean().default(false),
    ...PresentationShape,
  })
  .strict()
  .superRefine(exactlyOnePresentation)

const AnnouncementPresentationSchema = z
  .object({
    code: z.string().min(1).max(120),
    ...PresentationShape,
  })
  .strict()
  .superRefine(exactlyOnePresentation)

const SharedTemplateSchema = z
  .object({ template: TemplateRefSchema, audience: PromptAudienceSchema })
  .strict()

const CorePromptSchema = z
  .object({
    layouts: z
      .object({
        foundation: TemplateRefSchema,
        continuation: TemplateRefSchema,
        bootstrapContinuation: TemplateRefSchema,
        character: TemplateRefSchema,
        playerContract: TemplateRefSchema,
      })
      .strict(),
    factions: z
      .object({
        village: AtomicTextSchema,
        werewolf: AtomicTextSchema,
        independent: AtomicTextSchema,
      })
      .strict(),
    receipts: z.object({ accepted: AtomicTextSchema, rejected: AtomicTextSchema }).strict(),
    tools: z
      .array(
        z
          .object({
            name: PromptToolNameSchema,
            title: AtomicTextSchema,
            description: AtomicTextSchema,
            unavailable: AtomicTextSchema.optional(),
            fields: z
              .array(z.object({ name: z.string().min(1), text: AtomicTextSchema }).strict())
              .default([]),
          })
          .strict(),
      )
      .length(6),
  })
  .strict()

export const PromptBundleManifestSchema = z
  .object({
    pluginId: BundleIdSchema,
    imports: z.array(BundleIdSchema).default([]),
    shared: z.array(SharedTemplateSchema).default([]),
    roles: z.array(RolePresentationSchema).default([]),
    phases: z.array(PhasePresentationSchema).default([]),
    events: z.array(EventPresentationSchema).default([]),
    announcements: z.array(AnnouncementPresentationSchema).default([]),
    core: CorePromptSchema.optional(),
  })
  .strict()
  .superRefine((manifest, context) => {
    if ((manifest.pluginId === '_core') !== Boolean(manifest.core)) {
      context.addIssue({
        code: 'custom',
        message: 'Only _core declares core Prompt layouts and tools, and _core must declare them',
      })
    }
    if (new Set(manifest.imports).size !== manifest.imports.length) {
      context.addIssue({ code: 'custom', message: 'Prompt bundle imports must be unique' })
    }
  })

export type PromptBundleManifest = z.infer<typeof PromptBundleManifestSchema>
export type PromptRolePresentation = PromptBundleManifest['roles'][number]
export type PromptAbilityPresentation = PromptRolePresentation['abilities'][number]
export type PromptPhasePresentation = PromptBundleManifest['phases'][number]
export type PromptEventPresentation = PromptBundleManifest['events'][number]
export type PromptToolPresentation = NonNullable<PromptBundleManifest['core']>['tools'][number]

function exactlyOnePresentation(
  value: {
    readonly text?: string | undefined
    readonly template?: string | undefined
    readonly omit?: true | undefined
  },
  context: z.RefinementCtx,
): void {
  const count =
    Number(value.text !== undefined) +
    Number(value.template !== undefined) +
    Number(value.omit === true)
  if (count !== 1) {
    context.addIssue({
      code: 'custom',
      message: 'Prompt presentation requires exactly one of text, template, or omit',
    })
  }
}
