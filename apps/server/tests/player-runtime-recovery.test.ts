import { describe, expect, it, vi } from 'vitest'
import { adoptLegacyPlayerSession, terminalToolUpdate } from '../src/player-runtime-recovery.js'

describe('player runtime recovery helpers', () => {
  it('adopts the latest durable legacy Session and marks bootstrap acknowledged', () => {
    const binding = { sessionId: 'session-legacy' }
    const adopt = vi.fn(() => binding)
    const markBootstrap = vi.fn()
    const options = {
      matchId: 'match-legacy',
      playerId: 'player-1',
      profile: { id: 'profile-legacy' },
      tool: { id: 'tool-legacy' },
      repository: {
        listTrajectoryTurns: () => [
          { sessionGeneration: 1, sessionId: 'session-old' },
          { sessionGeneration: 3, sessionId: 'session-legacy' },
        ],
        playerSessions: { adopt, markBootstrap },
      },
    }

    expect(adoptLegacyPlayerSession(options as never)).toBe(binding)
    expect(adopt).toHaveBeenCalledWith({
      matchId: 'match-legacy',
      playerId: 'player-1',
      profile: options.profile,
      tool: options.tool,
      sessionGeneration: 3,
      sessionId: 'session-legacy',
    })
    expect(markBootstrap).toHaveBeenCalledWith('match-legacy', 'player-1', 'acknowledged')
  })

  it('fails closed when no prior logical Session can be adopted', () => {
    expect(() =>
      adoptLegacyPlayerSession({
        matchId: 'match-missing',
        playerId: 'player-2',
        repository: { listTrajectoryTurns: () => [] },
      } as never),
    ).toThrow(/no durable ACP Session binding/)
  })

  it('recognizes only terminal tool updates', () => {
    expect(terminalToolUpdate({ sessionUpdate: 'agent_message_chunk' } as never)).toBe(false)
    expect(terminalToolUpdate({ sessionUpdate: 'tool_call', status: 'pending' } as never)).toBe(
      false,
    )
    expect(
      terminalToolUpdate({ sessionUpdate: 'tool_call_update', status: 'completed' } as never),
    ).toBe(true)
    expect(terminalToolUpdate({ sessionUpdate: 'tool_call', status: 'failed' } as never)).toBe(true)
  })
})
