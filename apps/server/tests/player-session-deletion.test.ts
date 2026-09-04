import { AgentToolSchema, MatchIdSchema, PlayerIdSchema } from '@agentwolf/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  deletePlayerProviderSessions: vi.fn(),
}))

vi.mock('@agentwolf/acp', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agentwolf/acp')>()),
  deletePlayerProviderSessions: mocks.deletePlayerProviderSessions,
}))

import { defaultPlayerSessionDeleter } from '../src/player-session-deletion.js'

describe('Player Session deletion', () => {
  beforeEach(() => {
    mocks.deletePlayerProviderSessions.mockReset()
    mocks.deletePlayerProviderSessions.mockResolvedValue(['protocol-deleted'])
  })

  it('delegates the frozen Tool, workspace, and Session ID to the Provider owner', async () => {
    const tool = AgentToolSchema.parse({
      id: 'tool-session-delete',
      name: 'Session delete',
      kind: 'custom',
      command: 'session-delete',
      args: [],
      environment: {},
      modelConfigKey: 'model',
      builtIn: false,
    })

    await defaultPlayerSessionDeleter([
      {
        cwd: '/runtime/match/player-1',
        tool,
        sessionId: 'session-delete-1',
        matchId: MatchIdSchema.parse('match-session-delete'),
        playerId: PlayerIdSchema.parse('player-1'),
      },
    ])

    expect(mocks.deletePlayerProviderSessions).toHaveBeenCalledWith([
      {
        tool,
        workspace: '/runtime/match/player-1',
        sessionId: 'session-delete-1',
      },
    ])
  })
})
