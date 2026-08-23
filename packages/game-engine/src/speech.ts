import type { PlayerId } from '@agentwolf/contracts'

export interface SpeechSanitizationResult {
  readonly text: string
  readonly replacements: number
  readonly unknownIds: readonly string[]
}

export function sanitizeSpeech(
  text: string,
  players: ReadonlyMap<PlayerId, { readonly name: string; readonly seat: number }>,
): SpeechSanitizationResult {
  let replacements = 0
  const unknownIds = new Set<string>()
  const normalized = text.trim().replace(/\bplayer-\d+\b/giu, (token) => {
    const entry = players.get(token.toLowerCase() as PlayerId)
    if (!entry) {
      unknownIds.add(token)
      return token
    }
    replacements += 1
    return entry.name
  })
  return { text: normalized, replacements, unknownIds: [...unknownIds] }
}
