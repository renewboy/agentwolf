import type { RequestPermissionRequest, SessionUpdate } from '@agentclientprotocol/sdk'
import {
  TrajectoryDeltaSchema,
  TrajectoryRecordSchema,
  TrajectoryTurnSchema,
  type MatchId,
  type GameEvent,
  type PhaseId,
  type PlayerAction,
  type PlayerId,
  type TrajectoryDelta,
  type TrajectoryRecord,
  type TrajectoryTurn,
  type TrajectoryTurnStatus,
  type TrajectoryUsage,
} from '@agentwolf/contracts'
import type { SqliteRepository } from './repository.js'
import { recordTrajectoryRuntimeControl } from './trajectory-runtime-control.js'

const contentLimit = 131_072
const diagnosticLimit = 16_384
const secretKey =
  /authorization|cookie|credential|password|secret|token|api[-_]?key|private[-_]?key/i

export interface TrajectoryTurnStart {
  readonly turnId: string
  readonly ownerId: PlayerId
  readonly sessionId: string
  readonly sessionGeneration: number
  readonly kind: 'bootstrap' | 'action'
  readonly phaseId: PhaseId | null
  readonly actionType: string
  readonly fromSequence: number
  readonly toSequence: number
  readonly prompt: string
  readonly promptVersion: number
  readonly visibleEventSequences: readonly number[]
  readonly gameStatus: TrajectoryTurn['gameStatus']
  readonly pausedReasonAtRender: string | null
}

export class MatchTrajectoryRecorder {
  readonly #repository: SqliteRepository
  readonly #matchId: MatchId
  readonly #publish: (delta: TrajectoryDelta) => void

  public constructor(
    repository: SqliteRepository,
    matchId: MatchId,
    publish: (delta: TrajectoryDelta) => void,
  ) {
    this.#repository = repository
    this.#matchId = matchId
    this.#publish = publish
  }

  public nextSessionGeneration(ownerId: PlayerId): number {
    return this.#repository.maxTrajectorySessionGeneration(this.#matchId, ownerId) + 1
  }

  public beginTurn(input: TrajectoryTurnStart): TrajectoryTurnRecorder {
    const previous = this.#repository.listTrajectoryTurns(this.#matchId, input.ownerId)
    const attempt =
      previous.filter(
        (turn) =>
          turn.kind === input.kind &&
          turn.phaseId === input.phaseId &&
          turn.actionType === input.actionType &&
          turn.toSequence === input.toSequence,
      ).length + 1
    const startedAt = new Date().toISOString()
    const turn = this.#saveTurn(
      TrajectoryTurnSchema.parse({
        matchId: this.#matchId,
        turnId: input.turnId,
        ownerId: input.ownerId,
        sessionId: input.sessionId,
        sessionGeneration: input.sessionGeneration,
        ordinal: this.#repository.nextTrajectoryTurnOrdinal(this.#matchId, input.ownerId),
        attempt,
        kind: input.kind,
        phaseId: input.phaseId,
        actionType: input.actionType,
        fromSequence: input.fromSequence,
        toSequence: input.toSequence,
        promptVersion: input.promptVersion,
        visibleEventSequences: input.visibleEventSequences,
        gameStatus: input.gameStatus,
        pausedReasonAtRender: input.pausedReasonAtRender,
        status: 'running',
        startedAt,
        completedAt: null,
        durationMs: null,
        stopReason: null,
        error: null,
        usage: null,
        revision: 0,
      }),
    )
    const recorder = new TrajectoryTurnRecorder(
      this.#repository,
      turn,
      (nextTurn) => this.#saveTurn(nextTurn),
      (record) => this.#saveRecord(record),
    )
    recorder.prompt(input.prompt)
    return recorder
  }

  public recordSystemEvents(events: readonly GameEvent[]): void {
    if (events.length === 0) return
    const first = events[0]!
    const last = events.at(-1)!
    const timestamp = last.occurredAt
    const phaseEvent = events.findLast((event) => event.payload.type === 'phase.changed')
    const phaseId = phaseEvent?.payload.type === 'phase.changed' ? phaseEvent.payload.phaseId : null
    const turn = this.#saveTurn(
      TrajectoryTurnSchema.parse({
        matchId: this.#matchId,
        turnId: `system:${first.sequence}-${last.sequence}`,
        ownerId: 'system',
        sessionId: 'system',
        sessionGeneration: 1,
        ordinal: this.#repository.nextTrajectoryTurnOrdinal(this.#matchId, 'system'),
        attempt: 1,
        kind: 'action',
        phaseId,
        actionType: 'domain-events',
        fromSequence: first.sequence,
        toSequence: last.sequence,
        promptVersion: 1,
        visibleEventSequences: [],
        gameStatus: null,
        pausedReasonAtRender: null,
        status: 'completed',
        startedAt: first.occurredAt,
        completedAt: timestamp,
        durationMs: elapsed(first.occurredAt, timestamp),
        stopReason: null,
        error: null,
        usage: null,
        revision: 0,
      }),
    )
    for (const event of events) {
      const payload = safeJson(event.payload)
      this.#saveRecord(
        TrajectoryRecordSchema.parse({
          matchId: this.#matchId,
          recordId: `system:event:${event.sequence}`,
          turnId: turn.turnId,
          ownerId: 'system',
          ordinal: this.#repository.nextTrajectoryRecordOrdinal(this.#matchId, 'system'),
          step: 1,
          kind:
            event.payload.type === 'action.submitted'
              ? 'action'
              : event.payload.type === 'match.paused'
                ? 'error'
                : 'lifecycle',
          title: event.payload.type,
          status: null,
          text: null,
          input: payload.value,
          output: null,
          usage: null,
          startedAt: event.occurredAt,
          completedAt: event.occurredAt,
          durationMs: 0,
          truncatedFields: payload.truncated ? ['input'] : [],
          revision: 0,
        }),
      )
    }
  }

  public recordRuntimeControl(title: string, input: unknown): void {
    recordTrajectoryRuntimeControl({
      repository: this.#repository,
      matchId: this.#matchId,
      title,
      input,
      saveTurn: (turn) => this.#saveTurn(turn),
      saveRecord: (record) => this.#saveRecord(record),
    })
  }

  #saveTurn(turn: TrajectoryTurn): TrajectoryTurn {
    const saved = this.#repository.saveTrajectoryTurn(turn)
    this.#publish(
      TrajectoryDeltaSchema.parse({
        type: 'trajectory.delta',
        revision: saved.revision,
        turns: [saved],
        records: [],
      }),
    )
    return saved
  }

  #saveRecord(record: TrajectoryRecord): TrajectoryRecord {
    const saved = this.#repository.saveTrajectoryRecord(record)
    this.#publish(
      TrajectoryDeltaSchema.parse({
        type: 'trajectory.delta',
        revision: saved.revision,
        turns: [],
        records: [saved],
      }),
    )
    return saved
  }
}

export class TrajectoryTurnRecorder {
  readonly #repository: SqliteRepository
  readonly #saveTurn: (turn: TrajectoryTurn) => TrajectoryTurn
  readonly #saveRecord: (record: TrajectoryRecord) => TrajectoryRecord
  readonly #streams = new Map<string, TrajectoryRecord>()
  readonly #tools = new Map<string, TrajectoryRecord>()
  #turn: TrajectoryTurn
  #step = 1
  #lastKind: TrajectoryRecord['kind'] | null = null

  public constructor(
    repository: SqliteRepository,
    turn: TrajectoryTurn,
    saveTurn: (turn: TrajectoryTurn) => TrajectoryTurn,
    saveRecord: (record: TrajectoryRecord) => TrajectoryRecord,
  ) {
    this.#repository = repository
    this.#turn = turn
    this.#saveTurn = saveTurn
    this.#saveRecord = saveRecord
  }

  public prompt(prompt: string): void {
    this.#createRecord('prompt', 'prompt', { text: prompt })
  }

  public update(update: SessionUpdate): void {
    switch (update.sessionUpdate) {
      case 'agent_message_chunk':
      case 'agent_thought_chunk': {
        const kind = update.sessionUpdate === 'agent_thought_chunk' ? 'reasoning' : 'message'
        const channel = kind === 'reasoning' ? 'reasoning' : 'message'
        const key = `${channel}:${update.messageId ?? 'default'}`
        const content =
          update.content.type === 'text' ? update.content.text : safeJson(update.content).value
        this.#mergeStream(key, kind, content)
        return
      }
      case 'user_message_chunk':
        return
      case 'tool_call':
      case 'tool_call_update': {
        const callId = update.toolCallId
        const current = this.#tools.get(callId)
        const rawInput = 'rawInput' in update ? update.rawInput : undefined
        const rawOutput = 'rawOutput' in update ? update.rawOutput : undefined
        const input = rawInput === undefined ? undefined : safeJson(rawInput)
        const output = rawOutput === undefined ? undefined : safeJson(rawOutput)
        const status = update.status ?? current?.status ?? null
        const record = current
          ? this.#saveRecord(
              TrajectoryRecordSchema.parse({
                ...current,
                title: update.title ?? update.name ?? current.title,
                status,
                input: input?.value ?? current.input,
                output: output?.value ?? current.output,
                truncatedFields: unique([
                  ...current.truncatedFields,
                  ...(input?.truncated ? ['input' as const] : []),
                  ...(output?.truncated ? ['output' as const] : []),
                ]),
                completedAt: terminalToolStatus(status) ? new Date().toISOString() : null,
                durationMs: terminalToolStatus(status)
                  ? elapsed(current.startedAt, new Date().toISOString())
                  : null,
              }),
            )
          : this.#createRecord('tool', update.title ?? update.name ?? 'tool', {
              status,
              ...(input ? { input } : {}),
              ...(output ? { output } : {}),
              recordId: `${this.#turn.turnId}:tool:${callId}`,
            })
        this.#tools.set(callId, record)
        this.#lastKind = 'tool'
        return
      }
      case 'usage_update': {
        const usage: TrajectoryUsage = {
          used: update.used,
          size: update.size,
          cost: update.cost ?? null,
        }
        this.#turn = this.#saveTurn(TrajectoryTurnSchema.parse({ ...this.#turn, usage }))
        this.#createRecord('usage', 'usage', { usage, status: 'updated' })
        return
      }
      default:
        this.#createRecord('lifecycle', update.sessionUpdate, {
          text: safeJson(update).value,
          status: update.sessionUpdate,
        })
    }
  }

  public permission(request: RequestPermissionRequest, allowed: boolean): void {
    const input = safeJson(request.toolCall.rawInput)
    this.#createRecord(
      'permission',
      request.toolCall.title ?? request.toolCall.name ?? 'permission',
      {
        status: allowed ? 'allowed' : 'denied',
        input,
        recordId: `${this.#turn.turnId}:permission:${request.toolCall.toolCallId}`,
      },
    )
  }

  public diagnostic(value: string): void {
    const text = truncate(value, diagnosticLimit)
    this.#createRecord('diagnostic', 'diagnostic', {
      text: text.value,
      truncatedText: text.truncated,
      status: diagnosticSeverity(value),
    })
  }

  public action(action: PlayerAction): void {
    const input = safeJson(action)
    this.#createRecord('action', action.type, { input, status: 'accepted' })
  }

  public complete(stopReason: string): void {
    this.#finish('completed', stopReason, null)
  }

  public fail(error: unknown, status: Extract<TrajectoryTurnStatus, 'failed' | 'uncertain'>): void {
    const message = truncate(
      error instanceof Error ? error.message : String(error),
      diagnosticLimit,
    )
    this.#createRecord('error', 'error', {
      text: message.value,
      truncatedText: message.truncated,
      status,
    })
    this.#finish(status, null, message.value)
  }

  #finish(status: TrajectoryTurnStatus, stopReason: string | null, error: string | null): void {
    const completedAt = new Date().toISOString()
    this.#turn = this.#saveTurn(
      TrajectoryTurnSchema.parse({
        ...this.#turn,
        status,
        completedAt,
        durationMs: elapsed(this.#turn.startedAt, completedAt),
        stopReason,
        error,
      }),
    )
  }

  #mergeStream(key: string, kind: 'reasoning' | 'message', incoming: string): void {
    if (this.#lastKind === 'tool') this.#step += 1
    const current = this.#streams.get(key)
    const text = current ? mergeText(current.text ?? '', incoming) : incoming
    const bounded = truncate(text, contentLimit)
    const record = current
      ? this.#saveRecord(
          TrajectoryRecordSchema.parse({
            ...current,
            text: bounded.value,
            truncatedFields: bounded.truncated
              ? unique([...current.truncatedFields, 'text'])
              : current.truncatedFields,
          }),
        )
      : this.#createRecord(kind, kind, {
          text: bounded.value,
          truncatedText: bounded.truncated,
          recordId: `${this.#turn.turnId}:${kind}:${key}`,
        })
    this.#streams.set(key, record)
    this.#lastKind = kind
  }

  #createRecord(
    kind: TrajectoryRecord['kind'],
    title: string,
    values: {
      readonly text?: string
      readonly input?: SanitizedValue
      readonly output?: SanitizedValue
      readonly usage?: TrajectoryUsage
      readonly status?: string | null
      readonly recordId?: string
      readonly truncatedText?: boolean
    },
  ): TrajectoryRecord {
    const startedAt = new Date().toISOString()
    const record = TrajectoryRecordSchema.parse({
      matchId: this.#turn.matchId,
      recordId:
        values.recordId ??
        `${this.#turn.turnId}:record:${this.#repository.nextTrajectoryRecordOrdinal(
          this.#turn.matchId,
          this.#turn.ownerId,
        )}`,
      turnId: this.#turn.turnId,
      ownerId: this.#turn.ownerId,
      ordinal: this.#repository.nextTrajectoryRecordOrdinal(this.#turn.matchId, this.#turn.ownerId),
      step: this.#step,
      kind,
      title: truncate(title, 160).value || kind,
      status: values.status ?? null,
      text: values.text ?? null,
      input: values.input?.value ?? null,
      output: values.output?.value ?? null,
      usage: values.usage ?? null,
      startedAt,
      completedAt: kind === 'tool' && !terminalToolStatus(values.status ?? null) ? null : startedAt,
      durationMs: kind === 'tool' && !terminalToolStatus(values.status ?? null) ? null : 0,
      truncatedFields: [
        ...(values.truncatedText ? ['text' as const] : []),
        ...(values.input?.truncated ? ['input' as const] : []),
        ...(values.output?.truncated ? ['output' as const] : []),
      ],
      revision: 0,
    })
    this.#lastKind = kind
    return this.#saveRecord(record)
  }
}

interface SanitizedValue {
  readonly value: string
  readonly truncated: boolean
}

function safeJson(value: unknown): SanitizedValue {
  let serialized: string
  try {
    serialized = JSON.stringify(sanitize(value, new WeakSet()), null, 2) ?? String(value)
  } catch {
    serialized = String(value)
  }
  return truncate(serialized, contentLimit)
}

function sanitize(value: unknown, seen: WeakSet<object>): unknown {
  if (Array.isArray(value)) return value.slice(0, 200).map((entry) => sanitize(entry, seen))
  if (typeof value !== 'object' || value === null) return value
  if (seen.has(value)) return '[Circular]'
  seen.add(value)
  const output: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value).slice(0, 200)) {
    if (key === '_meta') continue
    output[key] = secretKey.test(key) ? '[REDACTED]' : sanitize(entry, seen)
  }
  return output
}

function truncate(value: string, limit: number): SanitizedValue {
  if (value.length <= limit) return { value, truncated: false }
  return { value: value.slice(0, limit), truncated: true }
}

function mergeText(current: string, incoming: string): string {
  return `${current}${incoming}`
}

function terminalToolStatus(status: string | null): boolean {
  return status === 'completed' || status === 'failed'
}

function diagnosticSeverity(value: string): string {
  if (/\bERROR\b/.test(value)) return 'error'
  if (/\bWARN(?:ING)?\b/.test(value)) return 'warning'
  if (/\bDEBUG\b/.test(value)) return 'debug'
  return 'info'
}

function elapsed(start: string, end: string): number {
  return Math.max(0, Date.parse(end) - Date.parse(start))
}

function unique<Value>(values: readonly Value[]): Value[] {
  return [...new Set(values)]
}
