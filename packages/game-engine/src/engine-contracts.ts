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
import type { DeterministicIndexResolver } from './deterministic.js'

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
  readonly deterministicIndex?: DeterministicIndexResolver
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
  readonly deterministicIndex?: DeterministicIndexResolver
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
  readonly passAllowed?: boolean
  readonly interruptAbilityIds?: readonly AbilityId[]
  readonly sheriffActions?: readonly Extract<PlayerAction, { type: 'sheriff-action' }>['action'][]
}

export interface SubmitActionOptions {
  readonly deferContinuation?: boolean
}
