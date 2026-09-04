import type { McpServer } from '@agentclientprotocol/sdk'
import type { AgentTool, AgentToolId, AgentToolKind } from '@agentwolf/contracts'
import type { ProcessLaunchSpec } from './tool-catalog.js'

export const playerActionToolNames = [
  'submit_speech',
  'submit_vote',
  'submit_night_action',
  'submit_sheriff_action',
  'trigger_skill',
  'pass_skill',
  'submit_postgame_review',
] as const

export const playerKnowledgeToolNames = ['Read', 'Grep', 'Glob', 'Bash', 'Skill'] as const

export const playerBootstrapContextBudget = 12_000

export interface PlayerProviderIsolationOptions {
  readonly isolationRoot?: string
  readonly hostHomes?: Readonly<Record<string, string | undefined>>
}

export interface PlayerModelInstructions {
  readonly path: string
  readonly text: string
}

export interface PlayerProviderPreparationContext {
  readonly tool: AgentTool
  readonly canonicalWorkspace: string
  readonly baseLaunch: ProcessLaunchSpec
  readonly isolation: PlayerProviderIsolationOptions
  readonly modelInstructions: PlayerModelInstructions
}

export interface PlayerProviderCleanupContext {
  readonly canonicalWorkspace: string
  readonly isolation: PlayerProviderIsolationOptions
}

export interface PlayerProviderHostSessionDeletionContext extends PlayerProviderPreparationContext {
  readonly runtimeWorkspace: string
  readonly sessionId: string
}

export interface PlayerProviderWorkspaceLifecycle {
  readonly key: string
  cleanup(context: PlayerProviderCleanupContext): Promise<void>
}

export interface PlayerProviderWorkspacePolicy {
  readonly lifecycle: PlayerProviderWorkspaceLifecycle
  resolve(context: PlayerProviderPreparationContext): string
  prepare(
    context: PlayerProviderPreparationContext & { readonly runtimeWorkspace: string },
  ): Promise<void>
}

export interface PlayerProviderStatePolicy {
  readonly key: string
  readonly ownsSessionStorage: boolean
  environment(context: PlayerProviderPreparationContext): NodeJS.ProcessEnv
  prepare(context: PlayerProviderPreparationContext): Promise<void>
  cleanup(context: PlayerProviderCleanupContext): Promise<void>
  deleteHostSessions(contexts: readonly PlayerProviderHostSessionDeletionContext[]): Promise<void>
}

export interface PlayerProviderLaunchContext extends PlayerProviderPreparationContext {
  readonly runtimeWorkspace: string
  readonly launch: ProcessLaunchSpec
  readonly mcpServers: readonly McpServer[]
}

export type PlayerProviderMcpTransport = 'session' | 'launch'
export type PlayerProviderResumePolicy = 'advertised' | 'verify'
export type PlayerProviderPermissionPolicy = 'declared' | 'opaque-mcp'

export interface PlayerProviderSessionPolicy {
  readonly approvedToolNames: readonly string[]
  readonly deletion: 'protocol' | 'owned-state'
  readonly mcpTransport: PlayerProviderMcpTransport
  readonly resume: PlayerProviderResumePolicy
  readonly permissions: PlayerProviderPermissionPolicy
  metadata(modelInstructions: string): Readonly<Record<string, unknown>>
}

export type PlayerProviderSelector =
  | { readonly type: 'kind'; readonly kind: AgentToolKind }
  | { readonly type: 'tool'; readonly toolId: AgentToolId }

export interface PlayerProviderAdapter {
  readonly id: string
  readonly selector: PlayerProviderSelector
  readonly workspace: PlayerProviderWorkspacePolicy
  readonly state: PlayerProviderStatePolicy
  readonly session: PlayerProviderSessionPolicy
  launch(context: PlayerProviderLaunchContext): ProcessLaunchSpec
}

export function definePlayerProvider(adapter: PlayerProviderAdapter): PlayerProviderAdapter {
  return adapter
}

export class PlayerProviderRegistry {
  readonly #byKind = new Map<AgentToolKind, PlayerProviderAdapter>()
  readonly #byTool = new Map<AgentToolId, PlayerProviderAdapter>()
  readonly #adapters = new Map<string, PlayerProviderAdapter>()
  readonly #statePolicies = new Map<string, PlayerProviderStatePolicy>()
  readonly #workspaceLifecycles = new Map<string, PlayerProviderWorkspaceLifecycle>()

  public constructor(adapters: readonly PlayerProviderAdapter[]) {
    for (const adapter of adapters) {
      if (this.#adapters.has(adapter.id)) {
        throw new Error(`Duplicate player Provider adapter ${adapter.id}`)
      }
      this.#adapters.set(adapter.id, adapter)
      const state = adapter.state
      const registeredState = this.#statePolicies.get(state.key)
      if (registeredState && registeredState !== state) {
        throw new Error(`Conflicting player Provider state policy ${state.key}`)
      }
      if (adapter.session.deletion === 'owned-state' && !state.ownsSessionStorage) {
        throw new Error(`Player Provider ${adapter.id} has no owned Session storage to delete`)
      }
      this.#statePolicies.set(state.key, state)
      const lifecycle = adapter.workspace.lifecycle
      const registeredLifecycle = this.#workspaceLifecycles.get(lifecycle.key)
      if (registeredLifecycle && registeredLifecycle !== lifecycle) {
        throw new Error(`Conflicting player workspace lifecycle ${lifecycle.key}`)
      }
      this.#workspaceLifecycles.set(lifecycle.key, lifecycle)
      if (adapter.selector.type === 'kind') {
        if (this.#byKind.has(adapter.selector.kind)) {
          throw new Error(`Duplicate player Provider kind ${adapter.selector.kind}`)
        }
        this.#byKind.set(adapter.selector.kind, adapter)
      } else {
        if (this.#byTool.has(adapter.selector.toolId)) {
          throw new Error(`Duplicate player Provider Tool ${adapter.selector.toolId}`)
        }
        this.#byTool.set(adapter.selector.toolId, adapter)
      }
    }
  }

  public resolve(tool: AgentTool): PlayerProviderAdapter {
    const adapter = this.#byTool.get(tool.id) ?? this.#byKind.get(tool.kind)
    if (!adapter) {
      throw new Error(`Agent Tool ${tool.id} has no verified player Provider adapter`)
    }
    return adapter
  }

  public list(): readonly PlayerProviderAdapter[] {
    return [...this.#adapters.values()]
  }

  public workspaceLifecycles(): readonly PlayerProviderWorkspaceLifecycle[] {
    return [...this.#workspaceLifecycles.values()]
  }

  public statePolicies(): readonly PlayerProviderStatePolicy[] {
    return [...this.#statePolicies.values()]
  }
}
