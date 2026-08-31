import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { AgentToolSchema } from '@agentwolf/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import {
  builtInAgentTools,
  playerIsolationWorkspace,
  preparePlayerProviderSession,
  removePlayerIsolationWorkspace,
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
      playerContract: 'PLAYER CONTRACT',
      isolation: { isolationRoot },
    })

    expect(prepared.cwd).toBe(playerIsolationWorkspace(workspace, isolationRoot))
    expect(await realpath(resolve(prepared.cwd, '.agents'))).toBe(
      await realpath(resolve(workspace, '.agents')),
    )
    expect(await realpath(resolve(prepared.cwd, '.claude'))).toBe(
      await realpath(resolve(workspace, '.claude')),
    )
  })

  it('gives Codex a Match-owned home with only the host login credential', async () => {
    const root = await temporaryRoot('agentwolf-codex-isolation-')
    const workspace = await playerWorkspace(root)
    const hostHome = resolve(root, 'host-codex')
    await mkdir(hostHome, { recursive: true })
    await writeFile(resolve(hostHome, 'auth.json'), '{"credential":"fixture"}\n', 'utf8')
    await writeFile(resolve(hostHome, 'AGENTS.md'), 'CODING INSTRUCTIONS\n', 'utf8')
    const tool = builtInAgentTools().find((entry) => entry.kind === 'codex')!

    const prepared = await preparePlayerProviderSession({
      tool,
      workspace,
      playerContract: 'PLAYER CONTRACT',
      isolation: { hostHomes: { codex: hostHome } },
    })

    const isolatedHome = resolve(workspace, '.provider-homes', 'codex')
    expect(prepared.cwd).toBe(workspace)
    expect(prepared.launch.env['CODEX_HOME']).toBe(isolatedHome)
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
      playerContract: 'PLAYER CONTRACT',
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
      playerContract: 'PLAYER CONTRACT',
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
      playerContract: 'PLAYER CONTRACT',
      isolation: { hostHomes: { codebuddy: hostHome }, isolationRoot },
    })

    const isolatedHome = resolve(workspace, '.provider-homes', 'codebuddy')
    expect(prepared.cwd).toBe(playerIsolationWorkspace(workspace, isolationRoot))
    expect(prepared.cwd.startsWith(workspace)).toBe(false)
    expect(await realpath(resolve(prepared.cwd, '.agents'))).toBe(
      await realpath(resolve(workspace, '.agents')),
    )
    expect(prepared.launch.env['CODEBUDDY_CONFIG_DIR']).toBe(isolatedHome)
    expect(prepared.launch.env['CODEBUDDY_DISABLE_IDE']).toBe('1')
    expect(await realpath(resolve(isolatedHome, 'local_storage'))).toBe(await realpath(hostStorage))
    await expect(readFile(resolve(isolatedHome, 'CODEBUDDY.md'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    })

    const repeated = await preparePlayerProviderSession({
      tool,
      workspace,
      playerContract: 'PLAYER CONTRACT',
      isolation: { hostHomes: { codebuddy: hostHome }, isolationRoot },
    })
    expect(repeated.cwd).toBe(prepared.cwd)
    expect(await realpath(resolve(repeated.cwd, '.agents'))).toBe(
      await realpath(resolve(workspace, '.agents')),
    )

    await rm(resolve(prepared.cwd, '.agents'))
    await mkdir(resolve(prepared.cwd, '.agents'))
    const repaired = await preparePlayerProviderSession({
      tool,
      workspace,
      playerContract: 'PLAYER CONTRACT',
      isolation: { hostHomes: { codebuddy: hostHome }, isolationRoot },
    })
    expect((await lstat(resolve(repaired.cwd, '.agents'))).isSymbolicLink()).toBe(true)
    expect(await realpath(resolve(repaired.cwd, '.agents'))).toBe(
      await realpath(resolve(workspace, '.agents')),
    )

    await removePlayerIsolationWorkspace(workspace, isolationRoot)
    await expect(realpath(prepared.cwd)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('creates and removes the default detached workspace by its exact Match workspace digest', async () => {
    const root = await temporaryRoot('agentwolf-default-isolation-')
    const workspace = await playerWorkspace(root)
    const tool = builtInAgentTools().find((entry) => entry.kind === 'claude')!

    const prepared = await preparePlayerProviderSession({
      tool,
      workspace,
      playerContract: 'PLAYER CONTRACT',
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
        playerContract: 'PLAYER CONTRACT',
        isolation: { isolationRoot },
      }),
    ).rejects.toThrow(/inherits model instructions/)
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
  await writeFile(
    resolve(workspace, '.agents', 'skills', 'agentwolf-player', 'SKILL.md'),
    'PLAYER CONTRACT\n',
    'utf8',
  )
  return workspace
}
