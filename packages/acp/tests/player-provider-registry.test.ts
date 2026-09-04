import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AgentToolIdSchema, AgentToolSchema } from '@agentwolf/contracts'
import { describe, expect, it } from 'vitest'
import {
  AcpPlayerSession,
  canonicalPlayerWorkspace,
  cleanupPlayerProviderResources,
  deletePlayerProviderSession,
  deletePlayerProviderSessions,
  definePlayerProvider,
  noPlayerProviderState,
  PlayerProviderRegistry,
  preparePlayerProviderSession,
  type PlayerProviderAdapter,
  type PlayerProviderSelector,
} from '../src/index.js'

const customTool = AgentToolSchema.parse({
  id: 'tool-custom-player',
  name: 'Custom player',
  kind: 'custom',
  command: 'custom-agent',
  args: [],
  environment: {},
  modelConfigKey: 'model',
  builtIn: false,
})

describe('PlayerProviderRegistry', () => {
  it('lets an exact Tool adapter extend player isolation without changing the coordinator', async () => {
    const workspace = await mkdtemp(resolve(tmpdir(), 'agentwolf-custom-provider-'))
    const kindAdapter = adapter('custom-kind', { type: 'kind', kind: 'custom' }, 'kind')
    const cleaned: string[] = []
    const exactAdapter = {
      ...adapter('custom-exact', { type: 'tool', toolId: customTool.id }, 'exact'),
      workspace: {
        ...canonicalPlayerWorkspace,
        lifecycle: {
          key: 'custom-exact-workspace',
          cleanup: (context) => {
            cleaned.push(context.canonicalWorkspace)
            return Promise.resolve()
          },
        },
      },
    } satisfies PlayerProviderAdapter
    const registry = new PlayerProviderRegistry([kindAdapter, exactAdapter])

    expect(registry.resolve(customTool)).toBe(exactAdapter)
    expect(registry.list()).toEqual([kindAdapter, exactAdapter])
    expect(registry.workspaceLifecycles()).toEqual([
      canonicalPlayerWorkspace.lifecycle,
      exactAdapter.workspace.lifecycle,
    ])
    try {
      await expect(
        preparePlayerProviderSession({
          tool: customTool,
          workspace,
          modelInstructions: 'PLAYER FOUNDATION',
          registry,
        }),
      ).resolves.toMatchObject({
        providerId: 'custom-exact',
        cwd: workspace,
        launch: { args: ['--player-adapter', 'exact'] },
        sessionMeta: { adapter: 'exact', modelInstructions: 'PLAYER FOUNDATION' },
      })
      await cleanupPlayerProviderResources(workspace, { registry })
      expect(cleaned).toEqual([workspace])
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it('rejects duplicate adapter identities and selectors', () => {
    const kind = adapter('kind-a', { type: 'kind', kind: 'custom' }, 'kind-a')
    const sameKind = adapter('kind-b', { type: 'kind', kind: 'custom' }, 'kind-b')
    const toolId = AgentToolIdSchema.parse('tool-custom-player')
    const exact = adapter('tool-a', { type: 'tool', toolId }, 'tool-a')
    const sameTool = adapter('tool-b', { type: 'tool', toolId }, 'tool-b')

    expect(() => new PlayerProviderRegistry([kind, { ...sameKind, id: kind.id }])).toThrow(
      /Duplicate player Provider adapter/,
    )
    expect(() => new PlayerProviderRegistry([kind, sameKind])).toThrow(
      /Duplicate player Provider kind/,
    )
    expect(() => new PlayerProviderRegistry([exact, sameTool])).toThrow(
      /Duplicate player Provider Tool/,
    )
    expect(
      () =>
        new PlayerProviderRegistry([
          kind,
          {
            ...exact,
            workspace: {
              ...exact.workspace,
              lifecycle: {
                key: canonicalPlayerWorkspace.lifecycle.key,
                cleanup: () => Promise.resolve(),
              },
            },
          },
        ]),
    ).toThrow(/Conflicting player workspace lifecycle/)
    expect(() => new PlayerProviderRegistry([]).resolve(customTool)).toThrow(
      /no verified player Provider adapter/,
    )
    expect(
      () =>
        new PlayerProviderRegistry([
          {
            ...kind,
            session: { ...kind.session, deletion: 'owned-state' },
          },
        ]),
    ).toThrow(/has no owned Session storage to delete/)
  })

  it('uses ACP session/delete for a protocol-backed Provider Session', async () => {
    const workspace = await mkdtemp(resolve(tmpdir(), 'agentwolf-provider-delete-'))
    const fixture = fileURLToPath(new URL('./fixtures/mock-agent.mjs', import.meta.url))
    const tool = AgentToolSchema.parse({
      ...customTool,
      id: 'tool-protocol-delete',
      command: process.execPath,
      args: [fixture],
    })
    const protocolAdapter = definePlayerProvider({
      id: 'protocol-delete',
      selector: { type: 'tool', toolId: tool.id },
      workspace: canonicalPlayerWorkspace,
      state: noPlayerProviderState,
      session: {
        approvedToolNames: [],
        deletion: 'protocol',
        mcpTransport: 'session',
        resume: 'advertised',
        permissions: 'declared',
        metadata: () => ({}),
      },
      launch: (context) => context.launch,
    })
    const registry = new PlayerProviderRegistry([protocolAdapter])
    try {
      const session = await AcpPlayerSession.start({
        cwd: workspace,
        launch: { command: process.execPath, args: [fixture], env: { ...process.env } },
      })
      const sessionId = session.sessionId
      await session.close()

      await expect(
        deletePlayerProviderSession({ tool, workspace, sessionId, registry }),
      ).resolves.toBe('protocol-deleted')
      const store = JSON.parse(
        await readFile(resolve(workspace, '.mock-agent-sessions.json'), 'utf8'),
      ) as { sessions: string[]; deleteCount: number }
      expect(store).toMatchObject({ sessions: [], deleteCount: 1 })
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it('requires protocol deletion unless the Provider owns its complete Session state', async () => {
    const workspace = await mkdtemp(resolve(tmpdir(), 'agentwolf-provider-delete-policy-'))
    const fixture = fileURLToPath(new URL('./fixtures/mock-agent.mjs', import.meta.url))
    const unsupportedTool = AgentToolSchema.parse({
      ...customTool,
      id: 'tool-protocol-delete-unsupported',
      command: process.execPath,
      args: [fixture],
      environment: {
        AGENTWOLF_MOCK_DISABLE_DELETE: {
          source: 'literal',
          value: 'true',
          secret: false,
        },
      },
    })
    const unsupported = {
      ...adapter(
        'protocol-delete-unsupported',
        { type: 'tool', toolId: unsupportedTool.id },
        'unsupported',
      ),
      launch: (context: Parameters<PlayerProviderAdapter['launch']>[0]) => context.launch,
    } satisfies PlayerProviderAdapter
    let cleanupCount = 0
    const ownedState = {
      key: 'owned-test-session-state',
      ownsSessionStorage: true,
      environment: () => ({}),
      prepare: () => Promise.resolve(),
      cleanup: () => {
        cleanupCount += 1
        return Promise.resolve()
      },
      deleteHostSessions: () => Promise.resolve(),
    }
    const owned = {
      ...unsupported,
      id: 'protocol-delete-owned-state',
      state: ownedState,
    } satisfies PlayerProviderAdapter
    try {
      await expect(
        deletePlayerProviderSession({
          tool: unsupportedTool,
          workspace,
          sessionId: 'session-unsupported',
          registry: new PlayerProviderRegistry([unsupported]),
        }),
      ).rejects.toThrow(/does not support session\/delete/)
      await expect(
        deletePlayerProviderSession({
          tool: unsupportedTool,
          workspace,
          sessionId: 'session-owned',
          registry: new PlayerProviderRegistry([owned]),
        }),
      ).resolves.toBe('owned-state-deleted')

      const mismatchedTool = AgentToolSchema.parse({
        ...unsupportedTool,
        id: 'tool-protocol-delete-failure',
        environment: {
          AGENTWOLF_MOCK_PROTOCOL_MISMATCH: {
            source: 'literal',
            value: 'true',
            secret: false,
          },
        },
      })
      const mismatched = {
        ...owned,
        id: 'protocol-delete-failure',
        selector: { type: 'tool', toolId: mismatchedTool.id } as const,
      } satisfies PlayerProviderAdapter
      await expect(
        deletePlayerProviderSession({
          tool: mismatchedTool,
          workspace,
          sessionId: 'session-failure',
          registry: new PlayerProviderRegistry([mismatched]),
        }),
      ).resolves.toBe('owned-state-deleted')
      expect(cleanupCount).toBe(2)
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it('batches host-store deletion for Sessions sharing one Provider state policy', async () => {
    const roots = [
      await mkdtemp(resolve(tmpdir(), 'agentwolf-provider-delete-batch-a-')),
      await mkdtemp(resolve(tmpdir(), 'agentwolf-provider-delete-batch-b-')),
    ]
    let ownedCleanupCount = 0
    const hostBatches: string[][] = []
    const state = {
      key: 'batched-host-state',
      ownsSessionStorage: true,
      environment: () => ({}),
      prepare: () => Promise.resolve(),
      cleanup: () => {
        ownedCleanupCount += 1
        return Promise.resolve()
      },
      deleteHostSessions: (contexts: readonly { sessionId: string }[]) => {
        hostBatches.push(contexts.map((context) => context.sessionId))
        return Promise.resolve()
      },
    }
    const base = adapter('batched-host', { type: 'kind', kind: 'custom' }, 'batched')
    const batched = {
      ...base,
      state,
      session: { ...base.session, deletion: 'owned-state' as const },
    } satisfies PlayerProviderAdapter
    const registry = new PlayerProviderRegistry([batched])
    try {
      await expect(
        deletePlayerProviderSessions(
          roots.map((workspace, index) => ({
            tool: customTool,
            workspace,
            sessionId: `session-batch-${index + 1}`,
            registry,
          })),
        ),
      ).resolves.toEqual(['owned-state-deleted', 'owned-state-deleted'])
      expect(ownedCleanupCount).toBe(2)
      expect(hostBatches).toEqual([['session-batch-1', 'session-batch-2']])
    } finally {
      await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })))
    }
  })
})

function adapter(
  id: string,
  selector: PlayerProviderSelector,
  marker: string,
): PlayerProviderAdapter {
  return definePlayerProvider({
    id,
    selector,
    workspace: canonicalPlayerWorkspace,
    state: noPlayerProviderState,
    session: {
      approvedToolNames: [],
      deletion: 'protocol',
      mcpTransport: 'session',
      resume: 'advertised',
      permissions: 'declared',
      metadata: (modelInstructions) => ({ adapter: marker, modelInstructions }),
    },
    launch: (context) => ({
      ...context.launch,
      args: [...context.launch.args, '--player-adapter', marker],
    }),
  })
}
