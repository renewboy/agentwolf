import { assertRule } from './errors.js'

export function deterministicIndex(key: string, length: number): number {
  assertRule(length > 0, 'Deterministic selection requires at least one value')
  let hash = 0x811c_9dc5
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 0x0100_0193)
  }
  return (hash >>> 0) % length
}
