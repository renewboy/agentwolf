import {
  TrajectoryRecordSchema,
  TrajectoryTurnSchema,
  type MatchId,
  type TrajectoryRecord,
  type TrajectoryTurn,
} from '@agentwolf/contracts'
import type { SqliteRepository } from './repository.js'

export function recordTrajectoryRuntimeControl(options: {
  readonly repository: SqliteRepository
  readonly matchId: MatchId
  readonly title: string
  readonly input: unknown
  readonly saveTurn: (turn: TrajectoryTurn) => TrajectoryTurn
  readonly saveRecord: (record: TrajectoryRecord) => TrajectoryRecord
}): void {
  const ordinal = options.repository.nextTrajectoryTurnOrdinal(options.matchId, 'system')
  const timestamp = new Date().toISOString()
  const turn = options.saveTurn(
    TrajectoryTurnSchema.parse({
      matchId: options.matchId,
      turnId: `system:runtime:${ordinal}`,
      ownerId: 'system',
      sessionId: 'system',
      sessionGeneration: 1,
      ordinal,
      attempt: 1,
      kind: 'action',
      phaseId: null,
      actionType: 'runtime-control',
      fromSequence: 0,
      toSequence: 0,
      visibleEventSequences: [],
      gameStatus: null,
      pausedReasonAtRender: null,
      status: 'completed',
      startedAt: timestamp,
      completedAt: timestamp,
      durationMs: 0,
      stopReason: null,
      error: null,
      usage: null,
      revision: 0,
    }),
  )
  options.saveRecord(
    TrajectoryRecordSchema.parse({
      matchId: options.matchId,
      recordId: `${turn.turnId}:control`,
      turnId: turn.turnId,
      ownerId: 'system',
      ordinal: options.repository.nextTrajectoryRecordOrdinal(options.matchId, 'system'),
      step: 1,
      kind: 'lifecycle',
      title: options.title,
      status: null,
      text: null,
      input: JSON.stringify(options.input),
      output: null,
      usage: null,
      startedAt: timestamp,
      completedAt: timestamp,
      durationMs: 0,
      truncatedFields: [],
      revision: 0,
    }),
  )
}
