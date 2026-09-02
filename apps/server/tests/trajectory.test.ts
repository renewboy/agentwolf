import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import type { RequestPermissionRequest, SessionUpdate } from '@agentclientprotocol/sdk'
import {
  BoardIdSchema,
  GameEventSchema,
  MatchIdSchema,
  PhaseIdSchema,
  PlayerActionSchema,
  PlayerIdSchema,
  TrajectoryTurnSchema,
  type GameEventPayload,
  type PlayerId,
  type TrajectoryDelta,
} from '@agentwolf/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { builtInAgentTools } from '@agentwolf/acp'
import { buildServer, type AgentWolfServer } from '../src/app.js'
import { bootstrapContextBudgetIssue } from '../src/trajectory-audit.js'
import { TrajectoryService } from '../src/trajectory-service.js'

const roots: string[] = []
const servers: AgentWolfServer[] = []

afterEach(async () => {
  await Promise.allSettled(servers.splice(0).map((server) => server.close()))
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('trajectory capture', () => {
  it('audits the game-only bootstrap context budget for every foundation', () => {
    const turn = TrajectoryTurnSchema.parse({
      matchId: 'match-context-budget',
      turnId: 'delivery-context-budget',
      ownerId: 'player-1',
      sessionId: 'session-context-budget',
      sessionGeneration: 1,
      ordinal: 1,
      attempt: 1,
      kind: 'bootstrap',
      phaseId: null,
      actionType: 'bootstrap',
      fromSequence: 1,
      toSequence: 1,
      status: 'completed',
      startedAt: '2026-08-23T00:00:00.000Z',
      completedAt: '2026-08-23T00:00:01.000Z',
      durationMs: 1_000,
      stopReason: 'end_turn',
      error: null,
      usage: { used: 12_001, size: 174_800, cost: null },
      revision: 1,
    })
    expect(bootstrapContextBudgetIssue(turn)).toContain('12001')
    expect(bootstrapContextBudgetIssue({ ...turn, kind: 'action' })).toBeNull()
    expect(
      bootstrapContextBudgetIssue({
        ...turn,
        usage: { ...turn.usage!, used: 12_000 },
      }),
    ).toBeNull()
  })

  it('stores system instructions before the bootstrap Prompt', async () => {
    const server = await createServer()
    const profile = server.catalog.createProfile({
      name: 'Instructions fixture',
      toolId: builtInAgentTools()[0]!.id,
      model: 'fixture-model',
      promptTimeoutMs: 5_000,
      connection: {},
    })
    const match = server.matches.createMatch({
      boardId: BoardIdSchema.parse('board-quick-6'),
      roleAssignment: 'random',
      seats: Array.from({ length: 6 }, (_, index) => ({
        seat: index + 1,
        name: `Instructions player ${index + 1}`,
        profileId: profile.id,
      })),
    })
    const ownerId = PlayerIdSchema.parse('player-1')
    const recorder = server.trajectories.recorder(match.id)
    const turn = recorder.beginTurn({
      turnId: 'delivery-instructions-1',
      ownerId,
      sessionId: 'session-instructions-1',
      sessionGeneration: 1,
      kind: 'bootstrap',
      systemInstructions: '# 系统提示词\n\n当前身份与完整规则。',
      phaseId: null,
      actionType: 'bootstrap',
      fromSequence: 0,
      toSequence: server.repository.listMatchEvents(match.id).at(-1)?.sequence ?? 0,
      prompt: '请只回复准备就绪。',
      visibleEventSequences: [],
      gameStatus: 'starting',
      pausedReasonAtRender: null,
    })
    turn.complete('end_turn')

    expect(server.trajectories.page(match.id, ownerId, null).records).toMatchObject([
      {
        kind: 'instructions',
        title: 'instructions',
        text: '# 系统提示词\n\n当前身份与完整规则。',
      },
      { kind: 'prompt', title: 'prompt', text: '请只回复准备就绪。' },
    ])
  })

  it('returns secret-safe player launch and Session diagnostics', async () => {
    const server = await createServer()
    const tool = server.catalog.createTool({
      name: 'Debug launch tool',
      kind: 'custom',
      command: 'debug-agent',
      args: ['--api-key', 'sk-proj-sensitive-value', '--sandbox=read-only'],
      environment: {
        DEBUG_SECRET: { source: 'process', variable: 'DEBUG_SECRET_VALUE' },
        DEBUG_LITERAL: { source: 'literal', value: 'literal-should-not-leak', secret: false },
      },
      modelConfigKey: 'model',
    })
    const profile = server.catalog.createProfile({
      name: 'Debug profile',
      toolId: tool.id,
      model: 'debug-model',
      reasoningEffort: 'high',
      promptTimeoutMs: 42_000,
      connection: { endpoint: 'local', note: 'connection-should-not-leak' },
    })
    const match = server.matches.createMatch({
      boardId: BoardIdSchema.parse('board-quick-6'),
      roleAssignment: 'random',
      seats: Array.from({ length: 6 }, (_, index) => ({
        seat: index + 1,
        name: `Debug player ${index + 1}`,
        profileId: profile.id,
      })),
    })
    const playerId = PlayerIdSchema.parse('player-1')
    server.repository.playerSessions.adopt({
      matchId: match.id,
      playerId,
      profile,
      tool,
      sessionId: 'session-debug-001',
    })
    server.repository.saveDeliveryLedger(match.id, playerId, {
      acknowledgedSequence: 17,
      activeAttempt: null,
    })
    server.repository.saveTrajectoryTurn(
      TrajectoryTurnSchema.parse({
        matchId: match.id,
        turnId: 'delivery-debug-001',
        ownerId: playerId,
        sessionId: 'session-debug-001',
        sessionGeneration: 1,
        ordinal: 1,
        attempt: 1,
        kind: 'action',
        phaseId: 'phase-day-speech',
        actionType: 'speech',
        fromSequence: 12,
        toSequence: 17,
        status: 'completed',
        startedAt: '2026-08-27T00:00:00.000Z',
        completedAt: '2026-08-27T00:00:01.000Z',
        durationMs: 1_000,
        stopReason: 'end_turn',
        error: null,
        usage: { used: 13_925, size: 190_000, cost: null },
        revision: 0,
      }),
    )

    const response = await server.app.inject({
      method: 'GET',
      url: `/api/developer/matches/${match.id}/trajectory/players/${playerId}`,
    })
    expect(response.statusCode).toBe(200)
    const debug = response.json()
    expect(debug).toMatchObject({
      profile: { name: 'Debug profile', model: 'debug-model', reasoningEffort: 'high' },
      session: { id: 'session-debug-001', generation: 1, state: 'active' },
      delivery: { acknowledgedSequence: 17 },
      context: { latest: { used: 13_925, size: 190_000 }, peakUsed: 13_925 },
      latestTurn: { ordinal: 1, actionType: 'speech', status: 'completed' },
    })
    expect(debug.launch.args).toEqual(['--api-key', '[REDACTED]', '--sandbox=read-only'])
    expect(debug.launch.environment).toEqual([
      { name: 'DEBUG_LITERAL', source: 'literal', reference: null },
      { name: 'DEBUG_SECRET', source: 'process', reference: 'DEBUG_SECRET_VALUE' },
    ])
    expect(debug.launch.connectionKeys).toEqual(['endpoint', 'note'])
    expect(JSON.stringify(debug)).not.toContain('literal-should-not-leak')
    expect(JSON.stringify(debug)).not.toContain('connection-should-not-leak')
    expect(JSON.stringify(debug)).not.toContain('sk-proj-sensitive-value')
  })

  it('uses explicit turns, merges streams, upserts tools, and redacts secrets before storage', async () => {
    const server = await createServer()
    const tool = builtInAgentTools()[0]!
    const profile = server.catalog.createProfile({
      name: 'Trajectory fixture',
      toolId: tool.id,
      model: 'fixture-model',
      promptTimeoutMs: 5_000,
      connection: {},
    })
    const match = server.matches.createMatch({
      boardId: BoardIdSchema.parse('board-quick-6'),
      roleAssignment: 'random',
      seats: Array.from({ length: 6 }, (_, index) => ({
        seat: index + 1,
        name: `Trace player ${index + 1}`,
        profileId: profile.id,
      })),
    })
    const recorder = server.trajectories.recorder(match.id)
    recorder.recordSystemEvents([])
    const fullRecordReads = vi.spyOn(server.repository, 'listTrajectoryRecords')
    const targetedRecordReads = vi.spyOn(server.repository, 'listTrajectoryRecordsForTurns')
    const ownerId = PlayerIdSchema.parse('player-1')
    const turn = recorder.beginTurn({
      turnId: 'delivery-trace-1',
      ownerId,
      sessionId: 'session-trace-1',
      sessionGeneration: recorder.nextSessionGeneration(ownerId),
      kind: 'action',
      phaseId: PhaseIdSchema.parse('phase-night-seer'),
      actionType: 'night-action',
      fromSequence: 3,
      toSequence: 9,
      prompt: '完整提示词与事件 4 至 9。',
      visibleEventSequences: [],
      gameStatus: 'running',
      pausedReasonAtRender: null,
    })
    for (const text of ['分析', '目标', '目标', '，', '完成。']) {
      turn.update({
        sessionUpdate: 'agent_thought_chunk',
        messageId: 'reasoning-1',
        content: { type: 'text', text },
      } as SessionUpdate)
    }
    turn.update({
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: '工具前消息。' },
    } as SessionUpdate)
    turn.update({ sessionUpdate: 'user_message_chunk' } as SessionUpdate)
    turn.update({
      sessionUpdate: 'agent_message_chunk',
      messageId: 'non-text',
      content: { type: 'resource_link', name: 'resource', uri: 'memory://resource' },
    } as unknown as SessionUpdate)
    turn.update({
      sessionUpdate: 'tool_call',
      toolCallId: 'call-1',
      title: 'submit_night_action',
      status: 'pending',
      rawInput: {
        targetPlayerIds: ['player-2'],
        authorization: 'Bearer should-not-persist',
        nested: { apiKey: 'also-secret' },
      },
    } as unknown as SessionUpdate)
    turn.update({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'call-1',
      status: 'completed',
      rawOutput: { accepted: true },
    } as unknown as SessionUpdate)
    turn.permission(
      {
        sessionId: 'session-trace-1',
        toolCall: {
          toolCallId: 'call-1',
          title: 'submit_night_action',
          rawInput: { token: 'permission-secret' },
        },
        options: [{ optionId: 'allow', kind: 'allow_once', name: 'Allow once' }],
      } as unknown as RequestPermissionRequest,
      true,
    )
    turn.permission(
      {
        sessionId: 'session-trace-1',
        toolCall: {
          toolCallId: 'call-denied',
          name: 'denied-tool',
          rawInput: { value: 'safe' },
        },
        options: [{ optionId: 'deny', kind: 'reject_once', name: 'Deny once' }],
      } as unknown as RequestPermissionRequest,
      false,
    )
    turn.diagnostic('ERROR failed diagnostic')
    turn.diagnostic('WARNING warning diagnostic')
    turn.diagnostic('DEBUG debug diagnostic')
    turn.diagnostic('ordinary diagnostic')
    turn.accepted('bigint', 1n)
    turn.update({
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: '工具后消息。' },
    } as SessionUpdate)
    turn.update({
      sessionUpdate: 'usage_update',
      used: 1234,
      size: 32768,
      cost: { amount: 0.012, currency: 'USD' },
    } as SessionUpdate)
    turn.action(
      PlayerActionSchema.parse({
        type: 'night-action',
        matchId: match.id,
        actorId: ownerId,
        abilityId: 'ability-seer-inspect',
        targetIds: ['player-2'],
      }),
    )
    turn.complete('end_turn')
    expect(fullRecordReads).not.toHaveBeenCalled()

    const page = server.trajectories.page(match.id, ownerId, null)
    expect(fullRecordReads).not.toHaveBeenCalled()
    expect(targetedRecordReads).toHaveBeenCalledWith(match.id, ['delivery-trace-1'])
    expect(server.repository.listTrajectoryRecordsForTurns(match.id, [])).toEqual([])
    expect(page.turns).toHaveLength(1)
    expect(page.turns[0]).toMatchObject({
      status: 'completed',
      attempt: 1,
      fromSequence: 3,
      toSequence: 9,
      usage: { used: 1234, size: 32768 },
    })
    const reasoning = page.records.filter((record) => record.kind === 'reasoning')
    expect(reasoning).toHaveLength(1)
    expect(reasoning[0]?.text).toBe('分析目标目标，完成。')
    const messages = page.records.filter((record) => record.kind === 'message')
    expect(messages.map((record) => record.text)).toEqual([
      '工具前消息。',
      expect.stringContaining('resource_link'),
      '工具后消息。',
    ])
    const toolRecord = page.records.find((record) => record.kind === 'tool')
    expect(toolRecord).toMatchObject({ status: 'completed' })
    expect(messages[0]!.ordinal).toBeLessThan(toolRecord!.ordinal)
    expect(messages.at(-1)!.ordinal).toBeGreaterThan(toolRecord!.ordinal)
    expect(toolRecord?.input).toContain('[REDACTED]')
    expect(toolRecord?.input).not.toContain('should-not-persist')
    expect(toolRecord?.input).not.toContain('also-secret')
    expect(toolRecord?.output).toContain('accepted')
    expect(page.records.some((record) => record.kind === 'prompt')).toBe(true)
    expect(page.records.some((record) => record.kind === 'permission')).toBe(true)
    expect(page.records.some((record) => record.kind === 'action')).toBe(true)

    targetedRecordReads.mockClear()
    const deltas: TrajectoryDelta[] = []
    const unsubscribe = server.trajectories.subscribe(
      match.id,
      server.repository.trajectoryRevision(match.id),
      (delta) => deltas.push(delta),
    )
    const retry = recorder.beginTurn({
      turnId: 'delivery-trace-2',
      ownerId,
      sessionId: 'session-trace-2',
      sessionGeneration: 2,
      kind: 'action',
      phaseId: PhaseIdSchema.parse('phase-night-seer'),
      actionType: 'night-action',
      fromSequence: 3,
      toSequence: 9,
      prompt: '恢复后的同一行动。',
      visibleEventSequences: [],
      gameStatus: 'running',
      pausedReasonAtRender: null,
    })
    retry.fail(new Error('transport failed'), 'uncertain')
    unsubscribe()
    expect(targetedRecordReads).toHaveBeenCalled()
    expect(
      targetedRecordReads.mock.calls.every(
        ([readMatchId, turnIds]) =>
          readMatchId === match.id && turnIds.length === 1 && turnIds[0] === 'delivery-trace-2',
      ),
    ).toBe(true)
    expect(
      deltas
        .flatMap((delta) => delta.records)
        .every((record) => record.turnId === 'delivery-trace-2'),
    ).toBe(true)
    expect(server.trajectories.page(match.id, ownerId, null).turns.at(-1)).toMatchObject({
      attempt: 2,
      status: 'uncertain',
      sessionGeneration: 2,
    })

    await server.matches.deleteMatch(MatchIdSchema.parse(match.id))
    expect(server.repository.listTrajectoryTurns(match.id)).toHaveLength(0)
    expect(server.repository.listTrajectoryRecords(match.id)).toHaveLength(0)
  })

  it('projects shared game periods and canonical committed speech', async () => {
    const server = await createServer()
    const tool = builtInAgentTools()[0]!
    const profile = server.catalog.createProfile({
      name: 'Trajectory semantics fixture',
      toolId: tool.id,
      model: 'fixture-model',
      promptTimeoutMs: 5_000,
      connection: {},
    })
    const match = server.matches.createMatch({
      boardId: BoardIdSchema.parse('board-quick-6'),
      roleAssignment: 'random',
      seats: Array.from({ length: 6 }, (_, index) => ({
        seat: index + 1,
        name: `Timeline player ${index + 1}`,
        profileId: profile.id,
      })),
    })
    const initialSequence = server.repository.listMatchEvents(match.id).at(-1)?.sequence ?? 0
    const event = (offset: number, payload: GameEventPayload) =>
      GameEventSchema.parse({
        matchId: match.id,
        sequence: initialSequence + offset,
        occurredAt: `2026-08-23T00:00:0${offset}.000Z`,
        visibility: { kind: 'public' },
        payload,
      })
    server.repository.appendEvents([
      event(1, { type: 'night.started', night: 1 }),
      event(2, {
        type: 'phase.changed',
        phaseId: PhaseIdSchema.parse('phase-night-witch'),
        day: 0,
        labelKey: 'phases.nightWitch',
      }),
      event(3, { type: 'day.started', day: 1 }),
      event(4, {
        type: 'phase.changed',
        phaseId: PhaseIdSchema.parse('phase-sheriff-signup'),
        day: 1,
        labelKey: 'phases.sheriffSignup',
      }),
      event(5, {
        type: 'phase.changed',
        phaseId: PhaseIdSchema.parse('phase-day-speech'),
        day: 1,
        labelKey: 'phases.daySpeech',
      }),
      event(6, { type: 'night.started', night: 2 }),
      event(7, {
        type: 'phase.changed',
        phaseId: PhaseIdSchema.parse('phase-night-seer'),
        day: 1,
        labelKey: 'phases.nightSeer',
      }),
    ])

    const recorder = server.trajectories.recorder(match.id)
    const ownerId = PlayerIdSchema.parse('player-1')
    const otherOwnerId = PlayerIdSchema.parse('player-2')
    const recordTurn = (
      turnId: string,
      playerId: PlayerId,
      kind: 'bootstrap' | 'action',
      phaseId: string | null,
      actionType: string,
      toSequence: number,
    ) => {
      const input = {
        turnId,
        ownerId: playerId,
        sessionId: `session-${turnId}`,
        sessionGeneration: 1,
        phaseId: phaseId ? PhaseIdSchema.parse(phaseId) : null,
        actionType,
        fromSequence: 0,
        toSequence,
        prompt: `Prompt ${turnId}`,
        visibleEventSequences: [],
        gameStatus: 'running',
        pausedReasonAtRender: null,
      } as const
      const turn = recorder.beginTurn(
        kind === 'bootstrap'
          ? { ...input, kind, systemInstructions: `Instructions ${turnId}` }
          : { ...input, kind },
      )
      turn.complete('end_turn')
      return turn
    }
    recordTurn('setup', ownerId, 'bootstrap', null, 'bootstrap', initialSequence)
    recordTurn(
      'night-one',
      ownerId,
      'action',
      'phase-night-witch',
      'night-action',
      initialSequence + 2,
    )
    recordTurn(
      'sheriff',
      ownerId,
      'action',
      'phase-sheriff-signup',
      'sheriff-action',
      initialSequence + 4,
    )

    const speech = recorder.beginTurn({
      turnId: 'day-speech',
      ownerId,
      sessionId: 'session-day-speech',
      sessionGeneration: 1,
      kind: 'action',
      phaseId: PhaseIdSchema.parse('phase-day-speech'),
      actionType: 'speech',
      fromSequence: 0,
      toSequence: initialSequence + 5,
      prompt: 'Day speech prompt',
      visibleEventSequences: [],
      gameStatus: 'running',
      pausedReasonAtRender: null,
    })
    speech.update({
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: 'user当前进入工具回合。' },
    } as SessionUpdate)
    speech.update({
      sessionUpdate: 'tool_call',
      toolCallId: 'speech-rejected-tool',
      title: 'submit_vote',
      status: 'failed',
    } as unknown as SessionUpdate)
    speech.update({
      sessionUpdate: 'agent_message_chunk',
      messageId: 'speech-1',
      content: { type: 'text', text: 'player-2 昨夜平安夜，先听发言。' },
    } as SessionUpdate)
    const beforeActionRevision = server.repository.trajectoryRevision(match.id)
    const submittedSpeech = 'player-2 昨夜平安夜，先听发言。'
    const canonicalSpeech = 'Timeline player 2 昨夜平安夜，先听发言。'
    speech.action(
      PlayerActionSchema.parse({
        type: 'speech',
        matchId: match.id,
        actorId: ownerId,
        kind: 'day',
        text: submittedSpeech,
      }),
    )
    speech.complete('end_turn')
    recordTurn(
      'replacement-bootstrap',
      ownerId,
      'bootstrap',
      null,
      'bootstrap',
      initialSequence + 7,
    )
    recordTurn(
      'other-night-one',
      otherOwnerId,
      'action',
      'phase-night-witch',
      'night-action',
      initialSequence + 2,
    )

    const page = server.trajectories.page(match.id, ownerId, null, 50)
    expect(page.turns.map((turn) => turn.timelineGroup)).toEqual([
      { kind: 'setup', index: null },
      { kind: 'night', index: 1 },
      { kind: 'sheriff', index: 1 },
      { kind: 'day', index: 1 },
      { kind: 'night', index: 2 },
    ])
    expect(server.trajectories.page(match.id, otherOwnerId, null).turns[0]?.timelineGroup).toEqual({
      kind: 'night',
      index: 1,
    })
    expect(
      page.records.filter((record) => record.kind === 'message').map((record) => record.text),
    ).toEqual(['user当前进入工具回合。', canonicalSpeech])

    const actionDelta = server.trajectories.changes(match.id, beforeActionRevision)
    expect(actionDelta.records.some((record) => record.text === canonicalSpeech)).toBe(true)
  })

  it('bounds pages, catches up subscribers, and validates player diagnostics and terminal groups', async () => {
    const server = await createServer()
    const profile = server.catalog.createProfile({
      name: 'Trajectory edge profile',
      toolId: builtInAgentTools()[0]!.id,
      model: 'edge-model',
      promptTimeoutMs: 5_000,
      connection: {},
    })
    const match = server.matches.createMatch({
      boardId: BoardIdSchema.parse('board-quick-6'),
      roleAssignment: 'random',
      seats: Array.from({ length: 6 }, (_, index) => ({
        seat: index + 1,
        name: `Edge player ${index + 1}`,
        profileId: profile.id,
      })),
    })
    const playerId = PlayerIdSchema.parse('player-1')
    const recorder = server.trajectories.recorder(match.id)
    for (const [turnId, kind, phaseId] of [
      ['postgame-edge', 'postgame', null],
      ['ended-edge', 'action', 'phase-match-ended'],
      ['fallback-night-edge', 'action', null],
    ] as const) {
      const turn = recorder.beginTurn({
        turnId,
        ownerId: playerId,
        sessionId: `session-${turnId}`,
        sessionGeneration: 1,
        kind,
        phaseId: phaseId ? PhaseIdSchema.parse(phaseId) : null,
        actionType: kind === 'postgame' ? 'postgame-review' : 'domain-events',
        fromSequence: 0,
        toSequence: server.repository.listMatchEvents(match.id).at(-1)?.sequence ?? 1,
        prompt: turnId,
        visibleEventSequences: [],
        gameStatus: kind === 'postgame' ? 'ended' : 'running',
        pausedReasonAtRender: null,
      })
      turn.complete('end_turn')
    }
    const plainFailure = recorder.beginTurn({
      turnId: 'plain-failure-edge',
      ownerId: playerId,
      sessionId: 'session-plain-failure-edge',
      sessionGeneration: 1,
      kind: 'action',
      phaseId: PhaseIdSchema.parse('phase-day-vote'),
      actionType: 'vote',
      fromSequence: 0,
      toSequence: server.repository.listMatchEvents(match.id).at(-1)?.sequence ?? 1,
      prompt: 'plain failure',
      visibleEventSequences: [],
      gameStatus: 'running',
      pausedReasonAtRender: null,
    })
    plainFailure.fail('plain failure', 'failed')

    const caughtUp: TrajectoryDelta[] = []
    const unsubscribe = server.trajectories.subscribe(match.id, 0, (delta) => caughtUp.push(delta))
    expect(caughtUp.length).toBeGreaterThan(0)
    unsubscribe()
    unsubscribe()
    expect(server.trajectories.page(match.id, playerId, null, 0).turns).toHaveLength(1)
    expect(server.trajectories.page(match.id, playerId, 3, 50).nextBeforeTurn).toBeNull()
    expect(server.trajectories.summary(match.id).owners[0]?.label).toBeTruthy()
    expect(server.trajectories.playerDebug(match.id, playerId).profile.model).toBe('edge-model')
    expect(() =>
      server.trajectories.playerDebug(match.id, PlayerIdSchema.parse('player-99')),
    ).toThrow(/Unknown Player/)
    expect(() =>
      server.trajectories.summary(MatchIdSchema.parse('match-missing-trajectory')),
    ).toThrow(/Unknown match/)
    const withoutCatalog = new TrajectoryService(server.repository)
    expect(() => withoutCatalog.playerDebug(match.id, playerId)).toThrow(
      /Missing Agent configuration/,
    )

    const groups = server.trajectories
      .page(match.id, playerId, null, 50)
      .turns.map((turn) => turn.timelineGroup.kind)
    expect(groups).toContain('review')
    expect(groups).toContain('end')
  })
})

async function createServer(): Promise<AgentWolfServer> {
  const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-trajectory-'))
  roots.push(root)
  const server = await buildServer({
    config: {
      host: '127.0.0.1',
      port: 4310,
      dataDirectory: root,
      databasePath: ':memory:',
      publicBaseUrl: 'http://127.0.0.1:4310',
      projectRoot: process.cwd(),
      webDistPath: resolve(root, 'missing'),
      developerMode: true,
      publicSpeechInterruptMode: 'legacy',
    },
  })
  servers.push(server)
  return server
}
