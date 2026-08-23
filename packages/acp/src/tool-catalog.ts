import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import type { AgentTool, EnvironmentBinding } from '@agentwolf/contracts'
import { AgentToolSchema } from '@agentwolf/contracts'

const require = createRequire(import.meta.url)

function packageBinary(packageName: string): string {
  const packageJsonPath = require.resolve(`${packageName}/package.json`)
  const packageJson = require(packageJsonPath) as { bin: string | Record<string, string> }
  const binary =
    typeof packageJson.bin === 'string' ? packageJson.bin : Object.values(packageJson.bin)[0]
  if (!binary) throw new Error(`${packageName} does not declare a binary`)
  return resolve(dirname(packageJsonPath), binary)
}

const bundledPaths = {
  codex: packageBinary('@agentclientprotocol/codex-acp'),
  claude: packageBinary('@agentclientprotocol/claude-agent-acp'),
}

export function builtInAgentTools(): readonly AgentTool[] {
  return [
    AgentToolSchema.parse({
      id: 'tool-trae-cli',
      name: 'Trae CLI',
      kind: 'trae-cli',
      command: 'traecli',
      args: ['--sandbox', 'read-only', 'acp', 'serve'],
      environment: {},
      modelConfigKey: 'model',
      builtIn: true,
    }),
    AgentToolSchema.parse({
      id: 'tool-codex',
      name: 'Codex',
      kind: 'codex',
      command: '$NODE',
      args: ['$CODEX_ACP'],
      environment: {
        INITIAL_AGENT_MODE: { source: 'literal', value: 'read-only', secret: false },
      },
      initialMode: 'read-only',
      modelConfigKey: 'model',
      builtIn: true,
    }),
    AgentToolSchema.parse({
      id: 'tool-claude',
      name: 'Claude',
      kind: 'claude',
      command: '$NODE',
      args: ['$CLAUDE_ACP'],
      environment: {},
      modelConfigKey: 'model',
      builtIn: true,
    }),
  ]
}

export interface ProcessLaunchSpec {
  readonly command: string
  readonly args: readonly string[]
  readonly env: NodeJS.ProcessEnv
}

function resolveBinding(name: string, binding: EnvironmentBinding): string {
  if (binding.source === 'literal') return binding.value
  const value = process.env[binding.variable]
  if (value === undefined) {
    throw new Error(`Environment variable ${binding.variable} required for ${name} is not set`)
  }
  return value
}

function resolveToken(value: string): string {
  if (value === '$NODE') return process.execPath
  if (value === '$CODEX_ACP') return bundledPaths.codex
  if (value === '$CLAUDE_ACP') return bundledPaths.claude
  return value
}

export function resolveLaunchSpec(tool: AgentTool): ProcessLaunchSpec {
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const [name, binding] of Object.entries(tool.environment)) {
    env[name] = resolveBinding(name, binding)
  }
  return {
    command: resolveToken(tool.command),
    args: tool.args.map(resolveToken),
    env,
  }
}
