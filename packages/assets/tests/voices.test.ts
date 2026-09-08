import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { CharacterIdSchema } from '@agentwolf/contracts'
import { describe, expect, it } from 'vitest'
import * as browserAssets from '../src/index.js'
import { builtInCharacterCards } from '../src/characters.js'
import { builtInCharacterVoiceFile, builtInCharacterVoices } from '../src/voices.js'
import sources from '../voices/sources.json' with { type: 'json' }

describe('built-in Character reference voices', () => {
  it('provides every Character with an intact FLAC reference and source metadata', async () => {
    expect(builtInCharacterVoices.map(({ characterId }) => characterId).sort()).toEqual(
      builtInCharacterCards.map(({ id }) => id).sort(),
    )
    expect(sources.map(({ 角色ID }) => 角色ID).sort()).toEqual(
      builtInCharacterCards.map(({ id }) => id).sort(),
    )

    await Promise.all(
      builtInCharacterVoices.map(async (voice) => {
        const source = sources.find(({ 角色ID }) => 角色ID === voice.characterId)!
        const audio = await readFile(
          resolve(process.cwd(), 'packages/assets/voices', voice.referenceFile),
        )
        expect(voice.referenceFile).toMatch(/^[a-z0-9-]+\.flac$/)
        expect(createHash('sha256').update(audio).digest('hex')).toBe(voice.sha256)
        expect(voice.revision).toBe(`${voice.sha256}:${voice.referenceText}`)
        expect(voice.referenceText.length).toBeGreaterThan(10)
        expect(builtInCharacterVoiceFile(voice.characterId)).toBe(voice.referenceFile)
        expect(source.参考文件).toBe(voice.referenceFile)
        expect(source.参考SHA256).toBe(voice.sha256)
        expect(source.来源.every(({ 来源URL }) => new URL(来源URL).protocol === 'https:')).toBe(
          true,
        )

        expect(audio.subarray(0, 4).toString()).toBe('fLaC')
        expect(audio[4]! & 0x7f).toBe(0)
        expect(audio.readUIntBE(5, 3)).toBe(34)
        const streamInfo = audio.subarray(8, 42)
        const packedAudioFormat = streamInfo.readBigUInt64BE(10)
        expect(Number(packedAudioFormat >> 44n)).toBe(source.采样率)
        expect(Number((packedAudioFormat >> 41n) & 7n) + 1).toBe(source.声道数)
        expect(Number((packedAudioFormat >> 36n) & 31n) + 1).toBe(source.位深)
        expect(Number(packedAudioFormat & ((1n << 36n) - 1n))).toBe(source.样本数)
        expect(streamInfo.subarray(18, 34).toString('hex')).toBe(source.PCMMD5)
      }),
    )
  })

  it('keeps reviewed references and records the updated Kid reference', () => {
    expect(sources.filter(({ 试听状态 }) => 试听状态 === '已确认')).toHaveLength(11)
    expect(sources.find(({ 角色ID }) => 角色ID === 'character-kaito-kid')?.试听状态).toBe('已更新')
  })

  it('returns no file for an unbound Character and keeps references outside the browser entry', () => {
    expect(builtInCharacterVoiceFile(CharacterIdSchema.parse('character-unbound'))).toBeNull()
    expect(Object.isFrozen(builtInCharacterVoices)).toBe(true)
    expect(builtInCharacterVoices.every(Object.isFrozen)).toBe(true)
    expect(browserAssets).not.toHaveProperty('builtInCharacterVoices')
    expect(browserAssets).not.toHaveProperty('builtInCharacterVoiceFile')
  })
})
