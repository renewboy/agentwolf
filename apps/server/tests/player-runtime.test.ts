import {
  AgentProfileSchema,
  AgentToolSchema,
  MatchIdSchema,
  PhaseIdSchema,
  PlayerIdSchema,
} from '@agentwolf/contracts'
import { AcpDeliveryUncertainError, type AcpPromptResult } from '@agentwolf/acp'
import { describe, expect, it } from 'vitest'
import { ActionMailbox } from '../src/action-mailbox.js'
import { PlayerRuntime, type PlayerRuntimeStatus } from '../src/player-runtime.js'
import {
  createPlayerSessionBinding,
  withActivePlayerSession,
  withPendingPlayerAction,
  withoutPendingPlayerAction,
  type PlayerSessionBinding,
} from '../src/player-session-binding.js'
import type { SqliteRepository } from '../src/repository.js'
import type { MatchTrajectoryRecorder } from '../src/trajectory.js'

describe('PlayerRuntime action status', () => {
  it('publishes submitted as soon as a structured action is accepted', async () => {
    const matchId = MatchIdSchema.parse('match-runtime-submitted')
    const playerId = PlayerIdSchema.parse('player-1')
    const mailbox = new ActionMailbox()
    const token = mailbox.issueToken(matchId, playerId)
    const statuses: PlayerRuntimeStatus[] = []
    let announceSubmission!: () => void
    const submission = new Promise<void>((resolvePromise) => {
      announceSubmission = resolvePromise
    })
    let finishPrompt!: () => void
    const promptResult = new Promise<AcpPromptResult>((resolvePromise) => {
      finishPrompt = () => resolvePromise({ text: '', stopReason: 'end_turn', updates: [] })
    })
    const profile = AgentProfileSchema.parse({
      id: 'profile-runtime-submitted',
      name: 'Submitted status profile',
      toolId: 'tool-runtime-submitted',
      model: 'scripted-model',
      promptTimeoutMs: 5_000,
      connection: {},
      createdAt: '2026-08-23T00:00:00.000Z',
      updatedAt: '2026-08-23T00:00:00.000Z',
    })
    const tool = AgentToolSchema.parse({
      id: 'tool-runtime-submitted',
      name: 'Submitted status tool',
      kind: 'custom',
      command: 'submitted-status-tool',
      args: [],
      environment: {},
      modelConfigKey: 'model',
      builtIn: false,
    })
    let binding: PlayerSessionBinding | null = null
    const repository = {
      getDeliveryLedger: () => null,
      saveDeliveryLedger: () => undefined,
      playerSessions: {
        get: () => binding,
        reserve: () => {
          binding = createPlayerSessionBinding({ matchId, playerId, profile, tool })
          return binding
        },
        activate: (_matchId: string, _playerId: string, sessionId: string) => {
          binding = withActivePlayerSession(binding!, sessionId)
          return binding
        },
        savePendingAction: (
          _matchId: string,
          _playerId: string,
          deliveryId: string,
          action: Parameters<typeof withPendingPlayerAction>[2],
        ) => {
          binding = withPendingPlayerAction(binding!, deliveryId, action)
          return binding
        },
        clearPendingAction: () => {
          binding = withoutPendingPlayerAction(binding!)
          return binding
        },
      },
      listTrajectoryTurns: () => [],
    } as unknown as SqliteRepository
    const trajectory = {
      nextSessionGeneration: () => 1,
      beginTurn: () => ({
        update: () => undefined,
        permission: () => undefined,
        diagnostic: () => undefined,
        action: () => undefined,
        complete: () => undefined,
        fail: () => undefined,
      }),
    } as unknown as MatchTrajectoryRecorder
    const runtime = new PlayerRuntime({
      matchId,
      playerId,
      profile,
      tool,
      workspace: '/tmp/agentwolf-submitted-status',
      token,
      mcpUrl: 'http://127.0.0.1:4310/mcp',
      mailbox,
      repository,
      trajectory,
      deliveryEvents: {
        started: () => undefined,
        acknowledged: () => undefined,
      },
      sessionFactory: async () => ({
        sessionId: 'session-runtime-submitted',
        connected: true,
        prompt: () => {
          mailbox.submitVote(token, 'player-2')
          announceSubmission()
          return promptResult
        },
        close: () => Promise.resolve(),
      }),
      onStatusChange: (_changedPlayerId, status) => statuses.push(status),
    })
    await runtime.start()

    const turn = runtime.takeTurn(
      { prompt: '提交投票。', toSequence: 1, visibleEvents: [] },
      { matchId, playerId, actionType: 'vote', voteKind: 'exile' },
      PhaseIdSchema.parse('phase-day-vote'),
    )
    await submission
    expect(runtime.status).toBe('submitted')
    expect(statuses).toEqual(['starting', 'ready', 'thinking', 'submitted'])

    finishPrompt()
    await expect(turn).resolves.toMatchObject({
      type: 'vote',
      actorId: playerId,
      targetId: 'player-2',
    })
    expect(runtime.status).toBe('ready')
    await runtime.close()
  })

  it('keeps an accepted action durable when the Prompt transport fails', async () => {
    const matchId = MatchIdSchema.parse('match-runtime-durable-action')
    const playerId = PlayerIdSchema.parse('player-1')
    const mailbox = new ActionMailbox()
    const token = mailbox.issueToken(matchId, playerId)
    const profile = AgentProfileSchema.parse({
      id: 'profile-runtime-durable-action',
      name: 'Durable action profile',
      toolId: 'tool-runtime-durable-action',
      model: 'scripted-model',
      promptTimeoutMs: 5_000,
      connection: {},
      createdAt: '2026-08-23T00:00:00.000Z',
      updatedAt: '2026-08-23T00:00:00.000Z',
    })
    const tool = AgentToolSchema.parse({
      id: 'tool-runtime-durable-action',
      name: 'Durable action tool',
      kind: 'custom',
      command: 'durable-action-tool',
      args: [],
      environment: {},
      modelConfigKey: 'model',
      builtIn: false,
    })
    let binding: PlayerSessionBinding | null = null
    let ledger: unknown = null
    const repository = {
      getDeliveryLedger: () => ledger,
      saveDeliveryLedger: (_matchId: string, _playerId: string, snapshot: unknown) => {
        ledger = snapshot
      },
      playerSessions: {
        get: () => binding,
        reserve: () => {
          binding = createPlayerSessionBinding({ matchId, playerId, profile, tool })
          return binding
        },
        activate: (_matchId: string, _playerId: string, sessionId: string) => {
          binding = withActivePlayerSession(binding!, sessionId)
          return binding
        },
        savePendingAction: (
          _matchId: string,
          _playerId: string,
          deliveryId: string,
          action: Parameters<typeof withPendingPlayerAction>[2],
        ) => {
          binding = withPendingPlayerAction(binding!, deliveryId, action)
          return binding
        },
        clearPendingAction: () => {
          binding = withoutPendingPlayerAction(binding!)
          return binding
        },
      },
      listTrajectoryTurns: () => [],
    } as unknown as SqliteRepository
    const trajectory = {
      beginTurn: () => ({
        update: () => undefined,
        permission: () => undefined,
        diagnostic: () => undefined,
        action: () => undefined,
        complete: () => undefined,
        fail: () => undefined,
      }),
    } as unknown as MatchTrajectoryRecorder
    const starts: Array<string | null> = []
    let firstConnection = true
    const acknowledged: string[] = []
    const runtime = new PlayerRuntime({
      matchId,
      playerId,
      profile,
      tool,
      workspace: '/tmp/agentwolf-durable-action',
      token,
      mcpUrl: 'http://127.0.0.1:4310/mcp',
      mailbox,
      repository,
      trajectory,
      deliveryEvents: {
        started: () => undefined,
        acknowledged: (_playerId, deliveryId) => acknowledged.push(deliveryId),
      },
      sessionFactory: async (options) => {
        starts.push(options.resumeSessionId ?? null)
        const initial = firstConnection
        firstConnection = false
        let connected = true
        return {
          sessionId: 'session-runtime-durable-action',
          get connected() {
            return connected
          },
          prompt: async () => {
            if (!initial) return { text: '', stopReason: 'end_turn', updates: [] }
            mailbox.submitVote(token, 'player-2')
            connected = false
            throw new AcpDeliveryUncertainError('simulated response loss')
          },
          close: async () => {
            connected = false
          },
        }
      },
    })
    await runtime.start()

    await expect(
      runtime.takeTurn(
        {
          prompt: '提交投票。',
          promptVersion: 19,
          toSequence: 1,
          visibleEvents: [],
          gameStatus: 'running',
          pausedReason: null,
          continuation: false,
        },
        { matchId, playerId, actionType: 'vote', voteKind: 'exile' },
        PhaseIdSchema.parse('phase-day-vote'),
      ),
    ).resolves.toMatchObject({ type: 'vote', actorId: playerId, targetId: 'player-2' })
    expect(runtime.status).toBe('failed')
    expect(binding?.pendingAction?.action).toMatchObject({ type: 'vote', targetId: 'player-2' })
    expect(acknowledged).toHaveLength(1)

    runtime.actionCommitted()
    expect(binding?.pendingAction).toBeNull()
    await runtime.ensureReady()
    expect(starts).toEqual([null, 'session-runtime-durable-action'])
    expect(runtime.status).toBe('ready')
    await runtime.close()
  })
})
