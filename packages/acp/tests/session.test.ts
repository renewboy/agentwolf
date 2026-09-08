import { AcpSession, type AcpSessionStartOptions } from '@agent-arena/acp-runtime'
import { describe, expect, it, vi } from 'vitest'
import { AcpPlayerSession } from '../src/index.js'

describe('AcpPlayerSession', () => {
  it('applies AgentWolf defaults while preserving explicit client metadata', async () => {
    const session = { sessionId: 'session-wrapper' } as AcpSession
    const start = vi.spyOn(AcpSession, 'start').mockResolvedValue(session)
    const options = {
      cwd: process.cwd(),
      launch: { command: 'test-agent', args: [], env: {} },
    } satisfies AcpSessionStartOptions

    await expect(AcpPlayerSession.start(options)).resolves.toBe(session)
    expect(start).toHaveBeenLastCalledWith({
      ...options,
      clientInfo: { name: 'agentwolf', version: '0.1.0' },
      sessionLabel: 'ACP player session',
    })

    const explicit = {
      ...options,
      clientInfo: { name: 'test-client', version: '1.2.3' },
      sessionLabel: 'test Session',
    }
    await expect(AcpPlayerSession.start(explicit)).resolves.toBe(session)
    expect(start).toHaveBeenLastCalledWith(explicit)
  })
})
