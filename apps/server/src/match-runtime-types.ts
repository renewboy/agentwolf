import type { MatchBoardSnapshot, MatchView, PlayerId, SpectatorView } from '@agentwolf/contracts'
import type { BoardManifest, GameEngine, RulesetRuntime } from '@agentwolf/game-engine'
import type { AgentCatalogService } from './agent-catalog.js'
import type { ActionExpectation } from './action-mailbox.js'
import type { ActionMailbox } from './action-mailbox.js'
import type { ServerConfig } from './config.js'
import type { ContextEnvelope } from './context-renderer.js'
import type { PlayerRuntime, PlayerSessionFactory } from './player-runtime.js'
import type { MatchRecord, SqliteRepository } from './repository.js'
import type { MatchTrajectoryRecorder } from './trajectory.js'

export interface MatchRuntimeOptions {
  readonly record: MatchRecord
  readonly engine: GameEngine
  readonly board: BoardManifest
  readonly boardSnapshot: MatchBoardSnapshot
  readonly repository: SqliteRepository
  readonly catalog: AgentCatalogService
  readonly config: ServerConfig
  readonly mailbox: ActionMailbox
  readonly trajectory: MatchTrajectoryRecorder
  readonly ruleset: RulesetRuntime
  readonly sessionFactory?: PlayerSessionFactory
  readonly sessionConcurrency?: number
  readonly restored?: boolean
  readonly postgameReviewEnabled?: boolean
  readonly archiveMatch?: (project: (view: SpectatorView) => MatchView) => Promise<void>
}

export interface PreparedActorTurn {
  readonly playerId: PlayerId
  readonly runtime: PlayerRuntime
  readonly envelope: ContextEnvelope
  readonly expectation: ActionExpectation
}
