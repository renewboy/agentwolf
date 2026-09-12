import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { builtInCharacterCards, builtInCharacterPortraitFile } from '../src/characters.js'
import { characterPerformance } from '../src/character-performances.js'

describe('built-in Character catalog', () => {
  it('contains twelve complete cards with project-bound portraits', async () => {
    expect(builtInCharacterCards).toHaveLength(12)
    expect(new Set(builtInCharacterCards.map(({ id }) => id))).toHaveProperty('size', 12)
    await Promise.all(
      builtInCharacterCards.map(async (character) => {
        const file = builtInCharacterPortraitFile(character.portraitAssetId)
        expect(file).toMatch(/\.png$/)
        await access(resolve(process.cwd(), 'packages/assets/characters/portraits', file!))
        expect(character.personality.length).toBeGreaterThanOrEqual(2)
        expect(character.boundaries.length).toBeGreaterThanOrEqual(1)
        const rig = characterPerformance(character)!
        expect(rig).toBeTruthy()
        expect(rig.id).toBe(character.id.replace('character-', ''))
        await access(
          resolve(process.cwd(), 'packages/assets/characters/performances', rig.id, 'neutral.webp'),
        )
        expect(
          characterPerformance({
            ...character,
            id: builtInCharacterCards.find((card) => card.id !== character.id)!.id,
          }),
        ).toBeNull()
      }),
    )
  })
  it('does not resolve a portrait without a matching registered character and artwork', () => {
    expect(characterPerformance(null)).toBeNull()
    expect(characterPerformance(undefined)).toBeNull()
    expect(
      characterPerformance({ ...builtInCharacterCards[0]!, id: 'custom-character' as never }),
    ).toBeNull()
  })
})
