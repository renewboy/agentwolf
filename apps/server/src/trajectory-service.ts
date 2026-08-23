import { getCopy } from '@agentwolf/assets'
import {
  TrajectoryDeltaSchema,
  TrajectoryOwnerIdSchema,
  TrajectoryPageSchema,
  TrajectorySummarySchema,
  type MatchId,
  type TrajectoryDelta,
  type TrajectoryOwnerId,
  type TrajectoryPage,
  type TrajectorySummary,
} from '@agentwolf/contracts'
import type { SqliteRepository } from './repository.js'
import { MatchTrajectoryRecorder } from './trajectory.js'

type TrajectorySubscriber = (delta: TrajectoryDelta) => void

export class TrajectoryService {
  readonly #repository: SqliteRepository
  readonly #subscribers = new Map<MatchId, Set<TrajectorySubscriber>>()

  public constructor(repository: SqliteRepository) {
    this.#repository = repository
  }

  public recorder(matchId: MatchId): MatchTrajectoryRecorder {
    return new MatchTrajectoryRecorder(this.#repository, matchId, (delta) =>
      this.#publish(matchId, delta),
    )
  }

  public summary(matchId: MatchId): TrajectorySummary {
    const match = this.#requireMatch(matchId)
    const turns = this.#repository.listTrajectoryTurns(matchId)
    const records = this.#repository.listTrajectoryRecords(matchId)
    const ownerIds: TrajectoryOwnerId[] = [
      'system',
      ...match.setup.seats
        .slice()
        .sort((left, right) => left.seat - right.seat)
        .map((seat) => TrajectoryOwnerIdSchema.parse(`player-${seat.seat}`)),
    ]
    return TrajectorySummarySchema.parse({
      matchId,
      revision: this.#repository.trajectoryRevision(matchId),
      owners: ownerIds.map((ownerId) => ({
        ownerId,
        label:
          ownerId === 'system'
            ? getCopy('trajectory.system')
            : (match.setup.seats.find((seat) => `player-${seat.seat}` === ownerId)?.name ??
              ownerId),
        turnCount: turns.filter((turn) => turn.ownerId === ownerId).length,
        recordCount: records.filter((record) => record.ownerId === ownerId).length,
      })),
      turns,
    })
  }

  public page(
    matchId: MatchId,
    ownerId: TrajectoryOwnerId,
    beforeTurn: number | null,
    limit = 20,
  ): TrajectoryPage {
    this.#requireMatch(matchId)
    const boundedLimit = Math.max(1, Math.min(50, limit))
    const allTurns = this.#repository
      .listTrajectoryTurns(matchId, ownerId)
      .filter((turn) => beforeTurn === null || turn.ordinal < beforeTurn)
    const turns = allTurns.slice(-boundedLimit)
    const turnIds = new Set(turns.map((turn) => turn.turnId))
    const records = this.#repository
      .listTrajectoryRecords(matchId, ownerId)
      .filter((record) => turnIds.has(record.turnId))
    const first = turns[0]?.ordinal ?? null
    const hasOlder = first !== null && allTurns.some((turn) => turn.ordinal < first)
    return TrajectoryPageSchema.parse({
      matchId,
      revision: this.#repository.trajectoryRevision(matchId),
      ownerId,
      turns,
      records,
      nextBeforeTurn: hasOlder ? first : null,
    })
  }

  public changes(matchId: MatchId, afterRevision: number): TrajectoryDelta {
    this.#requireMatch(matchId)
    const changes = this.#repository.trajectoryChanges(matchId, afterRevision)
    return TrajectoryDeltaSchema.parse({
      type: 'trajectory.delta',
      revision: this.#repository.trajectoryRevision(matchId),
      ...changes,
    })
  }

  public subscribe(
    matchId: MatchId,
    afterRevision: number,
    subscriber: TrajectorySubscriber,
  ): () => void {
    const catchup = this.changes(matchId, afterRevision)
    if (catchup.turns.length > 0 || catchup.records.length > 0) subscriber(catchup)
    const subscribers = this.#subscribers.get(matchId) ?? new Set<TrajectorySubscriber>()
    subscribers.add(subscriber)
    this.#subscribers.set(matchId, subscribers)
    return () => {
      subscribers.delete(subscriber)
      if (subscribers.size === 0) this.#subscribers.delete(matchId)
    }
  }

  #publish(matchId: MatchId, delta: TrajectoryDelta): void {
    for (const subscriber of this.#subscribers.get(matchId) ?? []) subscriber(delta)
  }

  #requireMatch(matchId: MatchId) {
    const match = this.#repository.getMatch(matchId)
    if (!match) throw new Error(`Unknown match ${matchId}`)
    return match
  }
}
