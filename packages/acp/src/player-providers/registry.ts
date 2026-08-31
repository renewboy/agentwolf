import { PlayerProviderRegistry } from '../player-provider-contracts.js'
import { claudePlayerProvider } from './claude.js'
import { codebuddyPlayerProvider } from './codebuddy.js'
import { codexPlayerProvider } from './codex.js'
import { traePlayerProvider } from './trae.js'

export const defaultPlayerProviderRegistry = new PlayerProviderRegistry([
  traePlayerProvider,
  codexPlayerProvider,
  claudePlayerProvider,
  codebuddyPlayerProvider,
])
