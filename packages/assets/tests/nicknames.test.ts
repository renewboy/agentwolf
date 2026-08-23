import { describe, expect, it } from 'vitest'
import { NicknameGenerator } from '../src/index.js'

describe('NicknameGenerator', () => {
  it('generates a unique group from the word catalog', () => {
    const generator = new NicknameGenerator(() => 0)
    const names = generator.many(12)
    expect(new Set(names).size).toBe(12)
  })

  it('respects excluded names and reports exhaustion', () => {
    const generator = new NicknameGenerator(() => 0)
    const first = generator.one()
    expect(generator.one(new Set([first]))).not.toBe(first)
    const capacity = 30 * 30
    const all = new Set(generator.many(capacity))
    expect(() => generator.one(all)).toThrow(/exhausted/)
  })
})
