import { z } from 'zod'
import { CharacterIdSchema, CharacterPortraitAssetIdSchema } from './ids.js'

const CharacterTraitSchema = z.string().trim().min(1).max(120)
const CharacterBoundarySchema = z.string().trim().min(1).max(160)

const CharacterCardBodySchema = z.object({
  name: z.string().trim().min(1).max(40),
  universe: z.string().trim().min(1).max(80),
  summary: z.string().trim().min(1).max(500),
  personality: z.array(CharacterTraitSchema).min(2).max(6),
  socialStyle: z.string().trim().min(1).max(300),
  reasoningPresentation: z.string().trim().min(1).max(300),
  speechStyle: z.string().trim().min(1).max(300),
  boundaries: z.array(CharacterBoundarySchema).min(1).max(6),
  portraitAssetId: CharacterPortraitAssetIdSchema,
})
export const CharacterCardInputSchema = CharacterCardBodySchema
export type CharacterCardInput = z.infer<typeof CharacterCardInputSchema>

export const CharacterCardSchema = CharacterCardBodySchema.extend({
  id: CharacterIdSchema,
  revision: z.number().int().positive(),
  source: z.enum(['built-in', 'custom']),
  editable: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type CharacterCard = z.infer<typeof CharacterCardSchema>

export const CharacterCardSnapshotSchema = CharacterCardSchema.omit({
  editable: true,
  createdAt: true,
  updatedAt: true,
})
export type CharacterCardSnapshot = z.infer<typeof CharacterCardSnapshotSchema>

export const CharacterSummarySchema = CharacterCardSchema.pick({
  id: true,
  name: true,
  universe: true,
  portraitAssetId: true,
  revision: true,
  source: true,
  editable: true,
})
export type CharacterSummary = z.infer<typeof CharacterSummarySchema>

export const CharacterPortraitUploadSchema = z.object({
  dataUrl: z
    .string()
    .max(7_500_000)
    .regex(/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/),
})
export type CharacterPortraitUpload = z.infer<typeof CharacterPortraitUploadSchema>

export const CharacterPortraitAssetSchema = z.object({
  id: CharacterPortraitAssetIdSchema,
  mediaType: z.literal('image/webp'),
  byteSize: z.number().int().positive().max(5_000_000),
  createdAt: z.string().datetime(),
})
export type CharacterPortraitAsset = z.infer<typeof CharacterPortraitAssetSchema>
