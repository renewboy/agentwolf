import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  builtInCharacterCards,
  builtInCharacterPortraitFile,
  renderCharacterPrompt,
} from '../src/characters.js'

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
      }),
    )
  })

  it('keeps full reasoning quality above Character expression', () => {
    for (const character of builtInCharacterCards) {
      const prompt = renderCharacterPrompt(character, '唯一昵称')
      expect(prompt).toContain('先使用完整推理能力')
      expect(prompt).toContain('不得为了符合角色形象而故意漏判')
      expect(prompt).toContain('唯一昵称')
      expect(prompt).toContain(character.name)
    }
  })
})
