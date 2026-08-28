import {
  AgentProfileSchema,
  AgentToolSchema,
  MatchIdSchema,
  PhaseIdSchema,
  PlayerIdSchema,
} from '@agentwolf/contracts'
import { AcpDeliveryUncertainError, type AcpPromptResult } from '@agentwolf/acp'
import { describe, expect, it, vi } from 'vitest'
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
    let emitToolReceipt!: () => void
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
        finishAfterAcceptedAction: () => finishPrompt(),
        prompt: (_prompt, _timeoutMs, callbacks = {}) => {
          callbacks.onUpdate?.({
            sessionUpdate: 'agent_thought_chunk',
            content: { type: 'text', text: 'thinking' },
          })
          mailbox.submitVote(token, 'player-2')
          announceSubmission()
          emitToolReceipt = () =>
            callbacks.onUpdate?.({
              sessionUpdate: 'tool_call_update',
              toolCallId: 'accepted-vote',
              status: 'failed',
            })
          return promptResult
        },
        close: () => Promise.resolve(),
      }),
      onStatusChange: (_changedPlayerId, status) => statuses.push(status),
    })
    await runtime.start()
    await runtime.start()

    const turn = runtime.takeTurn(
      {
        prompt: '提交投票。',
        toSequence: 1,
        visibleEvents: [],
        gameStatus: 'running',
        pausedReason: null,
        continuation: false,
      },
      { matchId, playerId, actionType: 'vote', voteKind: 'exile' },
      PhaseIdSchema.parse('phase-day-vote'),
    )
    await submission
    expect(runtime.status).toBe('submitted')
    expect(statuses).toEqual(['starting', 'ready', 'thinking', 'submitted'])

    emitToolReceipt()
    await expect(turn).resolves.toMatchObject({
      type: 'vote',
      actorId: playerId,
      targetId: 'player-2',
    })
    expect(runtime.status).toBe('ready')
    await runtime.close()
    await runtime.close()
  })

  it('commits only clean direct speech when the Agent continues into a rejected tool turn', async () => {
    const matchId = MatchIdSchema.parse('match-runtime-clean-speech')
    const playerId = PlayerIdSchema.parse('player-1')
    const mailbox = new ActionMailbox()
    const token = mailbox.issueToken(matchId, playerId)
    const profile = AgentProfileSchema.parse({
      id: 'profile-runtime-clean-speech',
      name: 'Clean speech profile',
      toolId: 'tool-runtime-clean-speech',
      model: 'scripted-model',
      promptTimeoutMs: 5_000,
      connection: {},
      createdAt: '2026-08-23T00:00:00.000Z',
      updatedAt: '2026-08-23T00:00:00.000Z',
    })
    const tool = AgentToolSchema.parse({
      id: 'tool-runtime-clean-speech',
      name: 'Clean speech tool',
      kind: 'custom',
      command: 'clean-speech-tool',
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
        savePendingAction: () => {
          throw new Error('Direct speech must not persist a structured action')
        },
        clearPendingAction: () => {
          binding = withoutPendingPlayerAction(binding!)
          return binding
        },
      },
      listTrajectoryTurns: () => [],
    } as unknown as SqliteRepository
    const diagnostics: string[] = []
    const recordedActions: unknown[] = []
    const trajectory = {
      beginTurn: () => ({
        update: () => undefined,
        permission: () => undefined,
        diagnostic: (value: string) => diagnostics.push(value),
        action: (action: unknown) => recordedActions.push(action),
        complete: () => undefined,
        fail: () => undefined,
      }),
    } as unknown as MatchTrajectoryRecorder
    const streamed: string[] = []
    const rejectedReasons: string[] = []
    const cleanSpeech = '各位好，我会认真听完这一轮。'
    const generatedPrompt = 'user当前是第 1 天。裁判：进入警长竞选投票。'
    const secondSpeech = '我再重复一次刚才的发言。'
    const updates: AcpPromptResult['updates'][number][] = []
    const runtime = new PlayerRuntime({
      matchId,
      playerId,
      profile,
      tool,
      workspace: '/tmp/agentwolf-clean-speech',
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
        sessionId: 'session-runtime-clean-speech',
        connected: true,
        finishAfterAcceptedAction: () => undefined,
        prompt: async (_prompt, _timeoutMs, callbacks = {}) => {
          const emitText = (text: string): void => {
            const update = {
              sessionUpdate: 'agent_message_chunk',
              content: { type: 'text', text },
            } as AcpPromptResult['updates'][number]
            updates.push(update)
            callbacks.onUpdate?.(update)
            callbacks.onTextChunk?.(text)
          }
          emitText(`${cleanSpeech}\n\nus`)
          emitText(`er当前是第 1 天。裁判：进入警长竞选投票。`)
          const toolUpdate = {
            sessionUpdate: 'tool_call',
            toolCallId: 'rejected-vote',
            title: 'submit_vote',
            status: 'pending',
          } as AcpPromptResult['updates'][number]
          updates.push(toolUpdate)
          callbacks.onUpdate?.(toolUpdate)
          try {
            mailbox.submitVote(token, 'player-2')
          } catch (error) {
            rejectedReasons.push(error instanceof Error ? error.message : String(error))
          }
          emitText(secondSpeech)
          return {
            text: `${cleanSpeech}\n\n${generatedPrompt}${secondSpeech}`,
            stopReason: 'end_turn',
            updates,
          }
        },
        close: () => Promise.resolve(),
      }),
    })
    await runtime.start()

    const action = await runtime.takeTurn(
      {
        prompt: '现在轮到你发言。',
        toSequence: 1,
        visibleEvents: [],
        gameStatus: 'running',
        pausedReason: null,
        continuation: false,
      },
      { matchId, playerId, actionType: 'speech', speechKind: 'sheriff' },
      PhaseIdSchema.parse('phase-sheriff-speech'),
      { onTextChunk: (chunk) => streamed.push(chunk) },
    )

    expect(action).toMatchObject({ type: 'speech', text: cleanSpeech })
    expect(streamed.join('')).toBe(cleanSpeech)
    expect(recordedActions).toEqual([
      expect.objectContaining({ type: 'speech', text: cleanSpeech }),
    ])
    expect(rejectedReasons).toEqual(['The judge expects speech, not vote'])
    expect(diagnostics).toEqual([
      'Filtered embedded ACP role content or post-tool text from the direct speech response.',
    ])
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
          finishAfterAcceptedAction: () => undefined,
          prompt: async () => {
            if (!initial) {
              mailbox.submitVote(token, 'player-3')
              return { text: '', stopReason: 'end_turn', updates: [] }
            }
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
    expect((binding as PlayerSessionBinding | null)?.pendingAction?.action).toMatchObject({
      type: 'vote',
      targetId: 'player-2',
    })
    expect(acknowledged).toHaveLength(1)

    runtime.actionSettled()
    expect((binding as PlayerSessionBinding | null)?.pendingAction).toBeNull()
    await runtime.ensureReady()
    expect(starts).toEqual([null, 'session-runtime-durable-action'])
    expect(runtime.status).toBe('ready')

    binding = withPendingPlayerAction(binding!, 'stale-sheriff-delivery', {
      matchId,
      actorId: playerId,
      type: 'sheriff-action',
      action: 'keep-running',
    })
    await expect(
      runtime.takeTurn(
        {
          prompt: '提交当前投票。',
          toSequence: 2,
          visibleEvents: [],
          gameStatus: 'running',
          pausedReason: null,
          continuation: false,
        },
        { matchId, playerId, actionType: 'vote', voteKind: 'exile' },
        PhaseIdSchema.parse('phase-day-vote'),
      ),
    ).resolves.toMatchObject({ type: 'vote', targetId: 'player-3' })
    expect(binding?.pendingAction?.action).toMatchObject({ type: 'vote', targetId: 'player-3' })
    runtime.actionSettled()
    await runtime.close()
  })

  it('fails closed for unresolved, missing legacy, and mismatched resumed Session bindings', async () => {
    const creating = edgeRuntime({ binding: createPlayerSessionBinding(edgeIdentity()) })
    await expect(creating.runtime.start()).rejects.toThrow(/creation is unresolved/)
    expect(creating.runtime.status).toBe('failed')

    const activeBinding = withActivePlayerSession(
      createPlayerSessionBinding(edgeIdentity()),
      'session-edge-expected',
    )
    const mismatched = edgeRuntime({
      binding: activeBinding,
      sessionFactory: async () => edgeSession('session-edge-other'),
    })
    await expect(mismatched.runtime.start()).rejects.toThrow(/expected session-edge-expected/)
    expect(mismatched.runtime.status).toBe('failed')

    const missingLegacy = edgeRuntime({ binding: null, allowSessionCreation: false })
    await expect(missingLegacy.runtime.start()).rejects.toThrow(/no durable ACP Session binding/)
    expect(missingLegacy.runtime.status).toBe('failed')
  })

  it('skips bootstrap continuation until a dispatch has been persisted', async () => {
    const edge = edgeRuntime({ binding: null })
    await edge.runtime.start()
    expect(edge.runtime.needsBootstrap).toBe(true)
    await edge.runtime.continueBootstrap({
      prompt: 'not dispatched',
      toSequence: 1,
      visibleEvents: [],
      gameStatus: 'starting',
      pausedReason: null,
      continuation: true,
    })
    expect(edge.session.prompt).not.toHaveBeenCalled()
    await edge.runtime.close()
  })
})

function edgeIdentity() {
  const matchId = MatchIdSchema.parse('match-runtime-edge')
  const playerId = PlayerIdSchema.parse('player-1')
  const tool = AgentToolSchema.parse({
    id: 'tool-runtime-edge',
    name: 'Runtime edge tool',
    kind: 'custom',
    command: 'runtime-edge',
    args: [],
    environment: {},
    modelConfigKey: 'model',
    builtIn: false,
  })
  const profile = AgentProfileSchema.parse({
    id: 'profile-runtime-edge',
    name: 'Runtime edge profile',
    toolId: tool.id,
    model: 'edge-model',
    promptTimeoutMs: 5_000,
    connection: {},
    createdAt: '2026-08-28T00:00:00.000Z',
    updatedAt: '2026-08-28T00:00:00.000Z',
  })
  return { matchId, playerId, profile, tool }
}

function edgeSession(sessionId: string) {
  return {
    sessionId,
    connected: true,
    finishAfterAcceptedAction: vi.fn(),
    prompt: vi.fn(async () => ({ text: '', stopReason: 'end_turn' as const, updates: [] })),
    close: vi.fn(async () => undefined),
  }
}

function edgeRuntime(options: {
  binding: PlayerSessionBinding | null
  allowSessionCreation?: boolean
  sessionFactory?: ConstructorParameters<typeof PlayerRuntime>[0]['sessionFactory']
}) {
  const identity = edgeIdentity()
  let binding = options.binding
  const session = edgeSession('session-runtime-edge-created')
  const repository = {
    getDeliveryLedger: () => null,
    saveDeliveryLedger: () => undefined,
    listTrajectoryTurns: () => [],
    playerSessions: {
      get: () => binding,
      reserve: () => {
        binding = createPlayerSessionBinding(identity)
        return binding
      },
      activate: (_matchId: string, _playerId: string, sessionId: string) => {
        binding = withActivePlayerSession(binding!, sessionId)
        return binding
      },
      adopt: () => {
        throw new Error('unreachable adopt')
      },
      markBootstrap: () => binding,
      clearPendingAction: () => binding,
    },
  }
  const runtime = new PlayerRuntime({
    ...identity,
    workspace: '/tmp/agentwolf-runtime-edge',
    token: 'runtime-edge-token',
    mcpUrl: 'http://127.0.0.1:4310/mcp',
    mailbox: new ActionMailbox(),
    repository: repository as never,
    trajectory: {} as never,
    deliveryEvents: { started: vi.fn(), acknowledged: vi.fn() },
    sessionFactory: options.sessionFactory ?? (async () => session),
    ...(options.allowSessionCreation === undefined
      ? {}
      : { allowSessionCreation: options.allowSessionCreation }),
  })
  return { runtime, session }
}
