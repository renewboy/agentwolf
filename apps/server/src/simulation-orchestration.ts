import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import {
  SimulationCaptureSchema,
  SimulationFixtureSchema,
  SimulationRunReportSchema,
  type LiveMessage,
  type SimulationCapture,
  type SimulationControl,
  type SimulationExpected,
  type SimulationFixture,
  type SimulationRunReport,
  type SimulationVariant,
} from '@agentwolf/contracts'
import { GameEngine, type BoardManifest } from '@agentwolf/game-engine'
import { ActionMailbox } from './action-mailbox.js'
import { AgentCatalogService } from './agent-catalog.js'
import { BoardCatalogService } from './board-catalog.js'
import type { ServerConfig } from './config.js'
import type { LiveConnection, LiveSubscriber } from './live-hub.js'
import { MatchRuntime } from './match-runtime.js'
import { RulesetCatalog } from './ruleset-catalog.js'
import { describeError } from './match-runtime-helpers.js'
import { SqliteRepository, type MatchRecord } from './repository.js'
import {
  canonicalizeSimulationEvents,
  createSimulationNormalization,
  reviewedSimulationExpected,
  simulationCheckpoint,
  simulationSeed,
} from './simulation-canonical.js'
import { createSimulationEngine } from './simulation-engine.js'
import { checkSimulationInvariants, firstSimulationDifference } from './simulation-runner.js'
import {
  createSimulationSessionFactory,
  saveSimulationAgents,
} from './simulation-session-replay.js'
import { TrajectoryService } from './trajectory-service.js'
import { auditTrajectory } from './trajectory-audit.js'

type SimulationInput = SimulationCapture | SimulationFixture

export interface OrchestrationSimulationOptions {
  readonly projectRoot: string
  readonly variant?: SimulationVariant
}

export async function runOrchestrationSimulation(
  input: SimulationInput,
  options: OrchestrationSimulationOptions,
): Promise<SimulationRunReport> {
  const simulation = parseInput(input)
  const variant = options.variant ?? 'recorded'
  const expected = simulation.stage === 'candidate' ? simulation.observed : simulation.expected
  const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-orchestration-simulation-'))
  const repository = new SqliteRepository(':memory:')
  const failures: string[] = []
  let actual: SimulationExpected = { events: [], checkpoint: expected.checkpoint }
  let runtime: MatchRuntime | null = null
  let playback: LiveConnection | null = null
  try {
    const mailbox = new ActionMailbox()
    const catalog = new AgentCatalogService(repository)
    const rulesets = new RulesetCatalog()
    const boards = new BoardCatalogService(repository, null, rulesets)
    saveSimulationAgents(repository, simulation)
    const { board, engine } = createSimulationEngine(simulation)
    const timestamp = '2000-01-01T00:00:00.000Z'
    const record: MatchRecord = {
      id: simulation.setup.matchId,
      boardId: simulation.setup.board.id,
      boardSnapshot: simulation.setup.board,
      status: 'draft',
      setup: {
        boardId: simulation.setup.board.id,
        roleAssignment: 'manual',
        speechCharacterLimit: simulation.setup.speechCharacterLimit,
        seats: simulation.setup.players.map((player) => ({
          seat: player.seat,
          name: player.name,
          profileId: player.profileId,
          roleId: player.roleId,
          character: player.character,
        })),
      },
      createdAt: timestamp,
      updatedAt: timestamp,
      pausedReason: null,
    }
    repository.createMatch(record, engine.events)
    const sessionFactory = createSimulationSessionFactory(simulation, mailbox, variant)
    const config: ServerConfig = {
      host: '127.0.0.1',
      port: 4310,
      dataDirectory: root,
      databasePath: ':memory:',
      publicBaseUrl: 'http://127.0.0.1:4310',
      projectRoot: options.projectRoot,
      webDistPath: resolve(root, 'missing'),
      developerMode: false,
    }
    runtime = new MatchRuntime({
      record,
      engine,
      board,
      boardSnapshot: simulation.setup.board,
      repository,
      catalog,
      config,
      mailbox,
      trajectory: new TrajectoryService(repository).recorder(simulation.setup.matchId),
      ruleset: rulesets.forSnapshot(simulation.setup.board),
      sessionFactory,
      sessionConcurrency: simulation.setup.players.length,
      postgameReviewEnabled: false,
    })
    if (
      variant.startsWith('playback-') ||
      simulation.controls.some((control) => control.type === 'playback.enabled' && control.enabled)
    ) {
      playback = connectPlayback(runtime, variant, simulation.controls)
    }
    try {
      await runtime.start()
    } catch (error) {
      failures.push(`runtime initialization: ${describeError(error)}`)
    }
    await waitForSettlement(engine)
    const audit = await auditTrajectory(repository, boards, simulation.setup.matchId)
    if (!audit.ok) {
      failures.push(
        ...audit.issues.map(
          (issue) => `trajectory ${issue.code} at ${issue.turnId}: ${issue.detail}`,
        ),
      )
    }
    failures.push(...checkParallelPromptBarriers(repository, simulation.setup.matchId, board))
    const normalization = createSimulationNormalization(
      simulation.setup.board,
      simulation.setup.players,
      simulation.setup.speechCharacterLimit,
    )
    const events = canonicalizeSimulationEvents(engine.events, normalization)
    actual = {
      events,
      checkpoint: simulationCheckpoint(engine.state, engine.state.status, events.length),
    }
    failures.push(
      ...checkSimulationInvariants(events, simulation.setup.players.length, simulation.turns),
    )
    const comparableActual =
      simulation.stage === 'candidate' ? actual : reviewedSimulationExpected(actual)
    const divergence = firstSimulationDifference(expected, comparableActual)
    if (divergence) failures.push(divergence)
  } catch (error) {
    failures.push(describeError(error))
  } finally {
    playback?.close()
    if (runtime) await runtime.close()
    repository.close()
    await rm(root, { recursive: true, force: true })
  }
  return SimulationRunReportSchema.parse({
    simulationId: simulation.simulationId,
    variant,
    seed: simulationSeed(simulation.simulationId, variant),
    ok: failures.length === 0,
    failures,
    actual,
  })
}

function connectPlayback(
  runtime: MatchRuntime,
  variant: SimulationVariant,
  controls: readonly SimulationControl[],
): LiveConnection {
  let connection: LiveConnection | null = null
  const handled = new Set<number>()
  const outcomes = controls.filter(
    (control) => control.type === 'playback.resolved' || control.type === 'playback.disconnected',
  )
  let outcomeIndex = 0
  const subscriber: LiveSubscriber = {
    view: { kind: 'god' },
    send: (message: LiveMessage) => {
      if (
        message.type !== 'speech-playback.state' ||
        message.state.pendingSequence === null ||
        handled.has(message.state.pendingSequence)
      ) {
        return
      }
      handled.add(message.state.pendingSequence)
      queueMicrotask(() => {
        if (!connection) return
        const recorded = outcomes[outcomeIndex++]
        const disconnect =
          variant === 'playback-disconnected' || recorded?.type === 'playback.disconnected'
        if (disconnect) connection.close()
        else {
          const outcome =
            variant === 'playback-skipped' ||
            (recorded?.type === 'playback.resolved' && recorded.outcome === 'skipped')
              ? 'skipped'
              : 'completed'
          connection.receive({
            type: 'speech-playback.resolve',
            sequence: message.state.pendingSequence!,
            outcome,
          })
        }
      })
    },
  }
  connection = runtime.connect(subscriber)
  connection.receive({ type: 'speech-playback.set', enabled: true })
  return connection
}

async function waitForSettlement(engine: GameEngine): Promise<void> {
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    if (engine.state.status === 'ended' || engine.state.status === 'paused') return
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5))
  }
  throw new Error('Orchestration simulation did not settle')
}

function parseInput(input: SimulationInput): SimulationInput {
  return input.stage === 'candidate'
    ? SimulationCaptureSchema.parse(input)
    : SimulationFixtureSchema.parse(input)
}

function checkParallelPromptBarriers(
  repository: SqliteRepository,
  matchId: SimulationInput['setup']['matchId'],
  board: BoardManifest,
): string[] {
  const failures: string[] = []
  const turns = repository
    .listTrajectoryTurns(matchId)
    .filter((turn) => turn.ownerId !== 'system' && turn.kind === 'action' && turn.phaseId !== null)
  const groups = new Map<string, typeof turns>()
  for (const turn of turns) {
    const node = turn.phaseId ? board.phases.nodes.get(turn.phaseId) : null
    if (node?.mode !== 'parallel') continue
    const key = `${turn.phaseId}:${turn.toSequence}:${turn.sessionGeneration}:${turn.attempt}`
    const group = groups.get(key) ?? []
    group.push(turn)
    groups.set(key, group)
  }
  for (const [key, group] of groups) {
    const owners = new Set(group.map((turn) => turn.ownerId))
    if (owners.size !== group.length) {
      failures.push(`parallel prompt barrier ${key} prompted one actor more than once`)
    }
    const boundary = group[0]?.toSequence
    if (boundary === undefined) continue
    const engine = GameEngine.restore({
      matchId,
      board,
      events: repository.listMatchEvents(matchId).filter((event) => event.sequence <= boundary),
      status: 'running',
      pausedReason: null,
    })
    const expected = engine.currentTurn()?.actors ?? []
    if (expected.length !== owners.size || expected.some((playerId) => !owners.has(playerId))) {
      failures.push(
        `parallel prompt barrier ${key} expected [${expected.join(',')}], recorded [${[...owners].join(',')}]`,
      )
    }
  }
  return failures
}
