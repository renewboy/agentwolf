import {
  AgentProfileIdSchema,
  AgentProfileSchema,
  BoardIdSchema,
  MatchIdSchema,
  MatchSetupSnapshotSchema,
  PlayerActionSchema,
  PlayerIdSchema,
} from '@agentwolf/contracts'
import {
  DecisionIdSchema,
  GameActionSchema,
  MatchIdSchema as CoreMatchIdSchema,
  ParticipantIdSchema,
} from '@agent-arena/contracts'
import { builtInAgentTools } from '@agentwolf/acp'
import { afterEach, describe, expect, it } from 'vitest'
import { AgentWolfSessionBindingStore } from '../src/arena-session-store.js'
import { SqliteRepository } from '../src/repository.js'

const repositories: SqliteRepository[] = []

afterEach(() => {
  for (const repository of repositories.splice(0)) repository.close()
})

describe('AgentWolf Core SessionBindingStore adapter', () => {
  it('maps lifecycle state and preserves product pending actions idempotently', () => {
    const repository = testRepository()
    const adapter = new AgentWolfSessionBindingStore(repository)
    const matchId = MatchIdSchema.parse('match-arena-session')
    const playerId = PlayerIdSchema.parse('player-1')
    const coreMatchId = CoreMatchIdSchema.parse(matchId)
    const participantId = ParticipantIdSchema.parse(playerId)
    expect(adapter.get(coreMatchId, participantId)).toBeNull()

    const profile = AgentProfileSchema.parse({
      id: AgentProfileIdSchema.parse('profile-arena-session'),
      name: 'Arena Session',
      toolId: 'tool-codex',
      model: 'test-model',
      reasoningEffort: 'low',
      promptTimeoutMs: 60_000,
      connection: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    const tool = builtInAgentTools().find((entry) => entry.id === 'tool-codex')!
    repository.playerSessions.reserve({ matchId, playerId, profile, tool })
    const creating = adapter.get(coreMatchId, participantId)!
    expect(creating).toMatchObject({ state: 'creating', bootstrapState: 'pending' })
    const active = adapter.put({
      ...creating,
      state: 'active',
      sessionId: 'session-arena',
      bootstrapState: 'acknowledged',
    })
    expect(active).toMatchObject({
      state: 'active',
      sessionId: 'session-arena',
      bootstrapState: 'acknowledged',
    })

    const decisionId = DecisionIdSchema.parse('decision-arena-session')
    const playerAction = PlayerActionSchema.parse({
      type: 'vote',
      matchId,
      actorId: playerId,
      kind: 'exile',
      targetId: null,
    })
    const coreAction = GameActionSchema.parse({
      matchId: coreMatchId,
      decisionId,
      actorId: participantId,
      actionType: 'vote',
      payload: playerAction,
    })
    expect(
      adapter.savePendingAction(coreMatchId, participantId, decisionId, coreAction).pendingAction,
    ).toMatchObject({ decisionId, action: coreAction })
    expect(
      adapter.savePendingAction(coreMatchId, participantId, decisionId, coreAction).pendingAction,
    ).not.toBeNull()
    expect(adapter.clearPendingAction(coreMatchId, participantId).pendingAction).toBeNull()

    repository.playerSessions.savePendingAction(matchId, playerId, 'delivery-legacy', playerAction)
    const legacy = adapter.get(coreMatchId, participantId)!
    expect(legacy.pendingAction?.decisionId).toBe('delivery-legacy')
    expect(adapter.put({ ...legacy, pendingAction: null }).pendingAction).toBeNull()
    expect(() => adapter.deleteMatch()).toThrow(/MatchManager owns/)
  })

  it('rejects provisioning and pending actions for missing product bindings', () => {
    const repository = testRepository()
    const adapter = new AgentWolfSessionBindingStore(repository)
    const matchId = CoreMatchIdSchema.parse('match-arena-session')
    const participantId = ParticipantIdSchema.parse('player-1')
    expect(() =>
      adapter.put({
        matchId,
        participantId,
        state: 'creating',
        sessionId: null,
        sessionGeneration: 1,
        bootstrapState: 'pending',
        pendingAction: null,
      }),
    ).toThrow(/provisions Session bindings/)
    expect(() =>
      adapter.savePendingAction(
        matchId,
        participantId,
        DecisionIdSchema.parse('decision-missing'),
        GameActionSchema.parse({
          matchId,
          decisionId: 'decision-missing',
          actorId: participantId,
          actionType: 'vote',
          payload: {
            type: 'vote',
            matchId,
            actorId: participantId,
            kind: 'exile',
            targetId: null,
          },
        }),
      ),
    ).toThrow(/Missing Player Session binding/)
  })
})

function testRepository(): SqliteRepository {
  const repository = new SqliteRepository(':memory:')
  repositories.push(repository)
  const seats = Array.from({ length: 6 }, (_, index) => ({
    seat: index + 1,
    name: `Player ${index + 1}`,
    profileId: AgentProfileIdSchema.parse(`profile-test-${index + 1}`),
    character: null,
  }))
  repository.createMatch(
    {
      id: MatchIdSchema.parse('match-arena-session'),
      boardId: BoardIdSchema.parse('board-quick-6'),
      status: 'draft',
      setup: MatchSetupSnapshotSchema.parse({
        boardId: 'board-quick-6',
        roleAssignment: 'random',
        seats,
        speechCharacterLimit: 300,
        publicSpeechInterruptMode: 'legacy',
      }),
      boardSnapshot: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      pausedReason: null,
    },
    [],
  )
  return repository
}
