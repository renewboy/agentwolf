import type { AgentProfile, AgentTool, MatchId, PhaseId, PlayerId } from '@agentwolf/contracts'
import type { ActionMailbox } from './action-mailbox.js'
import type { PlayerSessionFactory } from './player-session-factory.js'
import type { SqliteRepository } from './repository.js'
import type { MatchTrajectoryRecorder } from './trajectory.js'

export type PlayerRuntimeStatus =
  | 'idle'
  | 'starting'
  | 'ready'
  | 'syncing'
  | 'thinking'
  | 'submitted'
  | 'failed'
  | 'closed'

export type PlayerTrajectoryContext =
  | {
      readonly kind: 'bootstrap'
      readonly phaseId: null
      readonly actionType: 'bootstrap'
      readonly systemInstructions: string
    }
  | {
      readonly kind: 'action'
      readonly phaseId: PhaseId | null
      readonly actionType: string
    }

export interface DeliveryEvents {
  started(playerId: PlayerId, deliveryId: string, fromSequence: number, toSequence: number): void
  acknowledged(playerId: PlayerId, deliveryId: string, toSequence: number): void
}

export interface PlayerRuntimeOptions {
  readonly matchId: MatchId
  readonly playerId: PlayerId
  readonly profile: AgentProfile
  readonly tool: AgentTool
  readonly workspace: string
  readonly modelInstructions: string
  readonly token: string
  readonly mcpUrl: string
  readonly mailbox: ActionMailbox
  readonly repository: SqliteRepository
  readonly deliveryEvents: DeliveryEvents
  readonly trajectory: MatchTrajectoryRecorder
  readonly allowSessionCreation?: boolean
  readonly sessionFactory?: PlayerSessionFactory
  readonly onStderr?: (chunk: string) => void
  readonly onStatusChange?: (playerId: PlayerId, status: PlayerRuntimeStatus) => void
}
