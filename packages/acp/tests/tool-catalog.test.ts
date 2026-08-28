import { access } from 'node:fs/promises'
import { AgentToolSchema } from '@agentwolf/contracts'
import { describe, expect, it } from 'vitest'
import { builtInAgentTools, resolveLaunchSpec } from '../src/index.js'

describe('built-in ACP tools', () => {
  it('resolves bundled adapters and the native CodeBuddy command without npx network access', async () => {
    const tools = builtInAgentTools()
    const codex = tools.find((tool) => tool.kind === 'codex')!
    const claude = tools.find((tool) => tool.kind === 'claude')!
    const codebuddy = tools.find((tool) => tool.kind === 'codebuddy')!
    const codexLaunch = resolveLaunchSpec(codex)
    const claudeLaunch = resolveLaunchSpec(claude)
    const codebuddyLaunch = resolveLaunchSpec(codebuddy)

    expect(codexLaunch.command).toBe(process.execPath)
    expect(claudeLaunch.command).toBe(process.execPath)
    expect(codebuddyLaunch).toMatchObject({ command: 'codebuddy', args: ['--acp'] })
    await access(codexLaunch.args[0]!)
    await access(claudeLaunch.args[0]!)
  })

  it('lists every built-in and resolves raw/literal/process bindings and tokens', () => {
    const tools = builtInAgentTools()
    expect(tools.map(({ kind }) => kind)).toEqual(['trae-cli', 'codex', 'claude', 'codebuddy'])
    const variable = 'AGENTWOLF_TOOL_CATALOG_TEST'
    process.env[variable] = 'from-process'
    try {
      const custom = AgentToolSchema.parse({
        id: 'tool-custom-test',
        name: 'Custom',
        kind: 'custom',
        command: 'custom-command',
        args: ['$NODE', '$CODEX_ACP', '$CLAUDE_ACP', 'literal-arg'],
        environment: {
          FROM_LITERAL: { source: 'literal', value: 'literal-value', secret: false },
          FROM_PROCESS: { source: 'process', variable },
        },
        modelConfigKey: 'model',
        builtIn: false,
      })
      const launch = resolveLaunchSpec(custom)
      expect(launch.command).toBe('custom-command')
      expect(launch.args[0]).toBe(process.execPath)
      expect(launch.args[1]).toMatch(/codex-acp/)
      expect(launch.args[2]).toMatch(/claude-agent-acp/)
      expect(launch.args[3]).toBe('literal-arg')
      expect(launch.env['FROM_LITERAL']).toBe('literal-value')
      expect(launch.env['FROM_PROCESS']).toBe('from-process')
    } finally {
      delete process.env[variable]
    }
  })

  it('rejects missing process environment bindings', () => {
    const tool = AgentToolSchema.parse({
      id: 'tool-missing-environment',
      name: 'Missing environment',
      kind: 'custom',
      command: 'agent',
      args: [],
      environment: {
        REQUIRED: { source: 'process', variable: 'AGENTWOLF_DEFINITELY_MISSING_TEST' },
      },
      modelConfigKey: 'model',
      builtIn: false,
    })
    delete process.env['AGENTWOLF_DEFINITELY_MISSING_TEST']
    expect(() => resolveLaunchSpec(tool)).toThrow(/required for REQUIRED is not set/)
  })
})
