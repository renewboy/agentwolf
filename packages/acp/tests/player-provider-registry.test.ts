import { AgentToolIdSchema, AgentToolSchema } from '@agentwolf/contracts'
import { describe, expect, it } from 'vitest'
import {
  canonicalPlayerWorkspace,
  cleanupPlayerProviderWorkspaces,
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
    await expect(
      preparePlayerProviderSession({
        tool: customTool,
        workspace: '/runtime/custom-player',
        playerContract: 'PLAYER CONTRACT',
        registry,
      }),
    ).resolves.toMatchObject({
      providerId: 'custom-exact',
      cwd: '/runtime/custom-player',
      launch: { args: ['--player-adapter', 'exact'] },
      sessionMeta: { adapter: 'exact', playerContract: 'PLAYER CONTRACT' },
    })
    await cleanupPlayerProviderWorkspaces('/runtime/custom-player', { registry })
    expect(cleaned).toEqual(['/runtime/custom-player'])
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
      mcpTransport: 'session',
      resume: 'advertised',
      permissions: 'declared',
      metadata: (playerContract) => ({ adapter: marker, playerContract }),
    },
    launch: (context) => ({
      ...context.launch,
      args: [...context.launch.args, '--player-adapter', marker],
    }),
  })
}
