import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, parse, resolve } from 'node:path'
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

export function isolatedSkillConfig(
  additionalRoots: readonly string[] = [],
  workspace?: string,
): Readonly<Record<string, unknown>> {
  return {
    include_instructions: true,
    bundled: { enabled: false },
    config: ambientSkillPaths(additionalRoots, workspace).map((path) => ({ path, enabled: false })),
  }
}

export function isolatedSkillConfigToml(
  additionalRoots: readonly string[] = [],
  workspace?: string,
): string {
  const entries = ambientSkillPaths(additionalRoots, workspace)
    .map((path) => `{ path=${JSON.stringify(path)}, enabled=false }`)
    .join(',')
  return `skills.config=[${entries}]`
}

function ambientSkillPaths(additionalRoots: readonly string[], workspace?: string): string[] {
  const roots = new Set([
    resolve(homedir(), '.agents', 'skills'),
    '/etc/codex/skills',
    ...additionalRoots,
    ...ancestorSkillRoots(workspace),
  ])
  const paths: string[] = []
  for (const root of roots) {
    let entries
    try {
      entries = readdirSync(root, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const skill = resolve(root, entry.name, 'SKILL.md')
      if ((entry.isDirectory() || entry.isSymbolicLink()) && existsSync(skill)) paths.push(skill)
    }
  }
  return [...new Set(paths)].sort()
}

function ancestorSkillRoots(workspace: string | undefined): string[] {
  if (!workspace) return []
  const roots: string[] = []
  let current = dirname(resolve(workspace))
  const filesystemRoot = parse(current).root
  while (true) {
    for (const container of ['.agents/skills', '.trae/skills', '.codex/skills']) {
      roots.push(resolve(current, container))
    }
    if (current === filesystemRoot) return roots
    current = dirname(current)
  }
}
