import type { PlayerId } from '@agentwolf/contracts'
import type { ActionExpectation } from './action-mailbox.js'
import type { ContextEnvelope } from './context-renderer.js'
import type { PlayerRuntime } from './player-runtime.js'

export interface PreparedActorTurn {
  readonly playerId: PlayerId
  readonly runtime: PlayerRuntime
  readonly envelope: ContextEnvelope
  readonly expectation: ActionExpectation
}
