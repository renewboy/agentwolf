import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AgentProfileIdSchema,
  AgentToolIdSchema,
  MatchIdSchema,
  PlayerIdSchema,
  type AgentProfile,
  type AgentTool,
} from '@agentwolf/contracts'

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  resolveLaunch: vi.fn(),
  playerContract: vi.fn(() => 'contract'),
  tool: vi.fn((name: string) => ({ title: `Title ${name}` })),
}))

vi.mock('@agentwolf/acp', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agentwolf/acp')>()),
  AcpPlayerSession: { start: mocks.start },
  resolvePlayerLaunchSpec: mocks.resolveLaunch,
  playerSessionMeta: vi.fn((kind: string, contract: string) => ({ kind, contract })),
  playerApprovedToolNames: vi.fn((kind: string) => [`approved-${kind}`]),
  playerActionToolNames: ['submit_vote', 'submit_night_action'],
}))

vi.mock('@agentwolf/assets/prompts', () => ({
  loadPromptCore: () => ({ playerContract: mocks.playerContract, tool: mocks.tool }),
}))

import { defaultPlayerSessionFactory } from '../src/player-session-factory.js'

const tool = {
  id: AgentToolIdSchema.parse('tool-custom'),
  name: 'Custom',
  kind: 'custom',
  command: 'agent',
  args: [],
  environment: {},
  initialMode: 'read-only',
  modelConfigKey: 'model-key',
  builtIn: false,
} as AgentTool
const profile = {
  id: AgentProfileIdSchema.parse('profile-custom'),
  name: 'Profile',
  toolId: tool.id,
  model: 'model-a',
  reasoningEffort: 'high',
  mode: 'profile-mode',
  promptTimeoutMs: 5000,
  connection: {},
  createdAt: '2026-08-28T00:00:00.000Z',
  updatedAt: '2026-08-28T00:00:00.000Z',
} as AgentProfile

beforeEach(() => {
  mocks.start.mockReset()
  mocks.resolveLaunch.mockReset()
  mocks.playerContract.mockClear()
  mocks.tool.mockClear()
  mocks.resolveLaunch.mockReturnValue({ command: 'agent', args: [], env: {} })
  mocks.start.mockResolvedValue({ sessionId: 'session-1', connected: true })
})

describe('defaultPlayerSessionFactory', () => {
  it('starts a fully configured resumable custom Agent session', async () => {
    const onStderr = vi.fn()
    const onPermissionDecision = vi.fn()
    const mcpServer = { name: 'mcp' } as never
    await expect(
      defaultPlayerSessionFactory({
        cwd: '/tmp/player',
        tool,
        profile,
        mcpServer,
        matchId: MatchIdSchema.parse('match-session-factory'),
        playerId: PlayerIdSchema.parse('player-1'),
        resumeSessionId: 'session-old',
        onStderr,
        onPermissionDecision,
      }),
    ).resolves.toMatchObject({ sessionId: 'session-1' })
    expect(mocks.resolveLaunch).toHaveBeenCalledWith(tool, '/tmp/player')
    expect(mocks.start).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/tmp/player',
        model: 'model-a',
        modelConfigKey: 'model-key',
        reasoningEffort: 'high',
        mode: 'profile-mode',
        mcpServers: [mcpServer],
        requireSessionResume: true,
        resumeSessionId: 'session-old',
        allowOpaqueMcpPermissions: false,
        approvedToolNames: ['approved-custom'],
        onStderr,
        onPermissionDecision,
      }),
    )
    expect(mocks.start.mock.calls[0]![0].approvedMcpTools).toEqual([
      {
        server: 'agentwolf-player-actions',
        tool: 'submit_vote',
        title: 'Title submit_vote',
      },
      {
        server: 'agentwolf-player-actions',
        tool: 'submit_night_action',
        title: 'Title submit_night_action',
      },
    ])
    expect(mocks.start.mock.calls[0]![0].sessionMeta).toMatchObject({
      kind: 'custom',
      contract: 'contract',
      agentwolf: { matchId: 'match-session-factory', playerId: 'player-1' },
    })
  })

  it('falls back to the Tool mode and enables opaque Codex permissions without optionals', async () => {
    const codexTool = { ...tool, kind: 'codex' as const, initialMode: 'tool-mode' }
    const minimalProfile = {
      ...profile,
      mode: undefined,
      reasoningEffort: undefined,
    } as AgentProfile
    await defaultPlayerSessionFactory({
      cwd: '/tmp/codex',
      tool: codexTool,
      profile: minimalProfile,
      mcpServer: {} as never,
      matchId: MatchIdSchema.parse('match-session-codex'),
      playerId: PlayerIdSchema.parse('player-2'),
    })
    const options = mocks.start.mock.calls[0]![0]
    expect(options).toMatchObject({ mode: 'tool-mode', allowOpaqueMcpPermissions: true })
    expect(options).not.toHaveProperty('reasoningEffort')
    expect(options).not.toHaveProperty('resumeSessionId')
    expect(options).not.toHaveProperty('onStderr')
    expect(options).not.toHaveProperty('onPermissionDecision')
  })

  it('omits mode when neither Profile nor Tool supplies one and propagates startup failure', async () => {
    mocks.start.mockRejectedValueOnce(new Error('start failed'))
    await expect(
      defaultPlayerSessionFactory({
        cwd: '/tmp/none',
        tool: { ...tool, initialMode: undefined } as AgentTool,
        profile: { ...profile, mode: undefined, reasoningEffort: undefined } as AgentProfile,
        mcpServer: {} as never,
        matchId: MatchIdSchema.parse('match-session-none'),
        playerId: PlayerIdSchema.parse('player-3'),
      }),
    ).rejects.toThrow('start failed')
    expect(mocks.start.mock.calls[0]![0]).not.toHaveProperty('mode')
  })
})
