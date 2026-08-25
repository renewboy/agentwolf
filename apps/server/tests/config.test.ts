import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { MatchIdSchema, PlayerIdSchema } from '@agentwolf/contracts'
import { loadPromptCore } from '@agentwolf/assets/prompts'
import { afterEach, describe, expect, it } from 'vitest'
import { loadServerConfig } from '../src/config.js'
import { preparePlayerWorkspace } from '../src/player-workspace.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  )
})

describe('server project root', () => {
  it('finds the workspace root when the server starts from its package directory', async () => {
    const repositoryRoot = process.cwd()
    const config = loadServerConfig({}, resolve(repositoryRoot, 'apps/server'))
    expect(config.projectRoot).toBe(repositoryRoot)
    expect(config.webDistPath).toBe(resolve(repositoryRoot, 'apps/web/dist'))

    const dataDirectory = await mkdtemp(resolve(tmpdir(), 'agentwolf-workspace-'))
    temporaryDirectories.push(dataDirectory)
    const workspace = await preparePlayerWorkspace(
      dataDirectory,
      config.projectRoot,
      MatchIdSchema.parse('match-config-test'),
      PlayerIdSchema.parse('player-1'),
    )
    await access(resolve(workspace, '.agents/skills/agentwolf-player/SKILL.md'))
    await access(resolve(workspace, '.claude/skills/agentwolf-player/SKILL.md'))
    const expectedContract = `${loadPromptCore().playerContract()}\n`
    expect(
      await readFile(resolve(workspace, '.agents/skills/agentwolf-player/SKILL.md'), 'utf8'),
    ).toBe(expectedContract)
    expect(
      await readFile(resolve(workspace, '.claude/skills/agentwolf-player/SKILL.md'), 'utf8'),
    ).toBe(expectedContract)
  })

  it('enables developer mode only through an explicit loopback startup setting', () => {
    expect(loadServerConfig({ AGENTWOLF_DEVELOPER_MODE: 'true' }).developerMode).toBe(true)
    expect(loadServerConfig({}).developerMode).toBe(false)
    expect(() =>
      loadServerConfig({ AGENTWOLF_DEVELOPER_MODE: 'true', AGENTWOLF_HOST: '0.0.0.0' }),
    ).toThrow(/loopback/)
    expect(() => loadServerConfig({ AGENTWOLF_DEVELOPER_MODE: '1' })).toThrow(/true or false/)
  })
})
