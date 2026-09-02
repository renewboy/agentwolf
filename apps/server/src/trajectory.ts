import { serializeTrajectoryValue, trajectoryElapsed } from '@agent-arena/trajectory'
import {
  TrajectoryDeltaSchema,
  TrajectoryRecordSchema,
  TrajectoryTurnSchema,
  type MatchId,
  type GameEvent,
  type PhaseId,
  type PlayerId,
  type TrajectoryDelta,
  type TrajectoryRecord,
  type TrajectoryTurn,
} from '@agentwolf/contracts'
import type { SqliteRepository } from './repository.js'
import { recordTrajectoryRuntimeControl } from './trajectory-runtime-control.js'
import { TrajectoryTurnRecorder } from './trajectory-turn-recorder.js'

export { TrajectoryTurnRecorder } from './trajectory-turn-recorder.js'

interface TrajectoryTurnStartBase {
  readonly turnId: string
  readonly ownerId: PlayerId
  readonly sessionId: string
  readonly sessionGeneration: number
  readonly phaseId: PhaseId | null
  readonly actionType: string
  readonly fromSequence: number
  readonly toSequence: number
  readonly prompt: string
  readonly visibleEventSequences: readonly number[]
  readonly gameStatus: TrajectoryTurn['gameStatus']
  readonly pausedReasonAtRender: string | null
  readonly continuation?: boolean
}

export type TrajectoryTurnStart = TrajectoryTurnStartBase &
  (
    | { readonly kind: 'bootstrap'; readonly systemInstructions: string }
    | { readonly kind: 'action' | 'postgame'; readonly systemInstructions?: never }
  )

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
        visibleEventSequences: input.visibleEventSequences,
        gameStatus: input.gameStatus,
        pausedReasonAtRender: input.pausedReasonAtRender,
        continuation: input.continuation ?? false,
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
    if (input.kind === 'bootstrap') recorder.instructions(input.systemInstructions)
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
        visibleEventSequences: [],
        gameStatus: null,
        pausedReasonAtRender: null,
        status: 'completed',
        startedAt: first.occurredAt,
        completedAt: timestamp,
        durationMs: trajectoryElapsed(first.occurredAt, timestamp),
        stopReason: null,
        error: null,
        usage: null,
        revision: 0,
      }),
    )
    for (const event of events) {
      const payload = serializeTrajectoryValue(event.payload)
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
