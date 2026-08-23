import { getCopy } from '@agentwolf/assets'
import {
  PlayerActionSchema,
  TrajectoryDeltaSchema,
  TrajectoryOwnerIdSchema,
  TrajectoryPageSchema,
  TrajectorySummarySchema,
  type MatchId,
  type GameEvent,
  type TrajectoryDelta,
  type TrajectoryOwnerId,
  type TrajectoryPage,
  type TrajectoryRecord,
  type TrajectorySummary,
  type TrajectoryTimelineGroup,
  type TrajectoryTurn,
} from '@agentwolf/contracts'
import type { SqliteRepository } from './repository.js'
import { sanitizeSpeech } from '@agentwolf/game-engine'
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
    const events = this.#repository.listMatchEvents(matchId)
    const turns = withTimelineGroups(this.#repository.listTrajectoryTurns(matchId), events)
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
    const events = this.#repository.listMatchEvents(matchId)
    const boundedLimit = Math.max(1, Math.min(50, limit))
    const allTurns = withTimelineGroups(
      this.#repository.listTrajectoryTurns(matchId, ownerId),
      events,
    ).filter((turn) => beforeTurn === null || turn.ordinal < beforeTurn)
    const turns = allTurns.slice(-boundedLimit)
    const turnIds = new Set(turns.map((turn) => turn.turnId))
    const records = canonicalizeSpeechRecords(
      this.#repository
        .listTrajectoryRecords(matchId, ownerId)
        .filter((record) => turnIds.has(record.turnId)),
      events,
    )
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
    return this.#normalizeDelta(matchId, {
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
    const normalized = this.#normalizeDelta(matchId, delta)
    for (const subscriber of this.#subscribers.get(matchId) ?? []) subscriber(normalized)
  }

  #normalizeDelta(matchId: MatchId, delta: TrajectoryDelta): TrajectoryDelta {
    const turnIds = new Set([
      ...delta.turns.map((turn) => turn.turnId),
      ...delta.records.map((record) => record.turnId),
    ])
    const events = this.#repository.listMatchEvents(matchId)
    const turns = withTimelineGroups(delta.turns, events)
    const records =
      turnIds.size === 0
        ? []
        : canonicalizeSpeechRecords(
            this.#repository
              .listTrajectoryRecords(matchId)
              .filter((record) => turnIds.has(record.turnId)),
            events,
          )
    return TrajectoryDeltaSchema.parse({ ...delta, turns, records })
  }

  #requireMatch(matchId: MatchId) {
    const match = this.#repository.getMatch(matchId)
    if (!match) throw new Error(`Unknown match ${matchId}`)
    return match
  }
}

function withTimelineGroups(
  turns: readonly TrajectoryTurn[],
  events: readonly GameEvent[],
): TrajectoryTurn[] {
  return turns.map((turn) => ({ ...turn, timelineGroup: timelineGroup(turn, events) }))
}

function timelineGroup(
  turn: TrajectoryTurn,
  events: readonly GameEvent[],
): TrajectoryTimelineGroup {
  let day = 0
  let night = 0
  let phaseId = turn.phaseId
  for (const event of events) {
    if (event.sequence > turn.toSequence) break
    if (event.payload.type === 'day.started') day = event.payload.day
    if (event.payload.type === 'night.started') night = event.payload.night
    if (event.payload.type === 'phase.changed') phaseId = event.payload.phaseId
  }
  if (phaseId === 'phase-match-ended') return { kind: 'end', index: null }
  if (phaseId?.startsWith('phase-night-')) {
    return { kind: 'night', index: Math.max(1, night) }
  }
  if (phaseId && sheriffElectionPhases.has(phaseId)) {
    return { kind: 'sheriff', index: Math.max(1, day) }
  }
  if (day > 0) return { kind: 'day', index: day }
  if (night > 0) return { kind: 'night', index: night }
  return { kind: 'setup', index: null }
}

const sheriffElectionPhases = new Set([
  'phase-sheriff-signup',
  'phase-sheriff-speech',
  'phase-sheriff-withdraw',
  'phase-sheriff-vote',
  'phase-sheriff-runoff-speech',
  'phase-sheriff-runoff-vote',
  'phase-sheriff-resolve',
])

function canonicalizeSpeechRecords(
  records: readonly TrajectoryRecord[],
  events: readonly GameEvent[],
): TrajectoryRecord[] {
  const matchCreated = events.find((event) => event.payload.type === 'match.created')
  const players = new Map(
    matchCreated?.payload.type === 'match.created'
      ? matchCreated.payload.players.map((player) => [player.playerId, player] as const)
      : [],
  )
  const canonicalByTurn = new Map<string, string>()
  for (const record of records) {
    if (record.kind !== 'action' || !record.input) continue
    try {
      const action = PlayerActionSchema.safeParse(JSON.parse(record.input))
      if (action.success && action.data.type === 'speech') {
        canonicalByTurn.set(record.turnId, sanitizeSpeech(action.data.text, players).text)
      }
    } catch {
      continue
    }
  }
  const lastMessageByTurn = new Map<string, string>()
  for (const record of records) {
    if (record.kind === 'message') lastMessageByTurn.set(record.turnId, record.recordId)
  }
  return records.map((record) => {
    const canonical = canonicalByTurn.get(record.turnId)
    return canonical && lastMessageByTurn.get(record.turnId) === record.recordId
      ? { ...record, text: canonical }
      : record
  })
}
