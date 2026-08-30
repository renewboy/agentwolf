import {
  QueryRegistry as CoreQueryRegistry,
  type QueryDefinition as CoreQueryDefinition,
  type QueryModifier as CoreQueryModifier,
} from '@agent-arena/ruleset'
import type { JsonValue, QueryType } from '@agentwolf/contracts'
import type { BoardManifest, GameState } from '../types.js'
import type { RoleRegistry } from '../roles/registry.js'
import type { SemanticOwnershipRecorder } from './semantic-ownership.js'

export interface QueryContext {
  readonly state: GameState
  readonly board: BoardManifest
  readonly roles: RoleRegistry
}

export type QueryDefinition<
  Input extends JsonValue,
  Result extends JsonValue,
> = CoreQueryDefinition<QueryType, QueryContext, Input, Result>

export type QueryModifier<Input extends JsonValue, Result extends JsonValue> = CoreQueryModifier<
  QueryType,
  QueryContext,
  Input,
  Result
>

export class QueryRegistry extends CoreQueryRegistry<QueryType, QueryContext> {
  public constructor(ownership?: SemanticOwnershipRecorder) {
    super((queryType) => ownership?.query(queryType))
  }
}
