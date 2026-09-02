import { homedir } from 'node:os'
import { resolve } from 'node:path'
import type { McpServer } from '@agentclientprotocol/sdk'
import { detachedPlayerWorkspace, playerProviderHome } from '../player-isolation.js'
import { definePlayerProvider, playerActionToolNames } from '../player-provider-contracts.js'

const knowledgeToolNames = ['Read', 'Grep', 'Glob', 'Skill'] as const
const mcpFunctionNames = playerActionToolNames.map(
  (tool) => `mcp__agentwolf-player-actions__${tool}`,
)
const playerArgs = [
  '--agent',
  'cli',
  '--setting-sources',
  'project',
  '--tools',
  [...knowledgeToolNames, ...mcpFunctionNames.map((tool) => `NoDefer(${tool})`)].join(','),
  '--allowedTools',
  mcpFunctionNames.join(','),
  '--permission-mode',
  'dontAsk',
] as const
const playerEnvironment = {
  CODEBUDDY_CODE_DISABLE_AUTO_MEMORY: '1',
  CODEBUDDY_CODE_DISABLE_BACKGROUND_TASKS: '1',
  CODEBUDDY_CODE_DISABLE_WORKFLOWS: '1',
  CODEBUDDY_DISABLE_AUTO_MEMORY: '1',
  CODEBUDDY_DISABLE_FORK_SUBAGENT: '1',
  CODEBUDDY_DISABLE_IDE: '1',
  CODEBUDDY_MAIN_AGENT_ENABLED: '0',
  CODEBUDDY_MEMORY_ENABLED: '0',
  CODEBUDDY_MEMORY_RELEVANCE_DISABLED: '1',
  CODEBUDDY_TEAM_MEMORY_ENABLED: '0',
  CODEBUDDY_TYPED_MEMORY_ENABLED: '0',
} as const

export const codebuddyPlayerProvider = definePlayerProvider({
  id: 'codebuddy',
  selector: { type: 'kind', kind: 'codebuddy' },
  workspace: detachedPlayerWorkspace(['.agents', '.codebuddy']),
  state: playerProviderHome({
    id: 'codebuddy',
    directoryName: 'codebuddy',
    environmentVariable: 'CODEBUDDY_CONFIG_DIR',
    defaultHostHome: () => resolve(homedir(), '.codebuddy'),
    credentialEntries: ['local_storage'],
  }),
  session: {
    approvedToolNames: [...playerActionToolNames, ...knowledgeToolNames],
    mcpTransport: 'launch',
    resume: 'verify',
    permissions: 'declared',
    metadata: () => ({}),
  },
  launch: (context) => {
    const mcp = codebuddyMcpLaunchConfig(context.mcpServers)
    return {
      ...context.launch,
      args: [
        ...context.launch.args,
        ...playerArgs,
        '--system-prompt-file',
        context.modelInstructions.path,
        ...mcp.args,
      ],
      env: {
        ...context.launch.env,
        ...playerEnvironment,
        ...mcp.env,
      },
    }
  },
})

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
