import { lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { AgentToolSchema } from '@agentwolf/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import {
  builtInAgentTools,
  cleanupPlayerProviderResources,
  defaultPlayerProviderRegistry,
  deletePlayerProviderSession,
  playerIsolationWorkspace,
  preparePlayerProviderSession,
  removePlayerIsolationWorkspace,
  resolveLaunchSpec,
} from '../src/index.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('player provider isolation', () => {
  it('runs Claude from the detached instruction-free workspace', async () => {
    const root = await temporaryRoot('agentwolf-claude-isolation-')
    const workspace = await playerWorkspace(root)
    const isolationRoot = resolve(root, 'detached')
    const tool = builtInAgentTools().find((entry) => entry.kind === 'claude')!

    const prepared = await preparePlayerProviderSession({
      tool,
      workspace,
      modelInstructions: 'PLAYER FOUNDATION',
      isolation: { isolationRoot },
    })

    expect(prepared.cwd).toBe(playerIsolationWorkspace(workspace, isolationRoot))
    expect(await realpath(resolve(prepared.cwd, '.agents'))).toBe(
      await realpath(resolve(workspace, '.agents')),
    )
    expect(await realpath(resolve(prepared.cwd, '.claude'))).toBe(
      await realpath(resolve(workspace, '.claude')),
    )
    expect(prepared.sessionMeta).toMatchObject({
      claudeCode: {
        options: {
          settingSources: ['project'],
          systemPrompt: 'PLAYER FOUNDATION',
          skills: ['agentwolf-player', 'werewolf-strategy'],
        },
      },
    })
  })

  it('starts Trae with the rendered foundation file and native Skill instructions', async () => {
    const root = await temporaryRoot('agentwolf-trae-foundation-')
    const workspace = await playerWorkspace(root)
    const ambientSkill = resolve(root, '.agents', 'skills', 'coding-agent', 'SKILL.md')
    await mkdir(resolve(root, '.agents', 'skills', 'coding-agent'), { recursive: true })
    await writeFile(ambientSkill, 'CODING SKILL\n', 'utf8')
    const hostHome = resolve(root, 'host-trae')
    await mkdir(resolve(hostHome, 'cli'), { recursive: true })
    await writeFile(resolve(hostHome, 'cli', 'auth.json'), '{"credential":"fixture"}\n', 'utf8')
    await writeFile(resolve(hostHome, 'traecli.toml'), 'coding = true\n', 'utf8')
    const tool = builtInAgentTools().find((entry) => entry.kind === 'trae-cli')!

    const prepared = await preparePlayerProviderSession({
      tool,
      workspace,
      modelInstructions: 'PLAYER FOUNDATION',
      isolation: { hostHomes: { 'trae-cli': hostHome } },
    })

    const isolatedHome = resolve(workspace, '.provider-homes', 'trae')
    expect(prepared.launch.env['TRAE_HOME']).toBe(isolatedHome)
    expect(await realpath(resolve(isolatedHome, 'cli', 'auth.json'))).toBe(
      await realpath(resolve(hostHome, 'cli', 'auth.json')),
    )
    await expect(readFile(resolve(isolatedHome, 'traecli.toml'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    })
    expect(prepared.launch.args).toContain('skills.include_instructions=true')
    const skillConfig = prepared.launch.args.find((arg) => arg.startsWith('skills.config=['))!
    expect(skillConfig).toContain(ambientSkill)
    expect(skillConfig).not.toContain(
      resolve(workspace, '.agents', 'skills', 'agentwolf-player', 'SKILL.md'),
    )
    expect(prepared.launch.args).toContain(
      `model_instructions_file=${JSON.stringify(resolve(workspace, '.agentwolf', 'foundation.md'))}`,
    )
    expect(await readFile(resolve(workspace, '.agentwolf', 'foundation.md'), 'utf8')).toBe(
      'PLAYER FOUNDATION',
    )
  })

  it('gives Codex a Match-owned home with only the host login credential', async () => {
    const root = await temporaryRoot('agentwolf-codex-isolation-')
    const workspace = await playerWorkspace(root)
    const hostHome = resolve(root, 'host-codex')
    await mkdir(hostHome, { recursive: true })
    await writeFile(resolve(hostHome, 'auth.json'), '{"credential":"fixture"}\n', 'utf8')
    await writeFile(resolve(hostHome, 'AGENTS.md'), 'CODING INSTRUCTIONS\n', 'utf8')
    const ambientSkill = resolve(root, '.agents', 'skills', 'coding-agent', 'SKILL.md')
    await mkdir(resolve(root, '.agents', 'skills', 'coding-agent'), { recursive: true })
    await writeFile(ambientSkill, 'CODING SKILL\n', 'utf8')
    const tool = builtInAgentTools().find((entry) => entry.kind === 'codex')!

    const prepared = await preparePlayerProviderSession({
      tool,
      workspace,
      modelInstructions: 'PLAYER FOUNDATION',
      isolation: { hostHomes: { codex: hostHome } },
    })

    const isolatedHome = resolve(workspace, '.provider-homes', 'codex')
    expect(prepared.cwd).toBe(workspace)
    expect(prepared.launch.env['CODEX_HOME']).toBe(isolatedHome)
    expect(await readFile(resolve(workspace, '.agentwolf', 'foundation.md'), 'utf8')).toBe(
      'PLAYER FOUNDATION',
    )
    const codexConfig = JSON.parse(prepared.launch.env['CODEX_CONFIG']!) as {
      model_instructions_file: string
      skills: {
        include_instructions: boolean
        config: Array<{ path: string; enabled: boolean }>
      }
    }
    expect(codexConfig).toMatchObject({
      model_instructions_file: resolve(workspace, '.agentwolf', 'foundation.md'),
      skills: { include_instructions: true },
    })
    expect(codexConfig.skills.config).toContainEqual({ path: ambientSkill, enabled: false })
    expect(await realpath(resolve(isolatedHome, 'auth.json'))).toBe(
      await realpath(resolve(hostHome, 'auth.json')),
    )
    await expect(readFile(resolve(isolatedHome, 'AGENTS.md'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('keeps an empty isolated Codex home when the host has no login credential', async () => {
    const root = await temporaryRoot('agentwolf-codex-empty-home-')
    const workspace = await playerWorkspace(root)
    const hostHome = resolve(root, 'host-codex')
    await mkdir(hostHome, { recursive: true })
    const tool = builtInAgentTools().find((entry) => entry.kind === 'codex')!

    await preparePlayerProviderSession({
      tool,
      workspace,
      modelInstructions: 'PLAYER FOUNDATION',
      isolation: { hostHomes: { codex: hostHome } },
    })

    const isolatedHome = resolve(workspace, '.provider-homes', 'codex')
    expect((await lstat(isolatedHome)).isDirectory()).toBe(true)
    await expect(realpath(resolve(isolatedHome, 'auth.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('resolves a Provider host home from the Tool launch environment', async () => {
    const root = await temporaryRoot('agentwolf-codex-tool-home-')
    const workspace = await playerWorkspace(root)
    const hostHome = resolve(root, 'host-codex')
    await mkdir(hostHome, { recursive: true })
    await writeFile(resolve(hostHome, 'auth.json'), '{"credential":"fixture"}\n', 'utf8')
    const builtIn = builtInAgentTools().find((entry) => entry.kind === 'codex')!
    const tool = AgentToolSchema.parse({
      ...builtIn,
      environment: {
        ...builtIn.environment,
        CODEX_HOME: { source: 'literal', value: hostHome, secret: false },
      },
    })

    await preparePlayerProviderSession({
      tool,
      workspace,
      modelInstructions: 'PLAYER FOUNDATION',
    })

    expect(await realpath(resolve(workspace, '.provider-homes', 'codex', 'auth.json'))).toBe(
      await realpath(resolve(hostHome, 'auth.json')),
    )
  })

  it('runs CodeBuddy from an instruction-free detached cwd and isolated config home', async () => {
    const root = await temporaryRoot('agentwolf-codebuddy-isolation-')
    const workspace = await playerWorkspace(root)
    const hostHome = resolve(root, 'host-codebuddy')
    const hostStorage = resolve(hostHome, 'local_storage')
    const isolationRoot = resolve(root, 'detached')
    await mkdir(hostStorage, { recursive: true })
    await writeFile(resolve(hostStorage, 'credential.info'), 'fixture\n', 'utf8')
    await writeFile(resolve(hostHome, 'CODEBUDDY.md'), 'CODING INSTRUCTIONS\n', 'utf8')
    const tool = builtInAgentTools().find((entry) => entry.kind === 'codebuddy')!

    const prepared = await preparePlayerProviderSession({
      tool,
      workspace,
      modelInstructions: 'PLAYER FOUNDATION',
      isolation: { hostHomes: { codebuddy: hostHome }, isolationRoot },
    })

    const isolatedHome = resolve(workspace, '.provider-homes', 'codebuddy')
    expect(prepared.cwd).toBe(playerIsolationWorkspace(workspace, isolationRoot))
    expect(prepared.cwd.startsWith(workspace)).toBe(false)
    expect(await realpath(resolve(prepared.cwd, '.agents'))).toBe(
      await realpath(resolve(workspace, '.agents')),
    )
    expect(await realpath(resolve(prepared.cwd, '.codebuddy'))).toBe(
      await realpath(resolve(workspace, '.codebuddy')),
    )
    expect(prepared.launch.env['CODEBUDDY_CONFIG_DIR']).toBe(isolatedHome)
    expect(prepared.launch.args[prepared.launch.args.indexOf('--setting-sources') + 1]).toBe(
      'project',
    )
    expect(prepared.launch.args[prepared.launch.args.indexOf('--system-prompt-file') + 1]).toBe(
      resolve(workspace, '.agentwolf', 'foundation.md'),
    )
    expect(prepared.launch.env['CODEBUDDY_DISABLE_IDE']).toBe('1')
    expect(await realpath(resolve(isolatedHome, 'local_storage'))).toBe(await realpath(hostStorage))
    await expect(readFile(resolve(isolatedHome, 'CODEBUDDY.md'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    })

    const repeated = await preparePlayerProviderSession({
      tool,
      workspace,
      modelInstructions: 'CURRENT STATE MUST NOT REPLACE FOUNDATION',
      isolation: { hostHomes: { codebuddy: hostHome }, isolationRoot },
    })
    expect(repeated.cwd).toBe(prepared.cwd)
    expect(repeated.modelInstructions).toBe('PLAYER FOUNDATION')
    expect(await readFile(resolve(workspace, '.agentwolf', 'foundation.md'), 'utf8')).toBe(
      'PLAYER FOUNDATION',
    )
    expect(await realpath(resolve(repeated.cwd, '.agents'))).toBe(
      await realpath(resolve(workspace, '.agents')),
    )

    await rm(resolve(prepared.cwd, '.agents'))
    await mkdir(resolve(prepared.cwd, '.agents'))
    const repaired = await preparePlayerProviderSession({
      tool,
      workspace,
      modelInstructions: 'PLAYER FOUNDATION',
      isolation: { hostHomes: { codebuddy: hostHome }, isolationRoot },
    })
    expect((await lstat(resolve(repaired.cwd, '.agents'))).isSymbolicLink()).toBe(true)
    expect(await realpath(resolve(repaired.cwd, '.agents'))).toBe(
      await realpath(resolve(workspace, '.agents')),
    )

    await removePlayerIsolationWorkspace(workspace, isolationRoot)
    await expect(realpath(prepared.cwd)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('physically removes owned Provider Session state without touching host credentials', async () => {
    const root = await temporaryRoot('agentwolf-provider-session-cleanup-')
    const workspace = await playerWorkspace(root)
    const hostHome = resolve(root, 'host-codebuddy')
    const hostStorage = resolve(hostHome, 'local_storage')
    const isolationRoot = resolve(root, 'detached')
    await mkdir(hostStorage, { recursive: true })
    await writeFile(resolve(hostStorage, 'credential.info'), 'fixture\n', 'utf8')
    const tool = builtInAgentTools().find((entry) => entry.kind === 'codebuddy')!
    const prepared = await preparePlayerProviderSession({
      tool,
      workspace,
      modelInstructions: 'PLAYER FOUNDATION',
      isolation: { hostHomes: { codebuddy: hostHome }, isolationRoot },
    })
    const isolatedHome = resolve(workspace, '.provider-homes', 'codebuddy')
    await mkdir(resolve(isolatedHome, 'projects', 'player-session'), { recursive: true })
    await writeFile(
      resolve(isolatedHome, 'projects', 'player-session', 'session-owned.jsonl'),
      'SESSION DATA\n',
      'utf8',
    )

    await expect(
      deletePlayerProviderSession({
        tool,
        workspace,
        sessionId: '01a065d0-3333-7333-8333-333333333333',
        isolation: { hostHomes: { codebuddy: hostHome }, isolationRoot },
      }),
    ).resolves.toBe('owned-state-deleted')
    await expect(lstat(isolatedHome)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(resolve(hostStorage, 'credential.info'), 'utf8')).toBe('fixture\n')

    await cleanupPlayerProviderResources(workspace, { isolation: { isolationRoot } })
    await expect(lstat(prepared.cwd)).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await lstat(workspace)).isDirectory()).toBe(true)
  })

  it('routes Codex-family host cleanup to each configured Agent home', async () => {
    const root = await temporaryRoot('agentwolf-provider-host-cleanup-')
    const workspace = await playerWorkspace(root)
    const sessionId = '01a065d0-4444-7444-8444-444444444444'
    for (const input of [
      { kind: 'codex' as const, id: 'codex', suffix: '' },
      { kind: 'trae-cli' as const, id: 'trae-cli', suffix: 'cli' },
    ]) {
      const hostHome = resolve(root, `host-${input.id}`)
      const storageRoot = input.suffix ? resolve(hostHome, input.suffix) : hostHome
      await mkdir(storageRoot, { recursive: true })
      const index = resolve(storageRoot, 'session_index.jsonl')
      await writeFile(index, `${JSON.stringify({ id: sessionId })}\n`, 'utf8')
      const tool = builtInAgentTools().find((entry) => entry.kind === input.kind)!
      const adapter = defaultPlayerProviderRegistry.resolve(tool)

      await adapter.state.deleteHostSessions([
        {
          tool,
          canonicalWorkspace: workspace,
          runtimeWorkspace: workspace,
          baseLaunch: resolveLaunchSpec(tool),
          isolation: { hostHomes: { [input.id]: hostHome } },
          modelInstructions: { path: resolve(workspace, 'foundation.md'), text: '' },
          sessionId,
        },
      ])

      expect(await readFile(index, 'utf8')).toBe('')
    }
  })

  it('creates and removes the default detached workspace by its exact Match workspace digest', async () => {
    const root = await temporaryRoot('agentwolf-default-isolation-')
    const workspace = await playerWorkspace(root)
    const tool = builtInAgentTools().find((entry) => entry.kind === 'claude')!

    const prepared = await preparePlayerProviderSession({
      tool,
      workspace,
      modelInstructions: 'PLAYER FOUNDATION',
    })

    expect(prepared.cwd).toBe(playerIsolationWorkspace(workspace))
    await removePlayerIsolationWorkspace(workspace)
    await expect(realpath(prepared.cwd)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects a detached CodeBuddy root that inherits an instruction file', async () => {
    const root = await temporaryRoot('agentwolf-codebuddy-parent-')
    const workspace = await playerWorkspace(root)
    const isolationRoot = resolve(root, 'detached')
    await mkdir(isolationRoot, { recursive: true })
    await writeFile(resolve(root, 'AGENTS.md'), 'ambient coding instructions\n', 'utf8')
    const tool = builtInAgentTools().find((entry) => entry.kind === 'codebuddy')!

    await expect(
      preparePlayerProviderSession({
        tool,
        workspace,
        modelInstructions: 'PLAYER FOUNDATION',
        isolation: { isolationRoot },
      }),
    ).rejects.toThrow(/inherits model instructions/)
  })

  it('rejects empty or symlinked primary model instructions', async () => {
    const root = await temporaryRoot('agentwolf-primary-instructions-')
    const workspace = await playerWorkspace(root)
    const tool = builtInAgentTools().find((entry) => entry.kind === 'trae-cli')!

    await expect(
      preparePlayerProviderSession({ tool, workspace, modelInstructions: '   ' }),
    ).rejects.toThrow(/must not be empty/)

    const external = resolve(root, 'external-foundation.md')
    await writeFile(external, 'EXTERNAL', 'utf8')
    await mkdir(resolve(workspace, '.agentwolf'), { recursive: true })
    await symlink(external, resolve(workspace, '.agentwolf', 'foundation.md'))
    await expect(
      preparePlayerProviderSession({ tool, workspace, modelInstructions: 'PLAYER FOUNDATION' }),
    ).rejects.toThrow(/must be a regular file/)
  })
})

async function temporaryRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), prefix))
  roots.push(root)
  return root
}

async function playerWorkspace(root: string): Promise<string> {
  const workspace = resolve(root, 'canonical-player-workspace')
  await mkdir(resolve(workspace, '.agents', 'skills', 'agentwolf-player'), { recursive: true })
  await mkdir(resolve(workspace, '.claude', 'skills'), { recursive: true })
  await mkdir(resolve(workspace, '.codebuddy', 'skills'), { recursive: true })
  await writeFile(
    resolve(workspace, '.agents', 'skills', 'agentwolf-player', 'SKILL.md'),
    'PLAYER CONTRACT\n',
    'utf8',
  )
  return workspace
}
