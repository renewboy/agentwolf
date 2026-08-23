import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { AcpPlayerSession } from '../src/index.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })))
})

describe('AcpPlayerSession', () => {
  it('keeps one session and streams message chunks through a real stdio connection', async () => {
    const cwd = await mkdtemp(resolve(tmpdir(), 'agentwolf-acp-'))
    temporaryDirectories.push(cwd)
    const fixture = fileURLToPath(new URL('./fixtures/mock-agent.mjs', import.meta.url))
    const session = await AcpPlayerSession.start({
      cwd,
      launch: { command: process.execPath, args: [fixture], env: { ...process.env } },
      model: 'mock-model',
      mode: 'read-only',
    })
    const chunks: string[] = []
    const result = await session.prompt('开始', 5_000, {
      onTextChunk: (chunk) => chunks.push(chunk),
    })

    expect(session.sessionId).toBe('mock-session-1')
    expect(session.initializeResponse.agentInfo?.name).toBe('agentwolf-mock')
    expect(chunks).toEqual(['你', '好'])
    expect(result.text).toBe('你好')
    expect(result.stopReason).toBe('end_turn')
    await session.close()
  })

  it('approves only explicitly whitelisted AgentWolf action tools', async () => {
    const cwd = await mkdtemp(resolve(tmpdir(), 'agentwolf-acp-permission-'))
    temporaryDirectories.push(cwd)
    const fixture = fileURLToPath(new URL('./fixtures/mock-agent.mjs', import.meta.url))
    const session = await AcpPlayerSession.start({
      cwd,
      launch: { command: process.execPath, args: [fixture], env: { ...process.env } },
      model: 'mock-model',
      approvedMcpTools: [
        { server: 'agentwolf-player-actions', tool: 'submit_vote', title: '提交投票' },
      ],
    })
    expect((await session.prompt('permission-check', 5_000)).text).toBe('permission-allow')
    expect((await session.prompt('permission-check-codex', 5_000)).text).toBe(
      'permission-cancelled',
    )
    await session.close()

    const codex = await AcpPlayerSession.start({
      cwd,
      launch: { command: process.execPath, args: [fixture], env: { ...process.env } },
      model: 'mock-model',
      approvedMcpTools: [
        { server: 'agentwolf-player-actions', tool: 'submit_vote', title: '提交投票' },
      ],
      allowOpaqueMcpPermissions: true,
    })
    expect((await codex.prompt('permission-check-codex', 5_000)).text).toBe('permission-allow')
    await codex.close()

    const denied = await AcpPlayerSession.start({
      cwd,
      launch: { command: process.execPath, args: [fixture], env: { ...process.env } },
      model: 'mock-model',
    })
    expect((await denied.prompt('permission-check', 5_000)).text).toBe('permission-cancelled')
    expect((await denied.prompt('permission-check-codex', 5_000)).text).toBe('permission-cancelled')
    await denied.close()
  })
})
