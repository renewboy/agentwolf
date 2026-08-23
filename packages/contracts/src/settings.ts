import { z } from 'zod'

export const SpeechCharacterLimitSchema = z.number().int().min(50).max(2_000)
export type SpeechCharacterLimit = z.infer<typeof SpeechCharacterLimitSchema>

export const GlobalSettingsSchema = z.object({
  speechCharacterLimit: SpeechCharacterLimitSchema.default(300),
})
export type GlobalSettings = z.infer<typeof GlobalSettingsSchema>
