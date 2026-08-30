import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import {
  AgentProfileIdSchema,
  MatchIdSchema,
  CanonicalSimulationEventSchema,
  PhaseIdSchema,
  PlayerIdSchema,
  SimulationCaptureSchema,
  SimulationApprovalResultSchema,
  SimulationFixtureSchema,
  SimulationIdSchema,
  SimulationReviewResultSchema,
  TrajectoryTurnSchema,
  type SimulationCapture,
  type PlayerAction,
} from '@agentwolf/contracts'
import { GameEngine, sixPlayerBoard } from '@agentwolf/game-engine'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BoardCatalogService } from '../src/board-catalog.js'
import { buildServer } from '../src/app.js'
import type { ServerConfig } from '../src/config.js'
import { SqliteRepository, type MatchRecord } from '../src/repository.js'
import {
  classifySimulationFault,
  normalizeSimulationCapture,
  scanSimulationSecrets,
} from '../src/simulation-canonical.js'
import {
  checkSimulationInvariants,
  firstSimulationDifference,
  runEngineSimulation,
} from '../src/simulation-runner.js'
import { runOrchestrationSimulation } from '../src/simulation-orchestration.js'
import { SimulationService } from '../src/simulation-service.js'
import {
  approveSimulationCandidate,
  reviewSimulationCandidate,
} from '../src/simulation-workflow.js'
import { MatchTrajectoryRecorder } from '../src/trajectory.js'
import { ActionMailbox } from '../src/action-mailbox.js'
import { createSimulationSessionFactory } from '../src/simulation-session-replay.js'

const roots: string[] = []
const repositories: SqliteRepository[] = []

afterEach(async () => {
  for (const repository of repositories.splice(0)) repository.close()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('simulation capture and engine replay', () => {
  it('classifies every trajectory fault and detects supported secret signatures', () => {
    expect(classifySimulationFault('uncertain', null)).toBe('uncertain-delivery')
    expect(classifySimulationFault('cancelled', null)).toBe('cancelled')
    expect(classifySimulationFault('failed', 'Prompt timed out')).toBe('timeout')
    expect(classifySimulationFault('failed', 'Agent process exited')).toBe('process-exit')
    expect(classifySimulationFault('failed', 'Unexpected invalid action')).toBe('invalid-action')
    expect(classifySimulationFault('failed', null)).toBe('other')
    expect(
      scanSimulationSecrets({
        authorization: 'Bearer abcdefghijklmnop',
        key: 'sk-proj-abcdefghijklmnop',
        privateKey: '-----BEGIN RSA PRIVATE KEY-----',
        path: '/Users/example/private/file',
      }),
    ).toEqual(['authorization-header', 'api-key', 'private-key', 'absolute-user-path'])
  })

  it('rejects closed replay Sessions and missing HTTP MCP credentials', async () => {
    const fixture = SimulationFixtureSchema.parse(
      JSON.parse(
        await readFile(
          resolve(
            'apps/server/tests/fixtures/simulations/simulation-ended-bc894fce0eb4bdfa.sim.json',
          ),
          'utf8',
        ),
      ),
    )
    const playerId = fixture.setup.players[0]!.playerId
    const factory = createSimulationSessionFactory(fixture, new ActionMailbox(), 'recorded')
    const closed = await factory({
      playerId,
      mcpServer: {
        type: 'http',
        name: 'simulation',
        url: 'http://127.0.0.1/mcp',
        headers: [{ name: 'Authorization', value: 'Bearer test-token' }],
      },
    } as never)
    await closed.close()
    await expect(closed.prompt('ignored', 5_000)).rejects.toThrow(/Session is closed/)

    const missingToken = await factory({
      playerId,
      resumeSessionId: 'simulation-resumed',
      mcpServer: { type: 'http', name: 'simulation', url: 'http://127.0.0.1/mcp', headers: [] },
    } as never)
    expect(() => missingToken.prompt('resume', 5_000)).toThrow(/MCP token is missing/)
  })

  it('reports every structural event and turn invariant independently', async () => {
    const fixture = SimulationFixtureSchema.parse(
      JSON.parse(
        await readFile(
          resolve(
            'apps/server/tests/fixtures/simulations/simulation-ended-bc894fce0eb4bdfa.sim.json',
          ),
          'utf8',
        ),
      ),
    )
    const base = fixture.turns[0]!
    const turns = [
      {
        ...base,
        completionOrder: 1,
        fromSequence: 5,
        toSequence: 4,
        visibleEventSequences: [6],
        expectedActors: [base.playerId, base.playerId],
        kind: 'bootstrap' as const,
        action: fixture.turns.find((turn) => turn.action)?.action ?? null,
      },
      {
        ...base,
        completionOrder: 1,
        kind: 'action' as const,
        playerId: 'player-1',
        expectedActors: ['player-2'],
        action: null,
        status: 'completed' as const,
        mode: 'parallel' as const,
        phaseId: 'phase-day-vote',
      },
      {
        ...base,
        completionOrder: 3,
        kind: 'action' as const,
        playerId: 'player-2',
        expectedActors: ['player-3'],
        action: fixture.turns.find((turn) => turn.action)?.action ?? null,
        mode: 'parallel' as const,
        phaseId: 'phase-day-vote',
        toSequence: base.toSequence,
      },
    ]
    const failures = checkSimulationInvariants([], fixture.setup.players.length, turns as never)
    expect(failures.join('\n')).toContain('match.created is not first')
    expect(failures.join('\n')).toContain('duplicate completion order')
    expect(failures.join('\n')).toContain('inverted event range')
    expect(failures.join('\n')).toContain('exposes an event after')
    expect(failures.join('\n')).toContain('duplicate expected actors')
    expect(failures.join('\n')).toContain('bootstrap turn')
    expect(failures.join('\n')).toContain('outside its actor snapshot')
    expect(failures.join('\n')).toContain('has no action')
    expect(failures.join('\n')).toContain('different actor snapshots')

    expect(firstSimulationDifference([1], [1, 2])).toContain('length expected 1')
    expect(firstSimulationDifference({ nested: [1, 2] }, { nested: [1, 3] })).toContain(
      'result.nested[1]',
    )
    expect(firstSimulationDifference({ a: 1 }, { a: 1 })).toBeNull()
    expect(firstSimulationDifference('left', 'right')).toContain('expected "left"')
  })

  it('rejects every incomplete simulation capture source boundary', async () => {
    const source = await createPausedSource()
    const record = source.repository.getMatch(source.matchId)!
    const turns = source.repository.listTrajectoryTurns(source.matchId)
    const events = source.repository.listMatchEvents(source.matchId)
    const getMatch = vi.spyOn(source.repository, 'getMatch')
    const listTurns = vi.spyOn(source.repository, 'listTrajectoryTurns')
    const listEvents = vi.spyOn(source.repository, 'listMatchEvents')

    getMatch.mockReturnValue(null)
    await expect(source.service.capture(source.matchId)).rejects.toThrow(/Unknown match/)
    getMatch.mockReturnValue({ ...record, status: 'draft' })
    await expect(source.service.capture(source.matchId)).rejects.toThrow(/ended or paused/)
    getMatch.mockReturnValue({ ...record, boardSnapshot: null })
    await expect(source.service.capture(source.matchId)).rejects.toThrow(/immutable board snapshot/)
    getMatch.mockReturnValue(record)
    listTurns.mockReturnValue([])
    await expect(source.service.capture(source.matchId)).rejects.toThrow(
      /no structured player trajectory/,
    )
    listTurns.mockReturnValue(
      turns.map((turn, index) => (index === 0 ? { ...turn, status: 'running' } : turn)) as never,
    )
    await expect(source.service.capture(source.matchId)).rejects.toThrow(
      /unresolved trajectory turn/,
    )
    listTurns.mockReturnValue(turns)
    listEvents.mockReturnValue(
      events.filter(
        (event) => event.payload.type !== 'role.assigned' || event.payload.playerId !== 'player-1',
      ),
    )
    await expect(source.service.capture(source.matchId)).rejects.toThrow(/Missing role assignment/)
  })

  it('captures bootstrap, failed, actionless, and playback-control trajectory variants', async () => {
    const source = await createPausedSource()
    const original = source.repository
      .listTrajectoryTurns(source.matchId)
      .find((turn) => turn.ownerId !== 'system')!
    source.repository.saveTrajectoryTurn(
      TrajectoryTurnSchema.parse({
        ...original,
        turnId: 'delivery-capture-failed',
        ordinal: original.ordinal + 1,
        kind: 'action',
        status: 'failed',
        error: 'Prompt timeout',
        gameStatus: null,
        completedAt: '2026-08-28T00:00:00.000Z',
        durationMs: 1,
        stopReason: null,
        revision: 0,
      }),
    )
    source.repository.saveTrajectoryTurn(
      TrajectoryTurnSchema.parse({
        ...original,
        turnId: 'delivery-capture-bootstrap',
        ordinal: original.ordinal + 2,
        kind: 'bootstrap',
        phaseId: null,
        actionType: 'bootstrap',
        status: 'completed',
        error: null,
        gameStatus: 'starting',
        completedAt: '2026-08-28T00:00:01.000Z',
        durationMs: 1,
        stopReason: 'end_turn',
        revision: 0,
      }),
    )
    const actionRecord = source.repository
      .listTrajectoryRecords(source.matchId)
      .find((record) => record.kind === 'action')!
    source.repository.saveTrajectoryRecord({
      ...actionRecord,
      recordId: 'record-invalid-captured-action',
      turnId: 'delivery-capture-failed',
      ordinal: source.repository.nextTrajectoryRecordOrdinal(source.matchId, actionRecord.ownerId),
      input: '{invalid-json',
      revision: 0,
    })
    const controls = new MatchTrajectoryRecorder(source.repository, source.matchId, () => undefined)
    controls.recordRuntimeControl('playback.resolved', { sequence: 1, outcome: 'completed' })
    controls.recordRuntimeControl('playback.unknown', { ignored: true })
    const enabled = source.repository
      .listTrajectoryRecords(source.matchId)
      .find((record) => record.title === 'playback.enabled')!
    source.repository.saveTrajectoryRecord({
      ...enabled,
      recordId: 'record-invalid-playback-control',
      ordinal: source.repository.nextTrajectoryRecordOrdinal(source.matchId, 'system'),
      input: '{invalid-json',
      revision: 0,
    })

    const capture = await source.service.capture(source.matchId)
    expect(capture.turns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'bootstrap', action: null, mode: null }),
        expect.objectContaining({ status: 'failed', fault: 'timeout', action: null }),
      ]),
    )
    expect(capture.controls).toContainEqual(
      expect.objectContaining({ type: 'playback.resolved', outcome: 'completed' }),
    )
  })

  it('exports a paused real trajectory as a sanitized deterministic candidate', async () => {
    const source = await createPausedSource()
    const capture = await source.service.capture(source.matchId)

    expect(capture.stage).toBe('candidate')
    expect(capture.source.status).toBe('paused')
    expect(capture.setup.matchId).toBe('match-simulation-replay')
    expect(capture.setup.players[0]).toMatchObject({
      name: 'Simulation seat 1',
      profileId: 'profile-simulation-1',
    })
    expect(capture.turns.at(-1)).toMatchObject({
      phaseId: 'phase-night-wolf-council',
      actionType: 'speech',
      fault: 'invalid-action',
    })
    expect(capture.controls).toEqual([
      { type: 'playback.enabled', order: 1, enabled: true },
      { type: 'playback.disconnected', order: 2, sequence: null },
    ])
    expect(JSON.stringify(capture)).not.toContain('fake prompt with private data')
    expect(runEngineSimulation(capture)).toMatchObject({ ok: true, failures: [] })
  })

  it('does not accept an observed checkpoint as truth after it is changed', async () => {
    const source = await createPausedSource()
    const capture = await source.service.capture(source.matchId)
    const changed = SimulationCaptureSchema.parse({
      ...capture,
      observed: {
        ...capture.observed,
        checkpoint: { ...capture.observed.checkpoint, day: capture.observed.checkpoint.day + 1 },
      },
    })

    const report = runEngineSimulation(changed)
    expect(report.ok).toBe(false)
    expect(report.failures.join('\n')).toContain('checkpoint.day')
  })

  it('normalizes nested action Match IDs in stored schema-one candidates', async () => {
    const source = await createPausedSource()
    const capture = await source.service.capture(source.matchId)
    const action = capture.turns.find((turn) => turn.action)?.action
    if (!action) throw new Error('Expected a captured action')
    const legacy = SimulationCaptureSchema.parse({
      ...capture,
      observed: {
        ...capture.observed,
        events: [
          ...capture.observed.events,
          {
            sequence: capture.observed.events.length + 1,
            visibility: { kind: 'public' },
            payload: {
              type: 'action.submitted',
              playerId: action.actorId,
              action: { ...action, matchId: capture.source.matchId },
            },
          },
        ],
      },
    })

    const normalized = normalizeSimulationCapture(legacy)
    const submitted = normalized.observed.events.at(-1)?.payload
    expect(submitted?.type).toBe('action.submitted')
    if (submitted?.type !== 'action.submitted') throw new Error('Expected submitted action')
    expect(submitted.action.matchId).toBe(normalized.setup.matchId)
  })

  it('adds an immutable local candidate without mutating the source match', async () => {
    const source = await createPausedSource()
    const before = source.repository.listMatchEvents(source.matchId)
    const first = await source.service.addCandidate(source.matchId)
    const second = await source.service.addCandidate(source.matchId)

    expect(first.created).toBe(true)
    expect(second).toMatchObject({ created: false, relativePath: first.relativePath })
    const stored = SimulationCaptureSchema.parse(
      JSON.parse(await readFile(resolve(source.root, first.relativePath), 'utf8')),
    )
    expect(stored.simulationId).toBe(first.simulationId)
    expect(source.repository.listMatchEvents(source.matchId)).toEqual(before)
  })

  it('replays repeated uncertain delivery through real orchestration recovery', async () => {
    const source = await createPausedSource()
    const replayable = repeatedUncertainCapture(await source.service.capture(source.matchId))

    const report = await runOrchestrationSimulation(replayable, {
      projectRoot: source.config.projectRoot,
    })
    expect(report.actual.events).toEqual(replayable.observed.events)
    expect(report.failures).toEqual([])
    expect(report.ok).toBe(true)
  })

  it('reports the orchestration initialization cause for an invalid project root', async () => {
    const source = await createPausedSource()
    const replayable = repeatedUncertainCapture(await source.service.capture(source.matchId))

    const report = await runOrchestrationSimulation(replayable, {
      projectRoot: resolve(source.root, 'missing-project-root'),
    })

    expect(report.ok).toBe(false)
    expect(report.failures.join('\n')).toContain('runtime initialization:')
    expect(report.failures.join('\n')).toContain('agentwolf-player')
  })

  it('reviews and approves a candidate through the shared browser workflow', async () => {
    const source = await createPausedSource()
    const capture = repeatedUncertainCapture(await source.service.capture(source.matchId))
    const inbox = resolve(source.config.dataDirectory, 'simulations', 'inbox')
    await mkdir(inbox, { recursive: true })
    await writeFile(
      resolve(inbox, `${capture.simulationId}.sim.json`),
      `${JSON.stringify(capture, null, 2)}\n`,
    )

    const review = await reviewSimulationCandidate(source.config, capture.simulationId)
    expect(review).toMatchObject({
      replayOk: true,
      orchestrationOk: true,
      deterministic: true,
      orchestrationDeterministic: true,
      runnersAgree: true,
      canApprove: true,
      failures: [],
      secretWarnings: [],
    })
    const approved = await approveSimulationCandidate(source.config, capture.simulationId, {
      acceptCurrent: false,
      acknowledgeWarnings: true,
    })
    const repeated = await approveSimulationCandidate(source.config, capture.simulationId, {
      acceptCurrent: false,
      acknowledgeWarnings: true,
    })
    expect(approved.created).toBe(true)
    expect(repeated).toMatchObject({ created: false, relativePath: approved.relativePath })
    expect(
      SimulationFixtureSchema.parse(
        JSON.parse(await readFile(resolve(source.root, approved.relativePath), 'utf8')),
      ).simulationId,
    ).toBe(capture.simulationId)
  }, 20_000)

  it('gates export routes and writes candidates only in loopback developer mode', async () => {
    const normalSource = await createPausedSource(false)
    repositories.splice(repositories.indexOf(normalSource.repository), 1)
    const normal = await buildServer({
      config: normalSource.config,
      repository: normalSource.repository,
    })
    expect(
      (
        await normal.app.inject({
          method: 'GET',
          url: `/api/developer/matches/${normalSource.matchId}/simulation/export`,
        })
      ).statusCode,
    ).toBe(404)
    expect(
      (
        await normal.app.inject({
          method: 'POST',
          url: `/api/developer/matches/${normalSource.matchId}/simulation/review`,
        })
      ).statusCode,
    ).toBe(404)
    await normal.close()

    const developerSource = await createPausedSource(true)
    repositories.splice(repositories.indexOf(developerSource.repository), 1)
    const developer = await buildServer({
      config: developerSource.config,
      repository: developerSource.repository,
    })
    const exported = await developer.app.inject({
      method: 'GET',
      url: `/api/developer/matches/${developerSource.matchId}/simulation/export`,
    })
    expect(exported.statusCode).toBe(200)
    expect(exported.headers['content-disposition']).toContain('.sim.json')
    expect(SimulationCaptureSchema.parse(exported.json()).source.status).toBe('paused')
    const added = await developer.app.inject({
      method: 'POST',
      url: `/api/developer/matches/${developerSource.matchId}/simulation/candidates`,
    })
    expect(added.statusCode).toBe(201)
    expect(added.json()).toMatchObject({ created: true })
    const reviewed = await developer.app.inject({
      method: 'POST',
      url: `/api/developer/matches/${developerSource.matchId}/simulation/review`,
    })
    expect(reviewed.statusCode).toBe(200)
    expect(SimulationReviewResultSchema.parse(reviewed.json()).turns).toBeGreaterThan(0)

    const routeCapture = repeatedUncertainCapture(
      await developer.simulations.capture(developerSource.matchId),
    )
    const routeSimulationId = SimulationIdSchema.parse('simulation-browser-route-test')
    const routeInbox = resolve(developerSource.config.dataDirectory, 'simulations', 'inbox')
    await mkdir(routeInbox, { recursive: true })
    await writeFile(
      resolve(routeInbox, `${routeSimulationId}.sim.json`),
      `${JSON.stringify({ ...routeCapture, simulationId: routeSimulationId }, null, 2)}\n`,
    )
    const approved = await developer.app.inject({
      method: 'POST',
      url: `/api/developer/simulations/${routeSimulationId}/approve`,
      payload: { acknowledgeWarnings: true, acceptCurrent: false },
    })
    expect(approved.statusCode).toBe(200)
    expect(SimulationApprovalResultSchema.parse(approved.json()).created).toBe(true)
    await developer.close()
  }, 15_000)

  it('detects independent vote and visibility invariant mutations', async () => {
    const fixture = SimulationFixtureSchema.parse(
      JSON.parse(
        await readFile(
          resolve(
            'apps/server/tests/fixtures/simulations/simulation-ended-bc894fce0eb4bdfa.sim.json',
          ),
          'utf8',
        ),
      ),
    )
    const baseline = runEngineSimulation(fixture).actual.events
    const voteEvents = structuredClone(baseline)
    const vote = voteEvents.find((event) => event.payload.type === 'vote.resolved')
    if (!vote || vote.payload.type !== 'vote.resolved') throw new Error('Missing vote result')
    vote.payload.totals = { 'player-1': 999 }
    expect(
      checkSimulationInvariants(
        CanonicalSimulationEventSchema.array().parse(voteEvents),
        fixture.setup.players.length,
      ),
    ).toContain(`vote totals differ for ${vote.payload.kind}`)

    const visibilityEvents = structuredClone(baseline)
    const assignment = visibilityEvents.find((event) => event.payload.type === 'role.assigned')
    if (!assignment || assignment.payload.type !== 'role.assigned') {
      throw new Error('Missing role assignment')
    }
    assignment.visibility = { kind: 'public' }
    expect(assignment.visibility.kind).toBe('public')
    const parsedVisibilityEvents = CanonicalSimulationEventSchema.array().parse(visibilityEvents)
    expect(
      parsedVisibilityEvents.find((event) => event.payload.type === 'role.assigned')?.visibility
        .kind,
    ).toBe('public')
    expect(
      checkSimulationInvariants(parsedVisibilityEvents, fixture.setup.players.length).join('\n'),
    ).toContain('invalid visibility')
  })
})

function repeatedUncertainCapture(captured: SimulationCapture): SimulationCapture {
  const actionTemplate = captured.turns.find((turn) => turn.kind === 'action')!
  const bootstrapTurns = captured.setup.players.flatMap((player, index) => [
    {
      ...actionTemplate,
      ordinal: 1,
      kind: 'bootstrap' as const,
      playerId: player.playerId,
      phaseId: null,
      actionType: 'bootstrap',
      mode: null,
      expectedActors: [],
      sessionGeneration: 1,
      attempt: 1,
      completionOrder: index + 1,
      status: 'completed' as const,
      fault: null,
      action: null,
    },
    {
      ...actionTemplate,
      ordinal: 2,
      kind: 'bootstrap' as const,
      playerId: player.playerId,
      phaseId: null,
      actionType: 'bootstrap',
      mode: null,
      expectedActors: [],
      sessionGeneration: 2,
      attempt: 2,
      completionOrder: captured.setup.players.length + index + 2,
      status: 'completed' as const,
      fault: null,
      action: null,
    },
  ])
  const faultTurns = [1, 2].map((generation) => ({
    ...actionTemplate,
    ordinal: generation,
    sessionGeneration: generation,
    attempt: generation,
    completionOrder:
      generation === 1 ? captured.setup.players.length + 1 : captured.setup.players.length * 2 + 2,
    status: 'uncertain' as const,
    fault: 'uncertain-delivery' as const,
    action: null,
  }))
  const events = captured.observed.events.map((event) =>
    event.payload.type === 'match.paused'
      ? { ...event, payload: { type: 'match.paused' as const, reason: 'uncertain-delivery' } }
      : event,
  )
  return SimulationCaptureSchema.parse({
    ...captured,
    turns: [...bootstrapTurns, ...faultTurns],
    observed: { ...captured.observed, events },
  })
}

async function createPausedSource(developerMode = true): Promise<{
  root: string
  matchId: ReturnType<typeof MatchIdSchema.parse>
  repository: SqliteRepository
  service: SimulationService
  config: ServerConfig
}> {
  const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-simulation-'))
  roots.push(root)
  await cp(
    resolve(process.cwd(), 'packages/assets/prompts'),
    resolve(root, 'packages/assets/prompts'),
    { recursive: true },
  )
  for (const name of ['agentwolf-player', 'werewolf-strategy']) {
    const skillRoot = resolve(root, 'packages/assets/player-skills', name)
    await mkdir(skillRoot, { recursive: true })
    await writeFile(resolve(skillRoot, 'SKILL.md'), `# ${name}\n`, 'utf8')
  }
  const repository = new SqliteRepository(':memory:')
  repositories.push(repository)
  const boards = new BoardCatalogService(repository)
  const resolved = boards.resolve(sixPlayerBoard.id)
  const matchId = MatchIdSchema.parse('match-simulation-source')
  let tick = 0
  const roles = sixPlayerBoard.roles.flatMap(({ roleId, count }) =>
    Array.from({ length: count }, () => roleId),
  )
  const setup = {
    boardId: sixPlayerBoard.id,
    roleAssignment: 'manual' as const,
    speechCharacterLimit: 300,
    seats: roles.map((roleId, index) => ({
      seat: index + 1,
      name: `Source player ${index + 1}`,
      profileId: AgentProfileIdSchema.parse(`profile-source-${index + 1}`),
      roleId,
      character: null,
    })),
  }
  const engine = GameEngine.create({
    matchId,
    board: sixPlayerBoard,
    players: setup.seats.map((seat) => ({
      id: PlayerIdSchema.parse(`player-${seat.seat}`),
      ...seat,
    })),
    roleAssignment: 'manual',
    seed: 1,
    clock: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)),
  })
  const timestamp = new Date(Date.UTC(2026, 0, 1)).toISOString()
  const record: MatchRecord = {
    id: matchId,
    boardId: sixPlayerBoard.id,
    boardSnapshot: resolved.snapshot,
    status: 'draft',
    setup,
    createdAt: timestamp,
    updatedAt: timestamp,
    pausedReason: null,
  }
  repository.createMatch(record, engine.events)
  const trajectory = new MatchTrajectoryRecorder(repository, matchId, () => undefined)
  trajectory.recordSystemEvents(engine.events)
  append(repository, trajectory, engine.prepareStart())
  append(repository, trajectory, engine.start())
  const descriptor = engine.currentTurn()
  if (!descriptor) throw new Error('Expected a scripted action boundary')
  const actorId = descriptor.actors[0]!
  const action: PlayerAction = {
    type: 'speech',
    matchId,
    actorId,
    kind: 'day',
    text: 'Source player 1 submits an invalid speech kind.',
  }
  const turn = trajectory.beginTurn({
    turnId: 'delivery-source-invalid',
    ownerId: actorId,
    sessionId: 'session-source-1',
    sessionGeneration: 1,
    kind: 'action',
    phaseId: PhaseIdSchema.parse(descriptor.phaseId),
    actionType: descriptor.actionType,
    fromSequence: 0,
    toSequence: engine.state.lastSequence,
    prompt: 'fake prompt with private data',
    visibleEventSequences: engine.events.map((event) => event.sequence),
    gameStatus: engine.state.status,
    pausedReasonAtRender: engine.state.pausedReason,
  })
  turn.action(action)
  turn.complete('end_turn')
  try {
    engine.submit(action)
  } catch {
    append(repository, trajectory, engine.pause('Unexpected speech kind day', actorId))
  }
  repository.updateMatchStatus(matchId, 'paused', 'Unexpected speech kind day')
  trajectory.recordRuntimeControl('playback.enabled', { enabled: true })
  trajectory.recordRuntimeControl('playback.disconnected', { sequence: null })
  const config: ServerConfig = {
    host: '127.0.0.1',
    port: 4310,
    dataDirectory: resolve(root, '.agentwolf'),
    databasePath: ':memory:',
    publicBaseUrl: 'http://127.0.0.1:4310',
    projectRoot: root,
    webDistPath: resolve(root, 'missing'),
    developerMode,
  }
  return {
    root,
    matchId,
    repository,
    service: new SimulationService(repository, boards, config),
    config,
  }
}

function append(
  repository: SqliteRepository,
  trajectory: MatchTrajectoryRecorder,
  events: ReturnType<GameEngine['start']>,
): void {
  repository.appendEvents(events)
  trajectory.recordSystemEvents(events)
}
