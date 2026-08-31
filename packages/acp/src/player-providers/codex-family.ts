import { playerActionToolNames } from '../player-provider-contracts.js'

export const codexPlayerMcpFunctionNames = playerActionToolNames.map(
  (tool) => `mcp__agentwolf_player_actions__${tool}`,
)

export const disabledCodexFeatures = [
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

export const isolatedCodexContextConfig = {
  include_apps_instructions: false,
  include_collaboration_mode_instructions: false,
  include_environment_context: false,
  include_permissions_instructions: false,
  include_apply_patch_tool: false,
  developer_instructions: '',
  personality: 'none',
  project_doc_fallback_filenames: [],
  project_doc_max_bytes: 0,
  memories: {
    generate_memories: false,
    use_memories: false,
  },
} as const
