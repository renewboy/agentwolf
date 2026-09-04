import type { AgentTool } from '@agentwolf/contracts'
import type { ProcessLaunchSpec } from './tool-catalog.js'

const codexReasoningEffortFallbacks: Readonly<Record<string, readonly string[]>> = {
  'gpt-6-astra': ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
}

export function resolveProviderReasoningEfforts(
  tool: Pick<AgentTool, 'kind'>,
  model: string | undefined,
  advertised: readonly string[],
): string[] {
  if (advertised.length > 0 || tool.kind !== 'codex' || !model) return [...advertised]
  return [...(codexReasoningEffortFallbacks[model] ?? [])]
}

export interface ProviderModelSelection {
  readonly model?: string
  readonly reasoningEffort?: string
}

export function prepareProviderModelSelection(
  tool: Pick<AgentTool, 'kind'>,
  launch: ProcessLaunchSpec,
  selection: ProviderModelSelection,
): { readonly launch: ProcessLaunchSpec; readonly sessionSelection: ProviderModelSelection } {
  if (tool.kind !== 'codex') return { launch, sessionSelection: selection }
  const config = parseCodexConfig(launch.env['CODEX_CONFIG'])
  return {
    launch: {
      ...launch,
      env: {
        ...launch.env,
        CODEX_CONFIG: JSON.stringify({
          ...config,
          ...(selection.model ? { model: selection.model } : {}),
          ...(selection.reasoningEffort
            ? { model_reasoning_effort: selection.reasoningEffort }
            : {}),
        }),
      },
    },
    sessionSelection: {},
  }
}

function parseCodexConfig(value: string | undefined): Readonly<Record<string, unknown>> {
  if (!value) return {}
  try {
    const parsed: unknown = JSON.parse(value)
    if (isRecord(parsed)) return parsed
  } catch {
    // Fall through to the stable boundary error below.
  }
  throw new Error('CODEX_CONFIG must be a JSON object')
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
