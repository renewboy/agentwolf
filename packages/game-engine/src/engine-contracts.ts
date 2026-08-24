import type {
  AbilityId,
  AgentProfileId,
  GameEvent,
  MatchId,
  PhaseId,
  PlayerAction,
  PlayerId,
  RoleId,
} from '@agentwolf/contracts'
import type { RuleRegistry } from './rule-registry.js'
import type { RoleRegistry } from './roles/registry.js'
import type { RulesetRuntime } from './plugins/ruleset.js'
import type { BoardManifest, GameState, PhaseNode } from './types.js'

export interface EnginePlayerInput {
  readonly id: PlayerId
  readonly seat: number
  readonly name: string
  readonly profileId: AgentProfileId
  readonly roleId?: RoleId
}

export interface GameEngineOptions {
  readonly matchId: MatchId
  readonly board: BoardManifest
  readonly players: readonly EnginePlayerInput[]
  readonly roleAssignment: 'random' | 'manual'
  readonly seed: number
  readonly clock?: () => Date
  readonly ruleset?: RulesetRuntime
  readonly roles?: RoleRegistry
  readonly rules?: RuleRegistry
}

export interface GameEngineRestoreOptions {
  readonly matchId: MatchId
  readonly board: BoardManifest
  readonly events: readonly GameEvent[]
  readonly status: GameState['status']
  readonly pausedReason: string | null
  readonly clock?: () => Date
  readonly ruleset?: RulesetRuntime
  readonly roles?: RoleRegistry
  readonly rules?: RuleRegistry
}

export interface TurnDescriptor {
  readonly phaseId: PhaseId
  readonly labelKey: string
  readonly mode: 'parallel' | 'sequential'
  readonly actionType: NonNullable<PhaseNode['action']>['type']
  readonly actors: readonly PlayerId[]
  readonly speechKind?: Extract<PlayerAction, { type: 'speech' }>['kind']
  readonly voteKind?: Extract<PlayerAction, { type: 'vote' }>['kind']
  readonly abilityId?: AbilityId
  readonly allowedAbilityIds?: readonly AbilityId[]
  readonly interruptAbilityIds?: readonly AbilityId[]
}

export interface SubmitActionOptions {
  readonly deferContinuation?: boolean
}
