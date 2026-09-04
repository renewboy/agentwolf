import { resolve } from 'node:path'
import { deleteAcpSession } from '@agent-arena/acp-runtime'
import type { McpServer } from '@agentclientprotocol/sdk'
import type { AgentTool } from '@agentwolf/contracts'
import {
  type PlayerModelInstructions,
  type PlayerProviderAdapter,
  type PlayerProviderHostSessionDeletionContext,
  type PlayerProviderIsolationOptions,
  PlayerProviderRegistry,
} from './player-provider-contracts.js'
import { playerModelInstructionsPath, preparePlayerModelInstructions } from './player-isolation.js'
import { defaultPlayerProviderRegistry } from './player-providers/registry.js'
import { resolveLaunchSpec, type ProcessLaunchSpec } from './tool-catalog.js'

export * from './player-provider-contracts.js'

export interface PlayerProviderResolutionOptions {
  readonly registry?: PlayerProviderRegistry
  readonly isolation?: PlayerProviderIsolationOptions
}

export interface PreparePlayerProviderSessionOptions extends PlayerProviderResolutionOptions {
  readonly tool: AgentTool
  readonly workspace: string
  readonly mcpServers?: readonly McpServer[]
  readonly modelInstructions: string
}

export interface PreparedPlayerProviderSession {
  readonly providerId: string
  readonly modelInstructions: string
  readonly cwd: string
  readonly launch: ProcessLaunchSpec
  readonly mcpServers: readonly McpServer[]
  readonly sessionMeta: Readonly<Record<string, unknown>>
  readonly approvedToolNames: readonly string[]
  readonly verifyUnadvertisedSessionResume: boolean
  readonly allowOpaqueMcpPermissions: boolean
}

export interface DeletePlayerProviderSessionOptions extends PlayerProviderResolutionOptions {
  readonly tool: AgentTool
  readonly workspace: string
  readonly sessionId: string
}

export type PlayerProviderSessionDeletionResult =
  | 'protocol-deleted'
  | 'already-absent'
  | 'owned-state-deleted'

export async function preparePlayerProviderSession(
  options: PreparePlayerProviderSessionOptions,
): Promise<PreparedPlayerProviderSession> {
  const canonicalWorkspace = resolve(options.workspace)
  const modelInstructions = await preparePlayerModelInstructions(
    canonicalWorkspace,
    options.modelInstructions,
  )
  const resolution = resolveProvider(options.tool, canonicalWorkspace, options, modelInstructions)
  await resolution.adapter.workspace.prepare({
    ...resolution.context,
    runtimeWorkspace: resolution.runtimeWorkspace,
  })
  await resolution.adapter.state.prepare(resolution.context)
  const mcpServers = options.mcpServers ?? []
  return {
    providerId: resolution.adapter.id,
    modelInstructions: modelInstructions.text,
    cwd: resolution.runtimeWorkspace,
    launch: buildPlayerLaunch(resolution, mcpServers),
    mcpServers: resolution.adapter.session.mcpTransport === 'session' ? mcpServers : [],
    sessionMeta: resolution.adapter.session.metadata(modelInstructions.text),
    approvedToolNames: resolution.adapter.session.approvedToolNames,
    verifyUnadvertisedSessionResume: resolution.adapter.session.resume === 'verify',
    allowOpaqueMcpPermissions: resolution.adapter.session.permissions === 'opaque-mcp',
  }
}

export async function deletePlayerProviderSession(
  options: DeletePlayerProviderSessionOptions,
): Promise<PlayerProviderSessionDeletionResult> {
  return (await deletePlayerProviderSessions([options]))[0]!
}

export async function deletePlayerProviderSessions(
  options: readonly DeletePlayerProviderSessionOptions[],
): Promise<readonly PlayerProviderSessionDeletionResult[]> {
  const resolved = options.map((option) => {
    const canonicalWorkspace = resolve(option.workspace)
    return {
      option,
      resolution: resolveProvider(option.tool, canonicalWorkspace, option, {
        path: playerModelInstructionsPath(canonicalWorkspace),
        text: '',
      }),
    }
  })
  const results: PlayerProviderSessionDeletionResult[] = []
  const hostDeletions = new Map<
    PlayerProviderAdapter['state'],
    PlayerProviderHostSessionDeletionContext[]
  >()
  for (const { option, resolution } of resolved) {
    results.push(await deleteResolvedPlayerProviderSession(option.sessionId, resolution))
    const contexts = hostDeletions.get(resolution.adapter.state) ?? []
    contexts.push({
      ...resolution.context,
      runtimeWorkspace: resolution.runtimeWorkspace,
      sessionId: option.sessionId,
    })
    hostDeletions.set(resolution.adapter.state, contexts)
  }
  for (const [state, contexts] of hostDeletions) await state.deleteHostSessions(contexts)
  return results
}

async function deleteResolvedPlayerProviderSession(
  sessionId: string,
  resolution: ResolvedProvider,
): Promise<PlayerProviderSessionDeletionResult> {
  if (resolution.adapter.session.deletion === 'owned-state') {
    await resolution.adapter.state.cleanup(resolution.context)
    return 'owned-state-deleted'
  }
  await resolution.adapter.workspace.prepare({
    ...resolution.context,
    runtimeWorkspace: resolution.runtimeWorkspace,
  })
  await resolution.adapter.state.prepare(resolution.context)
  try {
    const result = await deleteAcpSession({
      cwd: resolution.runtimeWorkspace,
      launch: buildPlayerLaunch(resolution, []),
      sessionId,
      clientInfo: { name: 'agentwolf', version: '0.1.0' },
      sessionLabel: `player Session ${sessionId}`,
    })
    if (result === 'unsupported') {
      if (!resolution.adapter.state.ownsSessionStorage) {
        throw new Error(`Player Provider ${resolution.adapter.id} does not support session/delete`)
      }
      await resolution.adapter.state.cleanup(resolution.context)
      return 'owned-state-deleted'
    }
    await resolution.adapter.state.cleanup(resolution.context)
    return result === 'deleted' ? 'protocol-deleted' : 'already-absent'
  } catch (error) {
    if (!resolution.adapter.state.ownsSessionStorage) throw error
    await resolution.adapter.state.cleanup(resolution.context)
    return 'owned-state-deleted'
  }
}

export async function cleanupPlayerProviderResources(
  workspace: string,
  options: PlayerProviderResolutionOptions = {},
): Promise<void> {
  const registry = options.registry ?? defaultPlayerProviderRegistry
  const context = {
    canonicalWorkspace: resolve(workspace),
    isolation: options.isolation ?? {},
  }
  for (const state of registry.statePolicies()) await state.cleanup(context)
  for (const lifecycle of registry.workspaceLifecycles()) await lifecycle.cleanup(context)
}

export function resolvePlayerLaunchSpec(
  tool: AgentTool,
  workspace: string,
  mcpServers: readonly McpServer[] = [],
  options: PlayerProviderResolutionOptions = {},
): ProcessLaunchSpec {
  const canonicalWorkspace = resolve(workspace)
  return buildPlayerLaunch(
    resolveProvider(tool, canonicalWorkspace, options, {
      path: playerModelInstructionsPath(canonicalWorkspace),
      text: '',
    }),
    mcpServers,
  )
}

interface ResolvedProvider {
  readonly adapter: PlayerProviderAdapter
  readonly context: {
    readonly tool: AgentTool
    readonly canonicalWorkspace: string
    readonly baseLaunch: ProcessLaunchSpec
    readonly isolation: PlayerProviderIsolationOptions
    readonly modelInstructions: PlayerModelInstructions
  }
  readonly runtimeWorkspace: string
}

function resolveProvider(
  tool: AgentTool,
  canonicalWorkspace: string,
  options: PlayerProviderResolutionOptions,
  modelInstructions: { readonly path: string; readonly text: string },
): ResolvedProvider {
  const registry = options.registry ?? defaultPlayerProviderRegistry
  const adapter = registry.resolve(tool)
  const context = {
    tool,
    canonicalWorkspace,
    baseLaunch: resolveLaunchSpec(tool),
    isolation: options.isolation ?? {},
    modelInstructions,
  }
  return {
    adapter,
    context,
    runtimeWorkspace: adapter.workspace.resolve(context),
  }
}

function buildPlayerLaunch(
  resolution: ResolvedProvider,
  mcpServers: readonly McpServer[],
): ProcessLaunchSpec {
  const stateEnvironment = resolution.adapter.state.environment(resolution.context)
  return resolution.adapter.launch({
    ...resolution.context,
    runtimeWorkspace: resolution.runtimeWorkspace,
    launch: {
      ...resolution.context.baseLaunch,
      env: { ...resolution.context.baseLaunch.env, ...stateEnvironment },
    },
    mcpServers,
  })
}
