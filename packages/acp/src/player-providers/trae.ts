import { resolve } from 'node:path'
import { canonicalPlayerWorkspace, noPlayerProviderState } from '../player-isolation.js'
import {
  definePlayerProvider,
  playerActionToolNames,
  playerKnowledgeToolNames,
} from '../player-provider-contracts.js'
import { codexPlayerMcpFunctionNames, disabledCodexFeatures } from './codex-family.js'

const codingToolNames = [
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

const disabledTools = codingToolNames.filter(
  (tool) => !playerKnowledgeToolNames.includes(tool as (typeof playerKnowledgeToolNames)[number]),
)
const disabledFeatures = disabledCodexFeatures.filter(
  (feature) => feature !== 'code_mode_host' && feature !== 'shell_tool',
)
const requiredFeatures = ['code_mode_host', 'shell_tool'] as const
const modelToolSelection = `tools.enabled_tools=[${[
  ...playerKnowledgeToolNames,
  ...codexPlayerMcpFunctionNames,
]
  .map((tool) => JSON.stringify(tool))
  .join(',')}]`

const contextArgs = [
  ...disabledFeatures.flatMap((feature) => ['--disable', feature]),
  ...requiredFeatures.flatMap((feature) => ['--enable', feature]),
  '-c',
  'include_apps_instructions=false',
  '-c',
  'include_collaboration_mode_instructions=false',
  '-c',
  'include_environment_context=false',
  '-c',
  'include_permissions_instructions=false',
  '-c',
  'include_apply_patch_tool=false',
  '-c',
  'developer_instructions=""',
  '-c',
  'personality="none"',
  '-c',
  'memories.generate_memories=false',
  '-c',
  'memories.use_memories=false',
  '-c',
  'project_doc_fallback_filenames=[]',
  '-c',
  'project_doc_max_bytes=0',
  '-c',
  'skills.include_instructions=false',
  '-c',
  modelToolSelection,
] as const

const toolArgs = [
  ...disabledTools.flatMap((tool) => ['--disallowed-tool', tool]),
  ...playerKnowledgeToolNames.flatMap((tool) => ['--allowed-tool', tool]),
  ...codexPlayerMcpFunctionNames.flatMap((tool) => ['--allowed-tool', tool]),
] as const

export const traePlayerProvider = definePlayerProvider({
  id: 'trae-cli',
  selector: { type: 'kind', kind: 'trae-cli' },
  workspace: canonicalPlayerWorkspace,
  state: noPlayerProviderState,
  session: {
    approvedToolNames: [...playerActionToolNames, ...playerKnowledgeToolNames],
    mcpTransport: 'session',
    resume: 'advertised',
    permissions: 'declared',
    metadata: () => ({}),
  },
  launch: (context) => {
    const commandIndex = context.launch.args.indexOf('acp')
    const insertionIndex = commandIndex < 0 ? context.launch.args.length : commandIndex
    const modelInstructions = resolve(
      context.runtimeWorkspace,
      '.agents',
      'skills',
      'agentwolf-player',
      'SKILL.md',
    )
    return {
      ...context.launch,
      args: [
        ...context.launch.args.slice(0, insertionIndex),
        ...contextArgs,
        '-c',
        `model_instructions_file=${JSON.stringify(modelInstructions)}`,
        '--ask-for-approval',
        'never',
        ...context.launch.args.slice(insertionIndex),
        ...toolArgs,
      ],
    }
  },
})
