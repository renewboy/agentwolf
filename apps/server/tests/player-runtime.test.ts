import {
  AgentProfileSchema,
  AgentToolSchema,
  MatchIdSchema,
  PlayerIdSchema,
} from '@agentwolf/contracts'
import type { AcpPromptResult } from '@agentwolf/acp'
import { describe, expect, it } from 'vitest'
import { ActionMailbox } from '../src/action-mailbox.js'
import { PlayerRuntime, type PlayerRuntimeStatus } from '../src/player-runtime.js'
import type { SqliteRepository } from '../src/repository.js'

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
    const repository = {
      getDeliveryLedger: () => null,
      saveDeliveryLedger: () => undefined,
    } as unknown as SqliteRepository
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
      deliveryEvents: {
        started: () => undefined,
        acknowledged: () => undefined,
      },
      sessionFactory: async () => ({
        sessionId: 'session-runtime-submitted',
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
})
