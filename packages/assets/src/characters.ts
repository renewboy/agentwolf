import type { CharacterCard, CharacterPortraitAssetId } from '@agentwolf/contracts'
import { CharacterCardSchema } from '@agentwolf/contracts'
import rawCharacters from '../characters/zh-CN.json' with { type: 'json' }

interface BuiltInCharacterRecord {
  readonly card: CharacterCard
  readonly portraitFile: string
}

const records: readonly BuiltInCharacterRecord[] = rawCharacters.map((entry) => {
  if (typeof entry.portraitFile !== 'string' || !/^[a-z0-9-]+\.png$/.test(entry.portraitFile)) {
    throw new Error(`Invalid built-in Character portrait file for ${entry.id}`)
  }
  return { card: CharacterCardSchema.parse(entry), portraitFile: entry.portraitFile }
})

export const builtInCharacterCards: readonly CharacterCard[] = records.map(({ card }) => card)

export function builtInCharacterPortraitFile(assetId: CharacterPortraitAssetId): string | null {
  return records.find(({ card }) => card.portraitAssetId === assetId)?.portraitFile ?? null
}
