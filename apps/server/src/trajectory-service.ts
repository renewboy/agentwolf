import { resolve } from 'node:path'
import { resolvePlayerLaunchSpec } from '@agentwolf/acp'
import { getCopy } from '@agentwolf/assets'
import {
  PlayerActionSchema,
  TrajectoryDeltaSchema,
  TrajectoryOwnerIdSchema,
  TrajectoryPageSchema,
  TrajectoryPlayerDebugSchema,
  TrajectorySummarySchema,
  type MatchId,
  type AgentTool,
  type GameEvent,
  type PlayerId,
  type TrajectoryDelta,
  type TrajectoryOwnerId,
  type TrajectoryPage,
  type TrajectoryPlayerDebug,
  type TrajectoryRecord,
  type TrajectorySummary,
  type TrajectoryTimelineGroup,
  type TrajectoryTurn,
} from '@agentwolf/contracts'
import type { SqliteRepository } from './repository.js'
import { sanitizeSpeech } from '@agentwolf/game-engine'
import { MatchTrajectoryRecorder } from './trajectory.js'
import type { AgentCatalogService } from './agent-catalog.js'

type TrajectorySubscriber = (delta: TrajectoryDelta) => void

export class TrajectoryService {
  readonly #repository: SqliteRepository
  readonly #catalog: AgentCatalogService | null
  readonly #dataDirectory: string | null
  readonly #subscribers = new Map<MatchId, Set<TrajectorySubscriber>>()

  public constructor(
    repository: SqliteRepository,
    catalog: AgentCatalogService | null = null,
    dataDirectory: string | null = null,
  ) {
    this.#repository = repository
    this.#catalog = catalog
    this.#dataDirectory = dataDirectory
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

  public playerDebug(matchId: MatchId, playerId: PlayerId): TrajectoryPlayerDebug {
    const match = this.#requireMatch(matchId)
    const setup = match.setup.seats.find((seat) => `player-${seat.seat}` === playerId)
    if (!setup) throw new Error(`Unknown Player ${playerId} for Match ${matchId}`)
    const binding = this.#repository.playerSessions.get(matchId, playerId)
    const profile = binding?.profile ?? this.#catalog?.getProfile(setup.profileId)
    const tool = binding?.tool ?? (profile ? this.#catalog?.getTool(profile.toolId) : null)
    if (!profile || !tool) throw new Error(`Missing Agent configuration for ${matchId}/${playerId}`)

    const turns = this.#repository.listTrajectoryTurns(matchId, playerId)
    const turnsWithUsage = turns.filter((turn) => turn.usage !== null)
    const latestTurn = turns.at(-1) ?? null
    const ledger = this.#repository.getDeliveryLedger(matchId, playerId)
    const launch = playerLaunch(tool, matchId, playerId, this.#dataDirectory)

    return TrajectoryPlayerDebugSchema.parse({
      matchId,
      playerId,
      profile: {
        id: profile.id,
        name: profile.name,
        toolId: tool.id,
        toolName: tool.kind === 'trae-cli' ? 'Trae' : tool.name,
        toolKind: tool.kind,
        model: profile.model,
        reasoningEffort: profile.reasoningEffort ?? null,
        mode: profile.mode ?? tool.initialMode ?? null,
        promptTimeoutMs: profile.promptTimeoutMs,
      },
      session: {
        id: binding?.sessionId ?? null,
        generation: binding?.sessionGeneration ?? null,
        state: binding?.state ?? null,
        bootstrapState: binding?.bootstrapState ?? null,
        pendingActionType: binding?.pendingAction?.action.type ?? null,
        pendingDeliveryId: binding?.pendingAction?.deliveryId ?? null,
        createdAt: binding?.createdAt ?? null,
        updatedAt: binding?.updatedAt ?? null,
      },
      launch: {
        command: redactLaunchValue(launch.command),
        args: redactLaunchArgs(launch.args),
        environment: Object.entries(tool.environment)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([name, value]) => ({
            name,
            source: value.source,
            reference: value.source === 'process' ? value.variable : null,
          })),
        connectionKeys: Object.keys(profile.connection).sort(),
      },
      delivery: {
        acknowledgedSequence: ledger?.acknowledgedSequence ?? 0,
        activeAttempt: ledger?.activeAttempt
          ? { ...ledger.activeAttempt, error: ledger.activeAttempt.error ?? null }
          : null,
      },
      context: {
        latest: turnsWithUsage.at(-1)?.usage ?? null,
        peakUsed: turnsWithUsage.reduce(
          (maximum, turn) => Math.max(maximum, turn.usage?.used ?? 0),
          0,
        ),
        turnsWithUsage: turnsWithUsage.length,
      },
      latestTurn: latestTurn
        ? {
            ordinal: latestTurn.ordinal,
            actionType: latestTurn.actionType,
            status: latestTurn.status,
            attempt: latestTurn.attempt,
            fromSequence: latestTurn.fromSequence,
            toSequence: latestTurn.toSequence,
            durationMs: latestTurn.durationMs,
            error: latestTurn.error,
          }
        : null,
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
    const records = canonicalizeSpeechRecords(
      this.#repository.listTrajectoryRecordsForTurns(
        matchId,
        turns.map((turn) => turn.turnId),
      ),
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
    const subscribers = this.#subscribers.get(matchId)
    if (!subscribers || subscribers.size === 0) return
    const normalized = this.#normalizeDelta(matchId, delta)
    for (const subscriber of subscribers) subscriber(normalized)
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
            this.#repository.listTrajectoryRecordsForTurns(matchId, [...turnIds]),
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

function playerLaunch(
  tool: AgentTool,
  matchId: MatchId,
  playerId: PlayerId,
  dataDirectory: string | null,
): { readonly command: string; readonly args: readonly string[] } {
  if (!dataDirectory) return { command: tool.command, args: tool.args }
  const workspace = resolve(dataDirectory, 'matches', matchId, 'players', playerId, 'workspace')
  try {
    const launch = resolvePlayerLaunchSpec(tool, workspace)
    return { command: launch.command, args: launch.args }
  } catch {
    return { command: tool.command, args: tool.args }
  }
}

const sensitiveLaunchKey =
  /authorization|cookie|credential|password|secret|token|api[-_]?key|private[-_]?key/i
const sensitiveLaunchValue =
  /bearer\s+[a-z0-9._~+/-]{12,}|(?:sk|sk-proj)-[a-z0-9_-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/i

function redactLaunchArgs(args: readonly string[]): string[] {
  return args.map((value, index) => {
    const separator = value.indexOf('=')
    if (separator >= 0 && sensitiveLaunchKey.test(value.slice(0, separator))) {
      return `${value.slice(0, separator)}=[REDACTED]`
    }
    if (index > 0 && sensitiveLaunchKey.test(args[index - 1] ?? '')) return '[REDACTED]'
    return redactLaunchValue(value)
  })
}

function redactLaunchValue(value: string): string {
  return sensitiveLaunchValue.test(value) ? '[REDACTED]' : value
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
  if (turn.kind === 'postgame') return { kind: 'review', index: null }
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
  const messagesByTurn = new Map<string, TrajectoryRecord[]>()
  for (const record of records) {
    if (record.kind !== 'message') continue
    const messages = messagesByTurn.get(record.turnId) ?? []
    messages.push(record)
    messagesByTurn.set(record.turnId, messages)
  }
  const canonicalMessageByTurn = new Map<string, string>()
  for (const [turnId, messages] of messagesByTurn) {
    const canonical = canonicalByTurn.get(turnId)
    if (!canonical) continue
    const matching = messages.find((record) => {
      const raw = sanitizeSpeech(record.text ?? '', players).text
      return raw.length > 0 && (raw.includes(canonical) || canonical.startsWith(raw))
    })
    canonicalMessageByTurn.set(turnId, matching?.recordId ?? messages[0]!.recordId)
  }
  return records.map((record) => {
    const canonical = canonicalByTurn.get(record.turnId)
    return canonical && canonicalMessageByTurn.get(record.turnId) === record.recordId
      ? { ...record, text: canonical }
      : record
  })
}
