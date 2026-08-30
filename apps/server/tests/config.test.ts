import { access, lstat, mkdtemp, readFile, readdir, readlink, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { MatchIdSchema, MatchSetupSnapshotSchema, PlayerIdSchema } from '@agentwolf/contracts'
import { copyPlayerSkills } from '@agentwolf/assets/player-skills'
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
    const builtSkills = await copyPlayerSkills({
      dataDirectory,
      sourceRoot: resolve(repositoryRoot, 'packages/assets/player-skills'),
    })
    expect(
      (await readdir(dataDirectory)).filter((name) => name.startsWith('.skills-build-')),
    ).toEqual([])
    const workspace = await preparePlayerWorkspace(
      dataDirectory,
      MatchIdSchema.parse('match-config-test'),
      PlayerIdSchema.parse('player-1'),
    )
    await access(resolve(workspace, '.agents/skills/agentwolf-player/SKILL.md'))
    await access(resolve(workspace, '.claude/skills/agentwolf-player/SKILL.md'))
    await access(resolve(workspace, '.trae/skills/werewolf-strategy/SKILL.md'))
    const builtSkillsRealPath = await realpath(builtSkills)
    for (const directory of ['.agents', '.claude', '.trae']) {
      const linkPath = resolve(workspace, directory, 'skills')
      expect((await lstat(linkPath)).isSymbolicLink()).toBe(true)
      expect((await readlink(linkPath)).startsWith('/')).toBe(false)
      expect(await realpath(linkPath)).toBe(builtSkillsRealPath)
    }
    const expectedContract = `${loadPromptCore().playerContract()}\n`
    expect(
      await readFile(resolve(workspace, '.agents/skills/agentwolf-player/SKILL.md'), 'utf8'),
    ).toBe(expectedContract)
    expect(
      await readFile(resolve(workspace, '.claude/skills/agentwolf-player/SKILL.md'), 'utf8'),
    ).toBe(expectedContract)
    expect(
      await readFile(
        resolve(workspace, '.agents/skills/werewolf-strategy/references/articles/2023080801.md'),
        'utf8',
      ),
    ).toBe(
      await readFile(
        resolve(
          repositoryRoot,
          'packages/assets/player-skills/werewolf-strategy/references/articles/2023080801.md',
        ),
        'utf8',
      ),
    )
  })

  it('enables developer mode only through an explicit loopback startup setting', () => {
    expect(loadServerConfig({ AGENTWOLF_DEVELOPER_MODE: 'true' }).developerMode).toBe(true)
    expect(loadServerConfig({}).developerMode).toBe(false)
    expect(() =>
      loadServerConfig({ AGENTWOLF_DEVELOPER_MODE: 'true', AGENTWOLF_HOST: '0.0.0.0' }),
    ).toThrow(/loopback/)
    expect(() => loadServerConfig({ AGENTWOLF_DEVELOPER_MODE: '1' })).toThrow(/true or false/)
  })

  it('selects the public speech interrupt rollout mode from startup configuration', () => {
    expect(loadServerConfig({}).publicSpeechInterruptMode).toBe('legacy')
    expect(
      loadServerConfig({ AGENTWOLF_PUBLIC_SPEECH_INTERRUPT_MODE: 'rolling' })
        .publicSpeechInterruptMode,
    ).toBe('rolling')
    expect(() => loadServerConfig({ AGENTWOLF_PUBLIC_SPEECH_INTERRUPT_MODE: 'invalid' })).toThrow()
  })

  it('keeps historical Match setup snapshots on legacy interrupt orchestration', () => {
    const setup = MatchSetupSnapshotSchema.parse({
      boardId: 'board-config-legacy',
      roleAssignment: 'random',
      speechCharacterLimit: 300,
      seats: Array.from({ length: 6 }, (_, index) => ({
        seat: index + 1,
        name: `Legacy player ${index + 1}`,
        profileId: `profile-config-${index + 1}`,
        character: null,
      })),
    })

    expect(setup.publicSpeechInterruptMode).toBe('legacy')
  })
})
