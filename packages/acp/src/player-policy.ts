import { resolve } from 'node:path'
import type { McpServer } from '@agentclientprotocol/sdk'
import type { AgentTool, AgentToolKind } from '@agentwolf/contracts'
import { resolveLaunchSpec, type ProcessLaunchSpec } from './tool-catalog.js'

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
const codebuddyPlayerKnowledgeToolNames = ['Read', 'Grep', 'Glob'] as const

export function playerApprovedToolNames(kind: AgentToolKind): readonly string[] {
  if (kind === 'trae-cli') return [...playerActionToolNames, ...playerKnowledgeToolNames]
  if (kind === 'codebuddy') {
    return [...playerActionToolNames, ...codebuddyPlayerKnowledgeToolNames]
  }
  return playerActionToolNames
}

export const playerBootstrapContextBudget = 12_000

const playerMcpFunctionNames = playerActionToolNames.map(
  (tool) => `mcp__agentwolf_player_actions__${tool}`,
)
const codebuddyPlayerMcpFunctionNames = playerActionToolNames.map(
  (tool) => `mcp__agentwolf-player-actions__${tool}`,
)
const traeCodingToolNames = [
  'Read',
  'Write',
  'Edit',
  'Grep',
  'Glob',
  'Bash',
  'Monitor',
  'Agent',
  'ListAgents',
  'SendMessage',
  'TodoWrite',
  'Skill',
  'TaskStop',
  'TaskOutput',
  'EnterPlanMode',
  'ExitPlanMode',
  'WebSearch',
  'WebFetch',
] as const
const traeDisallowedCodingToolNames = traeCodingToolNames.filter(
  (tool) => !playerKnowledgeToolNames.includes(tool as (typeof playerKnowledgeToolNames)[number]),
)
const playerMcpToolSelection = `tools.enabled_tools=[${[
  ...playerKnowledgeToolNames,
  ...playerMcpFunctionNames,
]
  .map((tool) => JSON.stringify(tool))
  .join(',')}]`

const disabledCodingFeatures = [
  'apps',
  'apply_patch_freeform',
  'browser_use',
  'browser_use_external',
  'code_mode_host',
  'computer_use',
  'codex_git_commit',
  'goals',
  'hooks',
  'image_generation',
  'in_app_browser',
  'in_app_updates',
  'memories',
  'multi_agent',
  'multi_agent_v2',
  'plugin_hooks',
  'plugins',
  'request_permissions_tool',
  'shell_snapshot',
  'shell_tool',
  'skill_mcp_dependency_install',
  'tool_search',
  'tool_suggest',
  'unavailable_dummy_tools',
  'unified_exec',
  'workspace_dependencies',
  'workspace_undo',
  'workspace_undo_outside_workspace_roots',
] as const

const traeDisabledCodingFeatures = disabledCodingFeatures.filter(
  (feature) => feature !== 'code_mode_host' && feature !== 'shell_tool',
)
const traeRequiredFeatures = ['code_mode_host', 'shell_tool'] as const
const codexDisabledCodingFeatures = disabledCodingFeatures.filter(
  (feature) => feature !== 'shell_tool',
)

const sharedContextConfig = {
  include_apps_instructions: false,
  include_environment_context: false,
  include_permissions_instructions: false,
  project_doc_max_bytes: 0,
  memories: {
    generate_memories: false,
    use_memories: false,
  },
} as const

const traePlayerContextArgs = [
  ...traeDisabledCodingFeatures.flatMap((feature) => ['--disable', feature]),
  ...traeRequiredFeatures.flatMap((feature) => ['--enable', feature]),
  '-c',
  'include_apps_instructions=false',
  '-c',
  'include_environment_context=false',
  '-c',
  'include_permissions_instructions=false',
  '-c',
  'memories.generate_memories=false',
  '-c',
  'memories.use_memories=false',
  '-c',
  'project_doc_max_bytes=0',
  '-c',
  'skills.include_instructions=false',
  '-c',
  playerMcpToolSelection,
] as const

const traePlayerToolArgs = [
  ...traeDisallowedCodingToolNames.flatMap((tool) => ['--disallowed-tool', tool]),
  ...playerKnowledgeToolNames.flatMap((tool) => ['--allowed-tool', tool]),
  ...playerMcpFunctionNames.flatMap((tool) => ['--allowed-tool', tool]),
] as const

const codexPlayerConfig = {
  ...sharedContextConfig,
  features: {
    ...Object.fromEntries(codexDisabledCodingFeatures.map((feature) => [feature, false])),
    shell_tool: true,
  },
  skills: { include_instructions: false },
  tools: { enabled_tools: playerMcpFunctionNames },
  view_image: false,
  web_search: 'disabled',
} as const

const codebuddyPlayerArgs = [
  '--agent',
  'cli',
  '--setting-sources',
  '',
  '--tools',
  [
    ...codebuddyPlayerKnowledgeToolNames,
    ...codebuddyPlayerMcpFunctionNames.map((tool) => `NoDefer(${tool})`),
  ].join(','),
  '--allowedTools',
  codebuddyPlayerMcpFunctionNames.join(','),
  '--permission-mode',
  'dontAsk',
] as const

const codebuddyPlayerEnvironment = {
  CODEBUDDY_CODE_DISABLE_AUTO_MEMORY: '1',
  CODEBUDDY_CODE_DISABLE_BACKGROUND_TASKS: '1',
  CODEBUDDY_DISABLE_AUTO_MEMORY: '1',
  CODEBUDDY_DISABLE_FORK_SUBAGENT: '1',
  CODEBUDDY_MAIN_AGENT_ENABLED: '0',
  CODEBUDDY_MEMORY_ENABLED: '0',
  CODEBUDDY_TEAM_MEMORY_ENABLED: '0',
  CODEBUDDY_TYPED_MEMORY_ENABLED: '0',
} as const

export function resolvePlayerLaunchSpec(
  tool: AgentTool,
  workspace: string,
  mcpServers: readonly McpServer[] = [],
): ProcessLaunchSpec {
  const launch = resolveLaunchSpec(tool)
  const modelInstructions = resolve(workspace, '.agents', 'skills', 'agentwolf-player', 'SKILL.md')
  if (tool.kind === 'trae-cli') {
    const commandIndex = launch.args.indexOf('acp')
    const insertionIndex = commandIndex < 0 ? launch.args.length : commandIndex
    return {
      ...launch,
      args: [
        ...launch.args.slice(0, insertionIndex),
        ...traePlayerContextArgs,
        '-c',
        `model_instructions_file=${JSON.stringify(modelInstructions)}`,
        '--ask-for-approval',
        'never',
        ...launch.args.slice(insertionIndex),
        ...traePlayerToolArgs,
      ],
    }
  }
  if (tool.kind === 'codex') {
    return {
      ...launch,
      env: {
        ...launch.env,
        CODEX_CONFIG: JSON.stringify(
          mergeCodexConfig(launch.env['CODEX_CONFIG'], modelInstructions),
        ),
      },
    }
  }
  if (tool.kind === 'codebuddy') {
    const mcp = codebuddyMcpLaunchConfig(mcpServers)
    return {
      ...launch,
      args: [
        ...launch.args,
        ...codebuddyPlayerArgs,
        '--system-prompt-file',
        modelInstructions,
        ...mcp.args,
      ],
      env: { ...launch.env, ...codebuddyPlayerEnvironment, ...mcp.env },
    }
  }
  return launch
}

function codebuddyMcpLaunchConfig(mcpServers: readonly McpServer[]): {
  readonly args: readonly string[]
  readonly env: NodeJS.ProcessEnv
} {
  const environment: NodeJS.ProcessEnv = {}
  const entries = mcpServers.map((server, serverIndex) => {
    if (!('type' in server) || server.type !== 'http') {
      throw new Error(`CodeBuddy player MCP server ${server.name} must use HTTP transport`)
    }
    const headers = Object.fromEntries(
      server.headers.map((header, headerIndex) => {
        const variable = `AGENTWOLF_CODEBUDDY_MCP_${serverIndex}_HEADER_${headerIndex}`
        environment[variable] = header.value
        return [header.name, `\${${variable}}`]
      }),
    )
    return [server.name, { type: 'http', url: server.url, headers }] as const
  })
  return {
    args: [
      '--mcp-config',
      JSON.stringify({ mcpServers: Object.fromEntries(entries) }),
      '--strict-mcp-config',
    ],
    env: environment,
  }
}

export function playerSessionMeta(
  kind: AgentToolKind,
  playerContract: string,
): Readonly<Record<string, unknown>> {
  if (kind !== 'claude') return {}
  return {
    claudeCode: {
      options: {
        settingSources: [],
        systemPrompt: playerContract,
        tools: [...playerKnowledgeToolNames],
        allowedTools: [...playerKnowledgeToolNames],
        skills: ['agentwolf-player', 'werewolf-strategy'],
        sandbox: {
          enabled: true,
          failIfUnavailable: true,
          autoAllowBashIfSandboxed: true,
          allowUnsandboxedCommands: false,
          network: {
            allowedDomains: [],
            deniedDomains: ['*'],
            strictAllowlist: true,
            allowUnixSockets: [],
            allowAllUnixSockets: false,
            allowLocalBinding: false,
          },
          filesystem: { denyWrite: ['/**'] },
        },
      },
    },
  }
}

function mergeCodexConfig(
  value: string | undefined,
  modelInstructions: string,
): Readonly<Record<string, unknown>> {
  const current = value ? parseJsonObject(value, 'CODEX_CONFIG') : {}
  return {
    ...current,
    ...sharedContextConfig,
    model_instructions_file: modelInstructions,
    features: {
      ...recordProperty(current, 'features'),
      ...codexPlayerConfig.features,
    },
    memories: {
      ...recordProperty(current, 'memories'),
      ...codexPlayerConfig.memories,
    },
    skills: {
      ...recordProperty(current, 'skills'),
      ...codexPlayerConfig.skills,
    },
    tools: {
      ...recordProperty(current, 'tools'),
      ...codexPlayerConfig.tools,
    },
    view_image: codexPlayerConfig.view_image,
    web_search: codexPlayerConfig.web_search,
  }
}

function parseJsonObject(value: string, label: string): Readonly<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(value)
    if (isRecord(parsed)) return parsed
  } catch {
    // Fall through to the stable boundary error below.
  }
  throw new Error(`${label} must be a JSON object`)
}

function recordProperty(
  record: Readonly<Record<string, unknown>>,
  key: string,
): Readonly<Record<string, unknown>> {
  const value = record[key]
  return isRecord(value) ? value : {}
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
