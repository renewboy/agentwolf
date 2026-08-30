import { TrajectoryTurnRecorder as CoreTrajectoryTurnRecorder } from '@agent-arena/trajectory'
import {
  TrajectoryRecordSchema,
  TrajectoryTurnSchema,
  type TrajectoryRecord,
  type TrajectoryTurn,
} from '@agentwolf/contracts'
import type { SqliteRepository } from './repository.js'

export class TrajectoryTurnRecorder extends CoreTrajectoryTurnRecorder<
  TrajectoryTurn,
  TrajectoryRecord
> {
  public constructor(
    repository: SqliteRepository,
    turn: TrajectoryTurn,
    saveTurn: (turn: TrajectoryTurn) => TrajectoryTurn,
    saveRecord: (record: TrajectoryRecord) => TrajectoryRecord,
  ) {
    super(repository, turn, saveTurn, saveRecord, {
      parseTurn: (value) => TrajectoryTurnSchema.parse(value),
      parseRecord: (value) => TrajectoryRecordSchema.parse(value),
    })
  }
}
