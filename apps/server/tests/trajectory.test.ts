import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import type { RequestPermissionRequest, SessionUpdate } from '@agentclientprotocol/sdk'
import {
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
import { getCopy } from '@agentwolf/assets'
import { buildServer, type AgentWolfServer } from '../src/app.js'
import { bootstrapContextBudgetIssue, equivalentPrompt } from '../src/trajectory-audit.js'

const roots: string[] = []
const servers: AgentWolfServer[] = []

afterEach(async () => {
  await Promise.allSettled(servers.splice(0).map((server) => server.close()))
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('trajectory capture', () => {
  it('audits the game-only bootstrap context budget from prompt contract 16 onward', () => {
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
      promptVersion: 16,
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
    expect(bootstrapContextBudgetIssue({ ...turn, promptVersion: 15 })).toBeNull()
    expect(bootstrapContextBudgetIssue({ ...turn, kind: 'action' })).toBeNull()
    expect(
      bootstrapContextBudgetIssue({
        ...turn,
        usage: { ...turn.usage!, used: 12_000 },
      }),
    ).toBeNull()
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
      boardId: 'board-quick-6',
      roleAssignment: 'random',
      seats: Array.from({ length: 6 }, (_, index) => ({
        seat: index + 1,
        name: `Trace player ${index + 1}`,
        profileId: profile.id,
      })),
    })
    const recorder = server.trajectories.recorder(match.id)
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
    expect(messages.map((record) => record.text)).toEqual(['工具前消息。', '工具后消息。'])
    const toolRecord = page.records.find((record) => record.kind === 'tool')
    expect(toolRecord).toMatchObject({ status: 'completed' })
    expect(messages[0]!.ordinal).toBeLessThan(toolRecord!.ordinal)
    expect(messages[1]!.ordinal).toBeGreaterThan(toolRecord!.ordinal)
    expect(toolRecord?.input).toContain('[REDACTED]')
    expect(toolRecord?.input).not.toContain('should-not-persist')
    expect(toolRecord?.input).not.toContain('also-secret')
    expect(toolRecord?.output).toContain('accepted')
    expect(page.records.some((record) => record.kind === 'prompt')).toBe(true)
    expect(page.records.some((record) => record.kind === 'permission')).toBe(true)
    expect(page.records.some((record) => record.kind === 'action')).toBe(true)

    const versionTwelveWolfVote = {
      ...page.turns[0]!,
      phaseId: PhaseIdSchema.parse('phase-night-wolf-vote'),
      promptVersion: 12,
    }
    const wolfVotePrompt = '裁判：进入狼人袭击。\n\n狼队商议结束。'
    const optionalConstraint = getCopy('promptActions.wolfKillVoteOnly')
    expect(
      equivalentPrompt(
        versionTwelveWolfVote,
        wolfVotePrompt,
        `${wolfVotePrompt}\n\n${optionalConstraint}`,
      ),
    ).toBe(true)
    expect(
      equivalentPrompt(
        { ...versionTwelveWolfVote, promptVersion: 13 },
        wolfVotePrompt,
        `${wolfVotePrompt}\n\n${optionalConstraint}`,
      ),
    ).toBe(false)

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
      boardId: 'board-quick-6',
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
        phaseId: 'phase-night-witch',
        day: 0,
        labelKey: 'phases.nightWitch',
      }),
      event(3, { type: 'day.started', day: 1 }),
      event(4, {
        type: 'phase.changed',
        phaseId: 'phase-sheriff-signup',
        day: 1,
        labelKey: 'phases.sheriffSignup',
      }),
      event(5, {
        type: 'phase.changed',
        phaseId: 'phase-day-speech',
        day: 1,
        labelKey: 'phases.daySpeech',
      }),
      event(6, { type: 'night.started', night: 2 }),
      event(7, {
        type: 'phase.changed',
        phaseId: 'phase-night-seer',
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
      const turn = recorder.beginTurn({
        turnId,
        ownerId: playerId,
        sessionId: `session-${turnId}`,
        sessionGeneration: 1,
        kind,
        phaseId: phaseId ? PhaseIdSchema.parse(phaseId) : null,
        actionType,
        fromSequence: 0,
        toSequence,
        prompt: `Prompt ${turnId}`,
        promptVersion: 10,
        visibleEventSequences: [],
        gameStatus: 'running',
        pausedReasonAtRender: null,
      })
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
      promptVersion: 10,
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
    },
  })
  servers.push(server)
  return server
}
