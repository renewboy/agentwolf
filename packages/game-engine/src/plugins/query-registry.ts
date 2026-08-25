import type { JsonValue, QueryType } from '@agentwolf/contracts'
import type { z } from 'zod'
import type { BoardManifest, GameState } from '../types.js'
import type { RoleRegistry } from '../roles/registry.js'
import type { SemanticOwnershipRecorder } from './semantic-ownership.js'

export interface QueryContext {
  readonly state: GameState
  readonly board: BoardManifest
  readonly roles: RoleRegistry
}

export interface QueryDefinition<Input extends JsonValue, Result extends JsonValue> {
  readonly type: QueryType
  readonly inputSchema: z.ZodType<Input>
  readonly resultSchema: z.ZodType<Result>
  resolve(input: Input, context: QueryContext): Result
}

export interface QueryModifier<Input extends JsonValue, Result extends JsonValue> {
  readonly id: string
  readonly type: QueryType
  readonly order?: number
  readonly inputSchema: z.ZodType<Input>
  readonly resultSchema: z.ZodType<Result>
  transform(input: Input, current: Result, context: QueryContext): Result
}

interface StoredQueryDefinition {
  readonly type: QueryType
  parseInput(value: unknown): JsonValue
  resolve(input: JsonValue, context: QueryContext): JsonValue
}

interface StoredQueryModifier {
  readonly id: string
  readonly type: QueryType
  readonly order: number
  readonly sequence: number
  transform(input: JsonValue, current: JsonValue, context: QueryContext): JsonValue
}

export class QueryRegistry {
  readonly #definitions = new Map<QueryType, StoredQueryDefinition>()
  readonly #modifiers: StoredQueryModifier[] = []
  #sequence = 0

  public constructor(private readonly ownership?: SemanticOwnershipRecorder) {}

  public register<Input extends JsonValue, Result extends JsonValue>(
    definition: QueryDefinition<Input, Result>,
  ): void {
    if (this.#definitions.has(definition.type)) {
      throw new Error(`Duplicate query definition ${definition.type}`)
    }
    this.ownership?.query(definition.type)
    this.#definitions.set(definition.type, {
      type: definition.type,
      parseInput: (value) => definition.inputSchema.parse(value),
      resolve: (input, context) =>
        definition.resultSchema.parse(
          definition.resolve(definition.inputSchema.parse(input), context),
        ),
    })
  }

  public registerModifier<Input extends JsonValue, Result extends JsonValue>(
    modifier: QueryModifier<Input, Result>,
  ): void {
    if (this.#modifiers.some((entry) => entry.id === modifier.id)) {
      throw new Error(`Duplicate query modifier ${modifier.id}`)
    }
    this.#modifiers.push({
      id: modifier.id,
      type: modifier.type,
      order: modifier.order ?? 0,
      sequence: ++this.#sequence,
      transform: (input, current, context) =>
        modifier.resultSchema.parse(
          modifier.transform(
            modifier.inputSchema.parse(input),
            modifier.resultSchema.parse(current),
            context,
          ),
        ),
    })
  }

  public resolve<Result extends JsonValue>(
    type: QueryType,
    input: JsonValue,
    context: QueryContext,
    _resultSchema?: z.ZodType<Result>,
  ): Result {
    const definition = this.#definitions.get(type)
    if (!definition) throw new Error(`Unknown query ${type}`)
    const parsedInput = definition.parseInput(input)
    let result = definition.resolve(parsedInput, context)
    for (const modifier of this.#modifiers
      .filter((entry) => entry.type === type)
      .sort((left, right) => left.order - right.order || left.sequence - right.sequence)) {
      result = modifier.transform(parsedInput, result, context)
    }
    return result as Result
  }
}
