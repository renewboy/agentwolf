import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export type PromptAssetId =
  | 'player-foundation'
  | 'speech-turn'
  | 'vote-turn'
  | 'wolf-vote-turn'
  | 'night-turn'
  | 'sheriff-turn'
  | 'speech-order-turn'
  | 'skill-turn'

const promptFiles: Record<PromptAssetId, URL> = {
  'player-foundation': new URL('../prompts/player-foundation.md', import.meta.url),
  'speech-turn': new URL('../prompts/speech-turn.md', import.meta.url),
  'vote-turn': new URL('../prompts/vote-turn.md', import.meta.url),
  'wolf-vote-turn': new URL('../prompts/wolf-vote-turn.md', import.meta.url),
  'night-turn': new URL('../prompts/night-turn.md', import.meta.url),
  'sheriff-turn': new URL('../prompts/sheriff-turn.md', import.meta.url),
  'speech-order-turn': new URL('../prompts/speech-order-turn.md', import.meta.url),
  'skill-turn': new URL('../prompts/skill-turn.md', import.meta.url),
}

export async function loadPromptAsset(id: PromptAssetId): Promise<string> {
  return readFile(fileURLToPath(promptFiles[id]), 'utf8')
}

export function renderPrompt(template: string, values: Readonly<Record<string, string>>): string {
  const rendered = template.replace(/\{\{([A-Z][A-Z0-9_]*)\}\}/g, (_match, key: string) => {
    const value = values[key]
    if (value === undefined) {
      throw new Error(`Missing prompt value: ${key}`)
    }
    return value
  })
  const unresolved = rendered.match(/\{\{[A-Z][A-Z0-9_]*\}\}/)
  if (unresolved) {
    throw new Error(`Unresolved prompt placeholder: ${unresolved[0]}`)
  }
  return rendered.trim()
}
