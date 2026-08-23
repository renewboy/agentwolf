import { AgentToolSchema } from '@agentwolf/contracts'
import { describe, expect, it } from 'vitest'
import {
  builtInAgentTools,
  playerActionToolNames,
  playerBootstrapContextBudget,
  playerSessionMeta,
  resolvePlayerLaunchSpec,
} from '../src/index.js'

describe('game-only player process policy', () => {
  it('keeps a mechanical bootstrap context budget below the former ambient baseline', () => {
    expect(playerBootstrapContextBudget).toBe(12_000)
  })

  it('starts Trae with only AgentWolf skills and action tools', () => {
    const tool = builtInAgentTools().find((entry) => entry.kind === 'trae-cli')!
    const launch = resolvePlayerLaunchSpec(tool, '/runtime/player-1')
    const disabled = optionValues(launch.args, '--disable')
    expect(disabled).toEqual(
      expect.arrayContaining([
        'apply_patch_freeform',
        'browser_use',
        'hooks',
        'memories',
        'multi_agent',
        'plugins',
        'shell_tool',
        'tool_search',
        'unified_exec',
      ]),
    )
    expect(disabled).not.toContain('code_mode_host')
    expect(optionValues(launch.args, '--enable')).toEqual(['code_mode_host'])
    expect(optionValues(launch.args, '--allowed-tool')).toEqual(
      playerActionToolNames.map((name) => `mcp__agentwolf_player_actions__${name}`),
    )
    expect(optionValues(launch.args, '--disallowed-tool')).toEqual([
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
    ])
    expect(launch.args).toContain('skills.include_instructions=false')
    expect(launch.args).toContain(
      'tools.enabled_tools=["mcp__agentwolf_player_actions__submit_speech","mcp__agentwolf_player_actions__submit_vote","mcp__agentwolf_player_actions__submit_night_action","mcp__agentwolf_player_actions__submit_sheriff_action","mcp__agentwolf_player_actions__trigger_skill"]',
    )
    expect(launch.args).toContain('project_doc_max_bytes=0')
    expect(launch.args).toContain(
      'model_instructions_file="/runtime/player-1/.agents/skills/agentwolf-player/SKILL.md"',
    )
    expect(launch.args.indexOf('skills.include_instructions=false')).toBeLessThan(
      launch.args.indexOf('acp'),
    )
  })

  it('merges an isolated Codex session config over user defaults', () => {
    const builtIn = builtInAgentTools().find((entry) => entry.kind === 'codex')!
    const tool = AgentToolSchema.parse({
      ...builtIn,
      environment: {
        ...builtIn.environment,
        CODEX_CONFIG: {
          source: 'literal',
          value: JSON.stringify({ model: 'preserved-model', features: { shell_tool: true } }),
          secret: false,
        },
      },
    })
    const config = JSON.parse(
      resolvePlayerLaunchSpec(tool, '/runtime/player-2').env['CODEX_CONFIG']!,
    ) as {
      model: string
      model_instructions_file: string
      project_doc_max_bytes: number
      include_permissions_instructions: boolean
      features: Record<string, boolean>
      memories: { use_memories: boolean; generate_memories: boolean }
      skills: { include_instructions: boolean }
      tools: { enabled_tools: string[] }
    }
    expect(config.model).toBe('preserved-model')
    expect(config.model_instructions_file).toBe(
      '/runtime/player-2/.agents/skills/agentwolf-player/SKILL.md',
    )
    expect(config.project_doc_max_bytes).toBe(0)
    expect(config.include_permissions_instructions).toBe(false)
    expect(config.features).toMatchObject({
      apply_patch_freeform: false,
      browser_use: false,
      code_mode_host: false,
      memories: false,
      multi_agent: false,
      shell_tool: false,
      unified_exec: false,
    })
    expect(config.memories).toEqual({ generate_memories: false, use_memories: false })
    expect(config.skills).toEqual({ include_instructions: false })
    expect(config.tools.enabled_tools).toEqual(
      playerActionToolNames.map((name) => `mcp__agentwolf_player_actions__${name}`),
    )
  })

  it('disables Claude built-ins and every ambient settings source', () => {
    expect(playerSessionMeta('claude')).toEqual({
      disableBuiltInTools: true,
      claudeCode: {
        options: {
          settingSources: [],
          systemPrompt:
            'You are an AgentWolf game player. Follow only the judge messages in this session and use only the supplied AgentWolf action tools.',
          tools: [],
        },
      },
    })
    expect(playerSessionMeta('trae-cli')).toEqual({})
  })
})

function optionValues(args: readonly string[], option: string): string[] {
  return args.flatMap((value, index) =>
    value === option && args[index + 1] ? [args[index + 1]!] : [],
  )
}
