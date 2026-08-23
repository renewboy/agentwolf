import { PlayerIdSchema } from '@agentwolf/contracts'
import { describe, expect, it } from 'vitest'
import { sanitizeSpeech } from '../src/index.js'

describe('sanitizeSpeech', () => {
  const players = new Map([
    [PlayerIdSchema.parse('player-1'), { name: '长夜未央', seat: 1 }],
    [PlayerIdSchema.parse('player-2'), { name: '北辰听雨', seat: 2 }],
  ])

  it('rewrites known Player IDs to public names', () => {
    expect(sanitizeSpeech('我认为 player-2 的逻辑不成立。', players)).toEqual({
      text: '我认为 北辰听雨 的逻辑不成立。',
      replacements: 1,
      unknownIds: [],
    })
  })

  it('reports unknown Player IDs without hiding them', () => {
    expect(sanitizeSpeech('player-99 值得关注。', players)).toEqual({
      text: 'player-99 值得关注。',
      replacements: 0,
      unknownIds: ['player-99'],
    })
  })
})
