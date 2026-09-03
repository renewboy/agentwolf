import { resolve } from 'node:path'
import { PostgamePromptAssets } from '@agentwolf/assets/prompts'
import type { PlayerId, SpeechId } from '@agentwolf/contracts'
import type { BoardManifest, GameEngine, RulesetRuntime } from '@agentwolf/game-engine'
import type { ServerConfig } from './config.js'
import type { MatchRecord, SqliteRepository } from './repository.js'
import type { PlayerRuntime } from './player-runtime.js'
import { PostgameReviewCoordinator } from './postgame-review-coordinator.js'
import { promptRegistryFor } from './prompt-registry.js'
import type { CommittedSpeechPlaybackItem } from './speech-playback-coordinator.js'
import { ContextRenderer } from './context-renderer.js'

export function ensurePostgameCountdown(options: {
  readonly engine: GameEngine
  readonly board: BoardManifest
  readonly ruleset: RulesetRuntime
  readonly repository: SqliteRepository
}): void {
  const endedEvent = options.engine.events.findLast((event) => event.payload.type === 'match.ended')
  if (!endedEvent || endedEvent.payload.type !== 'match.ended') {
    throw new Error('Ended Match has no match.ended event')
  }
  const playerIds = [...options.engine.state.players.keys()]
  const winningPlayerIds = [...endedEvent.payload.winningPlayerIds]
  if (winningPlayerIds.some((playerId) => !playerIds.includes(playerId))) {
    throw new Error('Victory outcome contains a Player outside the Match')
  }
  const losingPlayerIds = playerIds.filter((playerId) => !winningPlayerIds.includes(playerId))
  if (winningPlayerIds.length === 0 || losingPlayerIds.length === 0) {
    throw new Error('Postgame review requires winning and losing players')
  }
  options.repository.postgameReviews.createCountdown({
    matchId: options.engine.state.matchId,
    terminalSequence: options.engine.state.lastSequence,
    winningPlayerIds,
    losingPlayerIds,
    decisionDeadlineAt: new Date(Date.now() + 10_000).toISOString(),
  })
}

export function createMatchPostgameCoordinator(options: {
  readonly engine: GameEngine
  readonly board: BoardManifest
  readonly ruleset: RulesetRuntime
  readonly repository: SqliteRepository
  readonly config: ServerConfig
  readonly record: MatchRecord
  readonly playerRuntime: (playerId: PlayerId) => PlayerRuntime | null
  readonly ensurePlayerSessions: () => Promise<void>
  readonly onChanged: () => void
  readonly onSpeechChunk: (speechId: SpeechId, playerId: PlayerId, text: string) => void
  readonly waitForFinalSpeech: (item: CommittedSpeechPlaybackItem) => Promise<unknown>
  readonly onTerminal: () => Promise<void>
}): PostgameReviewCoordinator {
  const prompts = promptRegistryFor(options.ruleset)
  const endedEvent = options.engine.events.findLast((event) => event.payload.type === 'match.ended')
  if (!endedEvent || endedEvent.payload.type !== 'match.ended') {
    throw new Error('Postgame coordinator requires a match.ended event')
  }
  const terminalState = options.engine.state
  const terminalEvents = [...options.engine.events]
  const contextRenderer = new ContextRenderer(options.ruleset)
  return new PostgameReviewCoordinator({
    matchId: options.engine.state.matchId,
    state: options.engine.state,
    repository: options.repository.postgameReviews,
    prompts: new PostgamePromptAssets({
      root: resolve(options.config.projectRoot, 'packages/assets/prompts'),
    }),
    labels: {
      role: (roleId) => prompts.roleLabel(roleId),
      faction: (faction) => prompts.factionLabel(faction),
    },
    terminalDay: terminalState.day,
    terminalNight: terminalState.night,
    winnerLabel: prompts.factionLabel(endedEvent.payload.winner),
    publicHistory: (playerId, afterSequence) =>
      contextRenderer.publicHistorySince(
        terminalState,
        options.board,
        terminalEvents,
        playerId,
        afterSequence,
      ),
    speechCharacterLimit: options.record.setup.speechCharacterLimit,
    playerRuntime: options.playerRuntime,
    ensurePlayerSessions: options.ensurePlayerSessions,
    onChanged: options.onChanged,
    onSpeechChunk: options.onSpeechChunk,
    waitForFinalSpeech: options.waitForFinalSpeech,
    onTerminal: options.onTerminal,
  })
}
