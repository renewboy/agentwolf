import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import type { RequestPermissionRequest, SessionUpdate } from '@agentclientprotocol/sdk'
import {
  MatchIdSchema,
  PhaseIdSchema,
  PlayerActionSchema,
  PlayerIdSchema,
} from '@agentwolf/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { builtInAgentTools } from '@agentwolf/acp'
import { buildServer, type AgentWolfServer } from '../src/app.js'

const roots: string[] = []
const servers: AgentWolfServer[] = []

afterEach(async () => {
  await Promise.allSettled(servers.splice(0).map((server) => server.close()))
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('trajectory capture', () => {
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
    for (const text of ['分析', '分析目标', '目标']) {
      turn.update({
        sessionUpdate: 'agent_thought_chunk',
        messageId: 'reasoning-1',
        content: { type: 'text', text },
      } as SessionUpdate)
    }
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
      sessionUpdate: 'tool_call_update',
      toolCallId: 'call-1',
      status: 'completed',
      rawOutput: { accepted: true },
    } as unknown as SessionUpdate)
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

    const page = server.trajectories.page(match.id, ownerId, null)
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
    expect(reasoning[0]?.text).toBe('分析目标')
    const toolRecord = page.records.find((record) => record.kind === 'tool')
    expect(toolRecord).toMatchObject({ status: 'completed' })
    expect(toolRecord?.input).toContain('[REDACTED]')
    expect(toolRecord?.input).not.toContain('should-not-persist')
    expect(toolRecord?.input).not.toContain('also-secret')
    expect(toolRecord?.output).toContain('accepted')
    expect(page.records.some((record) => record.kind === 'prompt')).toBe(true)
    expect(page.records.some((record) => record.kind === 'permission')).toBe(true)
    expect(page.records.some((record) => record.kind === 'action')).toBe(true)

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
    expect(server.trajectories.page(match.id, ownerId, null).turns.at(-1)).toMatchObject({
      attempt: 2,
      status: 'uncertain',
      sessionGeneration: 2,
    })

    await server.matches.deleteMatch(MatchIdSchema.parse(match.id))
    expect(server.repository.listTrajectoryTurns(match.id)).toHaveLength(0)
    expect(server.repository.listTrajectoryRecords(match.id)).toHaveLength(0)
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
