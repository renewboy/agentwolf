import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { canonicalPlayerWorkspace, playerProviderHome } from '../player-isolation.js'
import { deleteCodexFamilyHostSessions } from '../provider-session-storage.js'
import { definePlayerProvider, playerActionToolNames } from '../player-provider-contracts.js'
import {
  codexPlayerMcpFunctionNames,
  disabledCodexFeatures,
  isolatedCodexContextConfig,
  isolatedSkillConfig,
} from './codex-family.js'

const codexPlayerConfig = {
  ...isolatedCodexContextConfig,
  features: {
    ...Object.fromEntries(
      disabledCodexFeatures
        .filter((feature) => feature !== 'shell_tool')
        .map((feature) => [feature, false]),
    ),
    shell_tool: true,
  },
  tools: { enabled_tools: codexPlayerMcpFunctionNames },
  view_image: false,
  web_search: 'disabled',
} as const

export const codexPlayerProvider = definePlayerProvider({
  id: 'codex',
  selector: { type: 'kind', kind: 'codex' },
  workspace: canonicalPlayerWorkspace,
  state: playerProviderHome({
    id: 'codex',
    directoryName: 'codex',
    environmentVariable: 'CODEX_HOME',
    defaultHostHome: () => resolve(homedir(), '.codex'),
    credentialEntries: ['auth.json'],
    deleteHostSessions: ({ hostHome, sessions }) =>
      deleteCodexFamilyHostSessions({ storageRoot: hostHome, sessions }),
  }),
  session: {
    approvedToolNames: playerActionToolNames,
    deletion: 'protocol',
    mcpTransport: 'session',
    resume: 'advertised',
    permissions: 'opaque-mcp',
    metadata: () => ({}),
  },
  launch: (context) => {
    return {
      ...context.launch,
      env: {
        ...context.launch.env,
        CODEX_CONFIG: JSON.stringify(
          mergeCodexConfig(
            context.launch.env['CODEX_CONFIG'],
            context.modelInstructions.path,
            context.canonicalWorkspace,
          ),
        ),
      },
    }
  },
})

function mergeCodexConfig(
  value: string | undefined,
  modelInstructions: string,
  workspace: string,
): Readonly<Record<string, unknown>> {
  const current = value ? parseJsonObject(value, 'CODEX_CONFIG') : {}
  return {
    ...current,
    ...isolatedCodexContextConfig,
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
      ...isolatedSkillConfig([], workspace),
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
