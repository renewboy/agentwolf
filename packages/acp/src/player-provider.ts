import { resolve } from 'node:path'
import type { McpServer } from '@agentclientprotocol/sdk'
import type { AgentTool } from '@agentwolf/contracts'
import {
  type PlayerProviderAdapter,
  type PlayerProviderIsolationOptions,
  PlayerProviderRegistry,
} from './player-provider-contracts.js'
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
  readonly playerContract: string
}

export interface PreparedPlayerProviderSession {
  readonly providerId: string
  readonly cwd: string
  readonly launch: ProcessLaunchSpec
  readonly mcpServers: readonly McpServer[]
  readonly sessionMeta: Readonly<Record<string, unknown>>
  readonly approvedToolNames: readonly string[]
  readonly verifyUnadvertisedSessionResume: boolean
  readonly allowOpaqueMcpPermissions: boolean
}

export async function preparePlayerProviderSession(
  options: PreparePlayerProviderSessionOptions,
): Promise<PreparedPlayerProviderSession> {
  const resolution = resolveProvider(options.tool, options.workspace, options)
  await resolution.adapter.workspace.prepare({
    ...resolution.context,
    runtimeWorkspace: resolution.runtimeWorkspace,
  })
  await resolution.adapter.state.prepare(resolution.context)
  const mcpServers = options.mcpServers ?? []
  return {
    providerId: resolution.adapter.id,
    cwd: resolution.runtimeWorkspace,
    launch: buildPlayerLaunch(resolution, mcpServers),
    mcpServers: resolution.adapter.session.mcpTransport === 'session' ? mcpServers : [],
    sessionMeta: resolution.adapter.session.metadata(options.playerContract),
    approvedToolNames: resolution.adapter.session.approvedToolNames,
    verifyUnadvertisedSessionResume: resolution.adapter.session.resume === 'verify',
    allowOpaqueMcpPermissions: resolution.adapter.session.permissions === 'opaque-mcp',
  }
}

export async function cleanupPlayerProviderWorkspaces(
  workspace: string,
  options: PlayerProviderResolutionOptions = {},
): Promise<void> {
  const registry = options.registry ?? defaultPlayerProviderRegistry
  const context = {
    canonicalWorkspace: resolve(workspace),
    isolation: options.isolation ?? {},
  }
  for (const lifecycle of registry.workspaceLifecycles()) await lifecycle.cleanup(context)
}

export function resolvePlayerLaunchSpec(
  tool: AgentTool,
  workspace: string,
  mcpServers: readonly McpServer[] = [],
  options: PlayerProviderResolutionOptions = {},
): ProcessLaunchSpec {
  return buildPlayerLaunch(resolveProvider(tool, workspace, options), mcpServers)
}

interface ResolvedProvider {
  readonly adapter: PlayerProviderAdapter
  readonly context: {
    readonly tool: AgentTool
    readonly canonicalWorkspace: string
    readonly baseLaunch: ProcessLaunchSpec
    readonly isolation: PlayerProviderIsolationOptions
  }
  readonly runtimeWorkspace: string
}

function resolveProvider(
  tool: AgentTool,
  workspace: string,
  options: PlayerProviderResolutionOptions,
): ResolvedProvider {
  const registry = options.registry ?? defaultPlayerProviderRegistry
  const adapter = registry.resolve(tool)
  const context = {
    tool,
    canonicalWorkspace: resolve(workspace),
    baseLaunch: resolveLaunchSpec(tool),
    isolation: options.isolation ?? {},
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
