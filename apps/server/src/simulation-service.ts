import { constants } from 'node:fs'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import {
  PlayerActionSchema,
  PlayerIdSchema,
  SimulationCandidateResultSchema,
  SimulationCaptureSchema,
  SimulationControlSchema,
  SimulationIdSchema,
  SimulationTurnSchema,
  type MatchId,
  type SimulationApprovalRequest,
  type PlayerAction,
  type RoleId,
  type SimulationCapture,
  type TrajectoryTurn,
} from '@agentwolf/contracts'
import { GameEngine, replayGame } from '@agentwolf/game-engine'
import type { BoardCatalogService } from './board-catalog.js'
import type { ServerConfig } from './config.js'
import type { SqliteRepository } from './repository.js'
import {
  canonicalizeSimulationAction,
  canonicalizeSimulationEvents,
  classifySimulationFault,
  createSimulationNormalization,
  scanSimulationSecrets,
  simulationCheckpoint,
  simulationFingerprint,
} from './simulation-canonical.js'
import { auditTrajectory } from './trajectory-audit.js'
import { approveSimulationCandidate, reviewSimulationCandidate } from './simulation-workflow.js'
import { MatchReadOnlyError } from './match-manager.js'

export class SimulationSourceError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'SimulationSourceError'
  }
}

export class SimulationService {
  readonly #repository: SqliteRepository
  readonly #boards: BoardCatalogService
  readonly #config: ServerConfig

  public constructor(
    repository: SqliteRepository,
    boards: BoardCatalogService,
    config: ServerConfig,
  ) {
    this.#repository = repository
    this.#boards = boards
    this.#config = config
  }

  public async capture(matchId: MatchId): Promise<SimulationCapture> {
    if (this.#repository.getMatchArchive(matchId)) {
      throw new MatchReadOnlyError(matchId)
    }
    const match = this.#repository.getMatch(matchId)
    if (!match) throw new SimulationSourceError(`Unknown match ${matchId}`)
    if (match.status !== 'ended' && match.status !== 'paused') {
      throw new SimulationSourceError('Simulation capture requires an ended or paused match')
    }
    if (!match.boardSnapshot)
      throw new SimulationSourceError('Match has no immutable board snapshot')

    const allTurns = this.#repository
      .listTrajectoryTurns(matchId)
      .filter((turn) => turn.ownerId !== 'system' && turn.kind !== 'postgame')
    if (allTurns.length === 0) {
      throw new SimulationSourceError('Match has no structured player trajectory')
    }
    if (allTurns.some((turn) => turn.status === 'running')) {
      throw new SimulationSourceError('Match still has an unresolved trajectory turn')
    }
    const events = this.#repository.listMatchEvents(matchId)
    const roles = roleAssignments(events)
    const players = match.setup.seats.map((seat) => {
      const playerId = PlayerIdSchema.parse(`player-${seat.seat}`)
      const roleId = roles.get(playerId)
      if (!roleId) throw new SimulationSourceError(`Missing role assignment for ${playerId}`)
      return {
        playerId,
        seat: seat.seat,
        name: seat.name,
        profileId: seat.profileId,
        roleId,
        character: seat.character,
      }
    })
    const normalization = createSimulationNormalization(
      match.boardSnapshot,
      players,
      match.setup.speechCharacterLimit,
    )
    const records = this.#repository.listTrajectoryRecords(matchId)
    const completionOrder = new Map(
      [...allTurns]
        .sort((left, right) => left.revision - right.revision || left.ordinal - right.ordinal)
        .map((turn, index) => [turn.turnId, index + 1]),
    )
    const warnings: string[] = []
    const manifest = this.#boards.resolveSnapshot(match.boardSnapshot).manifest
    const ruleset = this.#boards.rulesetForSnapshot(match.boardSnapshot)
    const acceptedActions = new Set(
      events
        .filter((event) => event.payload.type === 'action.submitted')
        .map((event) =>
          event.payload.type === 'action.submitted' ? JSON.stringify(event.payload.action) : '',
        ),
    )
    const turns = allTurns.map((turn) => {
      if (turn.status === 'running') {
        throw new SimulationSourceError(`Trajectory turn ${turn.turnId} is still running`)
      }
      const action = actionForTurn(turn, records)
      const history = events.filter((event) => event.sequence <= turn.toSequence)
      let descriptor: ReturnType<GameEngine['currentTurn']> = null
      if (turn.kind === 'action') {
        try {
          descriptor = GameEngine.restore({
            matchId,
            board: manifest,
            events: history,
            status: turn.gameStatus ?? 'running',
            pausedReason: turn.pausedReasonAtRender,
            ruleset,
          }).currentTurn()
        } catch (error) {
          warnings.push(`turn-reconstruction:${turn.turnId}:${describe(error)}`)
        }
      }
      if (turn.kind === 'action' && !descriptor) warnings.push(`missing-boundary:${turn.turnId}`)
      let fault =
        turn.status === 'completed' ? null : classifySimulationFault(turn.status, turn.error)
      if (
        turn.kind === 'action' &&
        turn.status === 'completed' &&
        action &&
        !acceptedActions.has(JSON.stringify(action))
      ) {
        fault = 'invalid-action' as const
      }
      return SimulationTurnSchema.parse({
        ordinal: turn.ordinal,
        kind: turn.kind,
        playerId: turn.ownerId,
        phaseId: turn.phaseId,
        actionType: turn.actionType,
        mode: descriptor?.mode ?? null,
        expectedActors: descriptor?.actors ?? [],
        fromSequence: turn.fromSequence,
        toSequence: turn.toSequence,
        visibleEventSequences: turn.visibleEventSequences,
        sessionGeneration: turn.sessionGeneration,
        attempt: turn.attempt,
        completionOrder: completionOrder.get(turn.turnId),
        status: turn.status,
        fault,
        action: action ? canonicalizeSimulationAction(action, normalization) : null,
      })
    })
    const canonicalEvents = canonicalizeSimulationEvents(events, normalization)
    const replayed = replayGame(matchId, manifest, events, ruleset)
    const observed = {
      events: canonicalEvents,
      checkpoint: simulationCheckpoint(replayed, match.status, canonicalEvents.length),
    }
    const audit = await auditTrajectory(this.#repository, this.#boards, matchId)
    warnings.push(...audit.issues.map((issue) => `trajectory-audit:${issue.code}:${issue.turnId}`))
    const secretWarnings = scanSimulationSecrets({ setup: normalization.setup, turns, observed })
    warnings.push(...secretWarnings.map((warning) => `sensitive-content:${warning}`))
    const fingerprint = simulationFingerprint({ setup: normalization.setup, turns, observed })
    const simulationId = SimulationIdSchema.parse(
      `simulation-${match.status}-${fingerprint.slice(0, 16)}`,
    )
    return SimulationCaptureSchema.parse({
      schemaVersion: 1,
      stage: 'candidate',
      simulationId,
      title: `${normalization.setup.board.id} ${match.status}`,
      source: {
        matchId,
        status: match.status,
        cutoffSequence: events.at(-1)?.sequence ?? 0,
        capturedAt: new Date().toISOString(),
        fingerprint,
      },
      setup: normalization.setup,
      turns,
      controls: playbackControls(records),
      observed,
      warnings: [...new Set(warnings)],
    })
  }

  public async addCandidate(matchId: MatchId) {
    const capture = await this.capture(matchId)
    const directory = resolve(this.#config.dataDirectory, 'simulations', 'inbox')
    await mkdir(directory, { recursive: true })
    const path = resolve(directory, `${capture.simulationId}.sim.json`)
    let created = true
    try {
      await writeFile(path, `${JSON.stringify(capture, null, 2)}\n`, { flag: 'wx' })
    } catch (error) {
      if (!isAlreadyExists(error)) throw error
      created = false
      await access(path, constants.R_OK)
    }
    return SimulationCandidateResultSchema.parse({
      simulationId: capture.simulationId,
      relativePath: relative(this.#config.projectRoot, path),
      created,
      warnings: capture.warnings,
    })
  }

  public async review(matchId: MatchId) {
    const candidate = await this.addCandidate(matchId)
    return reviewSimulationCandidate(this.#config, candidate.simulationId)
  }

  public approve(simulationId: string, options: SimulationApprovalRequest) {
    return approveSimulationCandidate(this.#config, simulationId, options)
  }
}

function roleAssignments(
  events: ReturnType<SqliteRepository['listMatchEvents']>,
): Map<string, RoleId> {
  const roles = new Map<string, RoleId>()
  for (const event of events) {
    if (event.payload.type === 'role.assigned') {
      roles.set(event.payload.playerId, event.payload.roleId)
    }
  }
  return roles
}

function actionForTurn(
  turn: TrajectoryTurn,
  records: ReturnType<SqliteRepository['listTrajectoryRecords']>,
): PlayerAction | null {
  const record = records.findLast(
    (candidate) =>
      candidate.turnId === turn.turnId && candidate.kind === 'action' && candidate.input !== null,
  )
  if (!record?.input) return null
  try {
    return PlayerActionSchema.parse(JSON.parse(record.input))
  } catch {
    return null
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function playbackControls(records: ReturnType<SqliteRepository['listTrajectoryRecords']>) {
  const controls = records
    .filter(
      (record) =>
        record.ownerId === 'system' &&
        record.title.startsWith('playback.') &&
        record.input !== null,
    )
    .sort((left, right) => left.revision - right.revision)
  return controls.flatMap((record, index) => {
    try {
      const input = JSON.parse(record.input ?? '{}') as Record<string, unknown>
      if (record.title === 'playback.enabled') {
        return [
          SimulationControlSchema.parse({
            type: record.title,
            order: index + 1,
            enabled: input['enabled'],
          }),
        ]
      }
      if (record.title === 'playback.resolved') {
        return [
          SimulationControlSchema.parse({
            type: record.title,
            order: index + 1,
            sequence: input['sequence'],
            outcome: input['outcome'],
          }),
        ]
      }
      if (record.title === 'playback.disconnected') {
        return [
          SimulationControlSchema.parse({
            type: record.title,
            order: index + 1,
            sequence: input['sequence'] ?? null,
          }),
        ]
      }
    } catch {
      return []
    }
    return []
  })
}

function isAlreadyExists(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST'
}
