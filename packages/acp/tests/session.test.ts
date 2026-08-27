import { mkdtemp, readFile, rm } from 'node:fs/promises'
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

  it('forwards prompts larger than the guardian stdin FIFO capacity', async () => {
    const cwd = await mkdtemp(resolve(tmpdir(), 'agentwolf-acp-large-prompt-'))
    temporaryDirectories.push(cwd)
    const fixture = fileURLToPath(new URL('./fixtures/mock-agent.mjs', import.meta.url))
    const session = await AcpPlayerSession.start({
      cwd,
      launch: { command: process.execPath, args: [fixture], env: { ...process.env } },
    })

    const result = await session.prompt('x'.repeat(32 * 1024), 5_000)

    expect(result.text).toBe('你好')
    expect(result.stopReason).toBe('end_turn')
    await session.close()
  })

  it('reapplies model and reasoning when resume reports process defaults', async () => {
    const cwd = await mkdtemp(resolve(tmpdir(), 'agentwolf-acp-reasoning-'))
    temporaryDirectories.push(cwd)
    const fixture = fileURLToPath(new URL('./fixtures/mock-agent.mjs', import.meta.url))
    const launch = {
      command: process.execPath,
      args: [fixture],
      env: { ...process.env, AGENTWOLF_MOCK_RESUME_DEFAULT_CONFIG: 'true' },
    }
    const created = await AcpPlayerSession.start({
      cwd,
      launch,
      model: 'mock-model',
      reasoningEffort: 'low',
      requireSessionResume: true,
    })
    expect(
      created.configOptions.find((option) => option.category === 'thought_level'),
    ).toMatchObject({ currentValue: 'low', options: expect.any(Array) })
    const sessionId = created.sessionId
    await created.close()

    const store = JSON.parse(await readFile(resolve(cwd, '.mock-agent-sessions.json'), 'utf8')) as {
      configRequests: Array<{ configId: string; value: string }>
    }
    expect(store.configRequests).toEqual([
      { sessionId, configId: 'model', value: 'mock-model' },
      { sessionId, configId: 'reasoning_effort', value: 'low' },
    ])

    const resumed = await AcpPlayerSession.start({
      cwd,
      launch,
      model: 'mock-model',
      reasoningEffort: 'low',
      resumeSessionId: sessionId,
      requireSessionResume: true,
    })
    await resumed.close()

    const resumedStore = JSON.parse(
      await readFile(resolve(cwd, '.mock-agent-sessions.json'), 'utf8'),
    ) as {
      configRequests: Array<{ configId: string; value: string }>
    }
    expect(resumedStore.configRequests).toEqual([
      { sessionId, configId: 'model', value: 'mock-model' },
      { sessionId, configId: 'reasoning_effort', value: 'low' },
      { sessionId, configId: 'model', value: 'mock-model' },
      { sessionId, configId: 'reasoning_effort', value: 'low' },
    ])

    await expect(
      AcpPlayerSession.start({
        cwd,
        launch,
        model: 'mock-model',
        reasoningEffort: 'medium',
      }),
    ).rejects.toThrow(/does not advertise reasoning effort medium/)
  }, 15_000)

  it('leaves reasoning at the Agent default when thought_level is not advertised', async () => {
    const cwd = await mkdtemp(resolve(tmpdir(), 'agentwolf-acp-default-reasoning-'))
    temporaryDirectories.push(cwd)
    const fixture = fileURLToPath(new URL('./fixtures/mock-agent.mjs', import.meta.url))
    const session = await AcpPlayerSession.start({
      cwd,
      launch: {
        command: process.execPath,
        args: [fixture],
        env: { ...process.env, AGENTWOLF_MOCK_DISABLE_REASONING: 'true' },
      },
      model: 'mock-model',
    })
    expect(session.configOptions.some((option) => option.category === 'thought_level')).toBe(false)
    await session.close()
  })

  it('resumes one durable Session ID in a new ACP process without session/new', async () => {
    const cwd = await mkdtemp(resolve(tmpdir(), 'agentwolf-acp-resume-'))
    temporaryDirectories.push(cwd)
    const fixture = fileURLToPath(new URL('./fixtures/mock-agent.mjs', import.meta.url))
    const launch = { command: process.execPath, args: [fixture], env: { ...process.env } }
    const created = await AcpPlayerSession.start({
      cwd,
      launch,
      model: 'mock-model',
      requireSessionResume: true,
    })
    const sessionId = created.sessionId
    expect((await created.prompt('开始', 5_000)).text).toBe('你好')
    await created.close()

    const resumed = await AcpPlayerSession.start({
      cwd,
      launch,
      resumeSessionId: sessionId,
      requireSessionResume: true,
      mcpServers: [
        {
          type: 'http',
          name: 'agentwolf-player-actions',
          url: 'http://127.0.0.1:4310/mcp',
          headers: [],
        },
      ],
    })
    expect(resumed.sessionId).toBe(sessionId)
    expect((await resumed.prompt('继续当前阶段', 5_000)).text).toBe('你好')
    await resumed.close()

    const store = JSON.parse(await readFile(resolve(cwd, '.mock-agent-sessions.json'), 'utf8')) as {
      newCount: number
      resumeCount: number
      lastResumeMcpServers: string[]
    }
    expect(store).toMatchObject({
      newCount: 1,
      resumeCount: 1,
      lastResumeMcpServers: ['agentwolf-player-actions'],
    })
  })

  it('fails before session/new when a Match player Agent cannot resume Sessions', async () => {
    const cwd = await mkdtemp(resolve(tmpdir(), 'agentwolf-acp-no-resume-'))
    temporaryDirectories.push(cwd)
    const fixture = fileURLToPath(new URL('./fixtures/mock-agent.mjs', import.meta.url))
    await expect(
      AcpPlayerSession.start({
        cwd,
        launch: {
          command: process.execPath,
          args: [fixture],
          env: { ...process.env, AGENTWOLF_MOCK_DISABLE_RESUME: 'true' },
        },
        requireSessionResume: true,
      }),
    ).rejects.toThrow('Unable to start ACP player session')
    await expect(readFile(resolve(cwd, '.mock-agent-sessions.json'), 'utf8')).rejects.toThrow()
  })

  it('does not create a Session when the persisted resume ID is unknown', async () => {
    const cwd = await mkdtemp(resolve(tmpdir(), 'agentwolf-acp-unknown-resume-'))
    temporaryDirectories.push(cwd)
    const fixture = fileURLToPath(new URL('./fixtures/mock-agent.mjs', import.meta.url))
    await expect(
      AcpPlayerSession.start({
        cwd,
        launch: { command: process.execPath, args: [fixture], env: { ...process.env } },
        resumeSessionId: 'mock-session-missing',
        requireSessionResume: true,
      }),
    ).rejects.toThrow('Unable to start ACP player session')
    await expect(readFile(resolve(cwd, '.mock-agent-sessions.json'), 'utf8')).rejects.toThrow()
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

  it('bounds a protocol close that never settles', async () => {
    const cwd = await mkdtemp(resolve(tmpdir(), 'agentwolf-acp-hung-close-'))
    temporaryDirectories.push(cwd)
    const fixture = fileURLToPath(new URL('./fixtures/mock-agent.mjs', import.meta.url))
    const session = await AcpPlayerSession.start({
      cwd,
      launch: {
        command: process.execPath,
        args: [fixture],
        env: { ...process.env, AGENTWOLF_MOCK_CLOSE_HANG: 'true' },
      },
    })

    const startedAt = Date.now()
    await session.close()
    expect(Date.now() - startedAt).toBeLessThan(3_000)
  }, 5_000)
})
