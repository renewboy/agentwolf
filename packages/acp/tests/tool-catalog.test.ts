import { access } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { builtInAgentTools, resolveLaunchSpec } from '../src/index.js'

describe('built-in ACP tools', () => {
  it('resolves bundled Codex and Claude adapters without npx network access', async () => {
    const tools = builtInAgentTools()
    const codex = tools.find((tool) => tool.kind === 'codex')!
    const claude = tools.find((tool) => tool.kind === 'claude')!
    const codexLaunch = resolveLaunchSpec(codex)
    const claudeLaunch = resolveLaunchSpec(claude)

    expect(codexLaunch.command).toBe(process.execPath)
    expect(claudeLaunch.command).toBe(process.execPath)
    await access(codexLaunch.args[0]!)
    await access(claudeLaunch.args[0]!)
  })
})
