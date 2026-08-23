import { createHash } from 'node:crypto'
import {
  AgentProfileIdSchema,
  BoardIdSchema,
  CanonicalSimulationEventSchema,
  GameEventPayloadSchema,
  MatchBoardSnapshotSchema,
  MatchIdSchema,
  PlayerActionSchema,
  SimulationCheckpointSchema,
  SimulationCaptureSchema,
  SimulationReviewedExpectedSchema,
  SimulationSetupSchema,
  type CanonicalSimulationEvent,
  type GameEvent,
  type MatchBoardSnapshot,
  type PlayerAction,
  type SimulationCheckpoint,
  type SimulationCapture,
  type SimulationExpected,
  type SimulationReviewedExpected,
  type SimulationFault,
  type SimulationPlayer,
  type SimulationSetup,
  type TrajectoryTurnStatus,
} from '@agentwolf/contracts'
import type { GameState } from '@agentwolf/game-engine'

export interface SimulationNormalization {
  readonly setup: SimulationSetup
  readonly replacements: ReadonlyMap<string, string>
}

export function createSimulationNormalization(
  board: MatchBoardSnapshot,
  players: readonly {
    readonly playerId: SimulationPlayer['playerId']
    readonly seat: number
    readonly name: string
    readonly profileId: SimulationPlayer['profileId']
    readonly roleId: SimulationPlayer['roleId']
  }[],
): SimulationNormalization {
  const canonicalBoard = MatchBoardSnapshotSchema.parse({
    ...board,
    id: BoardIdSchema.parse(
      `board-simulation-${board.playerCount}-${board.sheriff ? 'sheriff' : 'plain'}`,
    ),
    name: `Simulation board ${board.playerCount}`,
    description: '',
    source: 'custom',
    revision: 1,
  })
  const replacements = new Map<string, string>([
    [board.id, canonicalBoard.id],
    [board.name, canonicalBoard.name],
  ])
  const canonicalPlayers = [...players]
    .sort((left, right) => left.seat - right.seat)
    .map((player) => {
      const name = `Simulation seat ${player.seat}`
      const profileId = AgentProfileIdSchema.parse(`profile-simulation-${player.seat}`)
      replacements.set(player.name, name)
      replacements.set(player.profileId, profileId)
      return { ...player, name, profileId }
    })
  return {
    setup: SimulationSetupSchema.parse({
      matchId: simulationMatchId,
      board: canonicalBoard,
      players: canonicalPlayers,
    }),
    replacements,
  }
}

export function canonicalizeSimulationEvents(
  events: readonly GameEvent[],
  normalization: SimulationNormalization,
): CanonicalSimulationEvent[] {
  const replacements = new Map(normalization.replacements)
  for (const event of events) {
    if (event.payload.type !== 'delivery.started') continue
    if (!replacements.has(event.payload.deliveryId)) {
      replacements.set(event.payload.deliveryId, `delivery-${replacements.size + 1}`)
    }
  }
  const domainEvents = events.filter(
    (event) =>
      event.payload.type !== 'delivery.started' && event.payload.type !== 'delivery.acknowledged',
  )
  return domainEvents.map((event, index) => {
    const value = normalizeValue(event.payload, replacements)
    if (!isRecord(value)) throw new Error('Simulation event payload is not an object')
    if (value['type'] === 'match.created') {
      value['boardId'] = normalization.setup.board.id
      value['players'] = normalization.setup.players.map((player) => ({
        playerId: player.playerId,
        seat: player.seat,
        name: player.name,
        profileId: player.profileId,
      }))
    }
    if (value['type'] === 'match.started') value['startedAt'] = fixedTimestamp
    if (value['type'] === 'action.submitted' && isRecord(value['action'])) {
      value['action']['matchId'] = normalization.setup.matchId
    }
    if (value['type'] === 'match.paused' && typeof value['reason'] === 'string') {
      value['reason'] = stablePauseReason(value['reason'])
    }
    return CanonicalSimulationEventSchema.parse({
      sequence: index + 1,
      visibility: event.visibility,
      payload: GameEventPayloadSchema.parse(value),
    })
  })
}

export function normalizeSimulationCapture(capture: SimulationCapture): SimulationCapture {
  const turns = capture.turns.map((turn) => ({
    ...turn,
    action: turn.action ? { ...turn.action, matchId: capture.setup.matchId } : null,
  }))
  const events = capture.observed.events.map((event) => {
    if (event.payload.type === 'match.created') {
      return CanonicalSimulationEventSchema.parse({
        ...event,
        payload: {
          ...event.payload,
          boardId: capture.setup.board.id,
          players: capture.setup.players.map((player) => ({
            playerId: player.playerId,
            seat: player.seat,
            name: player.name,
            profileId: player.profileId,
          })),
        },
      })
    }
    if (event.payload.type === 'action.submitted') {
      return CanonicalSimulationEventSchema.parse({
        ...event,
        payload: {
          ...event.payload,
          action: { ...event.payload.action, matchId: capture.setup.matchId },
        },
      })
    }
    return event
  })
  return SimulationCaptureSchema.parse({
    ...capture,
    turns,
    observed: { ...capture.observed, events },
  })
}

export function canonicalizeSimulationAction(
  action: PlayerAction,
  normalization: SimulationNormalization,
): PlayerAction {
  const value = normalizeValue(action, normalization.replacements)
  if (!isRecord(value)) throw new Error('Simulation action is not an object')
  value['matchId'] = simulationMatchId
  return PlayerActionSchema.parse(value)
}

export function simulationCheckpoint(
  state: GameState,
  status: SimulationCheckpoint['status'],
  eventCount: number,
): SimulationCheckpoint {
  const ordered = [...state.players.values()].sort((left, right) => left.seat - right.seat)
  return SimulationCheckpointSchema.parse({
    status,
    day: state.day,
    night: state.night,
    phaseId: state.phaseId,
    winner: state.winner,
    sheriffId: state.sheriff.holderId,
    alivePlayerIds: ordered.filter((player) => player.alive).map((player) => player.id),
    votingPlayerIds: ordered.filter((player) => player.canVote).map((player) => player.id),
    lastSequence: eventCount,
  })
}

export function simulationFingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export function reviewedSimulationExpected(actual: SimulationExpected): SimulationReviewedExpected {
  return SimulationReviewedExpectedSchema.parse({
    eventCount: actual.events.length,
    eventDigest: simulationFingerprint(actual.events),
    eventTypes: actual.events.map((event) => event.payload.type),
    checkpoint: actual.checkpoint,
  })
}

export function simulationSeed(simulationId: string, variant: string): string {
  return simulationFingerprint({ simulationId, variant }).slice(0, 16)
}

export function classifySimulationFault(
  status: Exclude<TrajectoryTurnStatus, 'running' | 'completed'>,
  error: string | null,
): SimulationFault {
  if (status === 'uncertain') return 'uncertain-delivery'
  if (status === 'cancelled') return 'cancelled'
  const normalized = error?.toLowerCase() ?? ''
  if (normalized.includes('timed out') || normalized.includes('timeout')) return 'timeout'
  if (
    normalized.includes('process') ||
    normalized.includes('disposed') ||
    normalized.includes('exited')
  ) {
    return 'process-exit'
  }
  if (normalized.includes('invalid') || normalized.includes('unexpected')) return 'invalid-action'
  return 'other'
}

export function scanSimulationSecrets(value: unknown): string[] {
  const text = JSON.stringify(value)
  const warnings: string[] = []
  for (const [code, pattern] of [
    ['authorization-header', /bearer\s+[a-z0-9._~+/-]{12,}/i],
    ['api-key', /(?:sk|sk-proj)-[a-z0-9_-]{12,}/i],
    ['private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ['absolute-user-path', /\/(?:Users|home)\/[^/"\\]+\//],
  ] as const) {
    if (pattern.test(text)) warnings.push(code)
  }
  return warnings
}

export const simulationMatchId = MatchIdSchema.parse('match-simulation-replay')

const fixedTimestamp = '2000-01-01T00:00:00.000Z'

function normalizeValue(value: unknown, replacements: ReadonlyMap<string, string>): unknown {
  if (typeof value === 'string') {
    let normalized = value
    for (const [source, target] of replacements) {
      if (source) normalized = normalized.split(source).join(target)
    }
    return normalized
  }
  if (Array.isArray(value)) return value.map((entry) => normalizeValue(entry, replacements))
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, normalizeValue(child, replacements)]),
  )
}

function stablePauseReason(reason: string): string {
  const normalized = reason.toLowerCase()
  if (normalized.includes('uncertain') || normalized.includes('delivery')) {
    return 'uncertain-delivery'
  }
  if (normalized.includes('timed out') || normalized.includes('timeout')) return 'prompt-timeout'
  if (
    normalized.includes('process') ||
    normalized.includes('disposed') ||
    normalized.includes('exited')
  ) {
    return 'process-exit'
  }
  if (normalized.includes('invalid') || normalized.includes('unexpected')) return 'invalid-action'
  return reason
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
