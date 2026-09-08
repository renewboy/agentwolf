import { CharacterIdSchema, type CharacterId } from '@agentwolf/contracts'
import { z } from 'zod'
import rawVoices from '../voices/manifest.json' with { type: 'json' }

const VoiceRecordSchema = z.strictObject({
  characterId: CharacterIdSchema,
  referenceFile: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*\.flac$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  referenceText: z.string().trim().min(1).max(4_000),
})

const VoiceCatalogSchema = z
  .array(VoiceRecordSchema)
  .nonempty()
  .refine(
    (records) => new Set(records.map(({ characterId }) => characterId)).size === records.length,
    'Character voice IDs must be unique',
  )
  .refine(
    (records) => new Set(records.map(({ referenceFile }) => referenceFile)).size === records.length,
    'Character voice files must be unique',
  )

export interface BuiltInCharacterVoice {
  readonly characterId: CharacterId
  readonly referenceFile: string
  readonly sha256: string
  readonly referenceText: string
  readonly revision: string
}

export const builtInCharacterVoices: readonly BuiltInCharacterVoice[] = Object.freeze(
  VoiceCatalogSchema.parse(rawVoices).map((record) =>
    Object.freeze({ ...record, revision: `${record.sha256}:${record.referenceText}` }),
  ),
)

export function builtInCharacterVoiceFile(characterId: CharacterId): string | null {
  return (
    builtInCharacterVoices.find((voice) => voice.characterId === characterId)?.referenceFile ?? null
  )
}
