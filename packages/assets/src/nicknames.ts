import nicknameWords from '../names/zh-CN.json' with { type: 'json' }

export type RandomSource = () => number

export class NicknameGenerator {
  readonly #random: RandomSource

  public constructor(random: RandomSource = Math.random) {
    this.#random = random
  }

  public one(excluded: ReadonlySet<string> = new Set()): string {
    const capacity = nicknameWords.prefixes.length * nicknameWords.suffixes.length
    if (excluded.size >= capacity) throw new Error('Nickname catalog is exhausted')
    const start = Math.floor(this.#random() * capacity)
    for (let offset = 0; offset < capacity; offset += 1) {
      const index = (start + offset) % capacity
      const prefix = nicknameWords.prefixes[Math.floor(index / nicknameWords.suffixes.length)]!
      const suffix = nicknameWords.suffixes[index % nicknameWords.suffixes.length]!
      const candidate = `${prefix}${suffix}`
      if (!excluded.has(candidate)) return candidate
    }
    throw new Error('Unable to generate a unique nickname')
  }

  public many(count: number, excluded: ReadonlySet<string> = new Set()): string[] {
    const used = new Set(excluded)
    return Array.from({ length: count }, () => {
      const candidate = this.one(used)
      used.add(candidate)
      return candidate
    })
  }
}
