import type { JsonValue, PluginEventType, PluginId } from '@agentwolf/contracts'
import type { z } from 'zod'
import type { GameEvent } from '@agentwolf/contracts'
import type { GameState } from '../types.js'
import type { SemanticOwnershipRecorder } from './semantic-ownership.js'

export interface PluginEventDefinition<State extends JsonValue, Data extends JsonValue> {
  readonly pluginId: PluginId
  readonly eventType: PluginEventType
  readonly schemaVersion: number
  readonly stateSchema: z.ZodType<State>
  readonly dataSchema: z.ZodType<Data>
  readonly initialState: State
  reduce(state: State, data: Data): State
}

interface StoredPluginEventDefinition {
  readonly pluginId: PluginId
  readonly eventType: PluginEventType
  readonly schemaVersion: number
  readonly initialState: JsonValue
  parseState(value: unknown): JsonValue
  parseData(value: unknown): JsonValue
  reduce(state: JsonValue, data: JsonValue): JsonValue
}

export interface PluginEventEnvelope {
  readonly pluginId: PluginId
  readonly eventType: PluginEventType
  readonly schemaVersion: number
  readonly data: JsonValue
}

export class PluginEventRegistry {
  readonly #definitions = new Map<string, StoredPluginEventDefinition>()
  readonly #legacyReducers = new Map<string, (state: GameState, event: GameEvent) => GameState>()

  public constructor(private readonly ownership?: SemanticOwnershipRecorder) {}

  public register<State extends JsonValue, Data extends JsonValue>(
    definition: PluginEventDefinition<State, Data>,
  ): void {
    const key = eventKey(definition.pluginId, definition.eventType, definition.schemaVersion)
    if (this.#definitions.has(key)) throw new Error(`Duplicate plugin event ${key}`)
    this.ownership?.pluginEvent(definition.pluginId, definition.eventType)
    this.#definitions.set(key, {
      pluginId: definition.pluginId,
      eventType: definition.eventType,
      schemaVersion: definition.schemaVersion,
      initialState: definition.stateSchema.parse(definition.initialState),
      parseState: (value) => definition.stateSchema.parse(value),
      parseData: (value) => definition.dataSchema.parse(value),
      reduce: (state, data) =>
        definition.stateSchema.parse(
          definition.reduce(definition.stateSchema.parse(state), definition.dataSchema.parse(data)),
        ),
    })
  }

  public validate(envelope: PluginEventEnvelope): PluginEventEnvelope {
    const definition = this.#definition(envelope)
    return { ...envelope, data: definition.parseData(envelope.data) }
  }

  public apply(
    states: ReadonlyMap<PluginId, JsonValue>,
    envelope: PluginEventEnvelope,
  ): ReadonlyMap<PluginId, JsonValue> {
    const definition = this.#definition(envelope)
    const current = definition.parseState(states.get(envelope.pluginId) ?? definition.initialState)
    const next = new Map(states)
    next.set(envelope.pluginId, definition.reduce(current, definition.parseData(envelope.data)))
    return next
  }

  public registerLegacyReducer(
    eventType: GameEvent['payload']['type'],
    reducer: (state: GameState, event: GameEvent) => GameState,
  ): void {
    if (this.#legacyReducers.has(eventType)) {
      throw new Error(`Duplicate legacy event reducer ${eventType}`)
    }
    this.#legacyReducers.set(eventType, reducer)
  }

  public applyLegacy(state: GameState, event: GameEvent): GameState | null {
    return this.#legacyReducers.get(event.payload.type)?.(state, event) ?? null
  }

  #definition(envelope: PluginEventEnvelope): StoredPluginEventDefinition {
    const key = eventKey(envelope.pluginId, envelope.eventType, envelope.schemaVersion)
    const definition = this.#definitions.get(key)
    if (!definition) throw new Error(`Unknown plugin event ${key}`)
    return definition
  }
}

function eventKey(pluginId: PluginId, eventType: PluginEventType, version: number): string {
  return `${pluginId}:${eventType}@${version}`
}
