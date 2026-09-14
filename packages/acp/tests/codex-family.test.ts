import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve, sep } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  isolatedSkillConfig,
  isolatedSkillConfigToml,
} from '../src/player-providers/codex-family.js'

const roots: string[] = []
type DisabledSkill = { path: string; enabled: boolean }

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('Codex-family ambient Skill isolation', () => {
  it('disables directory and linked Skills but ignores non-Skills and missing roots', async () => {
    const root = await temporaryRoot()
    const skillRoot = resolve(root, 'skills')
    const first = await writeSkill(skillRoot, 'a-skill')
    const last = await writeSkill(skillRoot, 'z-skill')
    const linked = resolve(skillRoot, 'linked-skill')
    const ordinaryFile = resolve(skillRoot, 'plain-file')
    await symlink(dirname(first), linked, 'dir')
    await symlink(resolve(root, 'missing-target'), resolve(skillRoot, 'broken-link'), 'dir')
    await mkdir(resolve(skillRoot, 'without-manifest'))
    await writeFile(ordinaryFile, 'not a Skill directory\n', 'utf8')
    const additionalRoots = [skillRoot, skillRoot, ordinaryFile, resolve(root, 'missing-root')]

    const config = isolatedSkillConfig(additionalRoots)
    const entries = config['config'] as DisabledSkill[]
    expect(config).toMatchObject({
      include_instructions: true,
      bundled: { enabled: false },
    })
    expect(entries.filter((entry) => entry.path.startsWith(skillRoot + sep))).toEqual(
      [first, last, resolve(linked, 'SKILL.md')].sort().map((path) => ({ path, enabled: false })),
    )
    expect(isolatedSkillConfigToml(additionalRoots)).toBe(asToml(entries))
  })

  it('isolates ancestor Skills without disabling the workspace-owned player Skill', async () => {
    const root = await temporaryRoot()
    const parent = resolve(root, 'team')
    const workspace = resolve(parent, 'player')
    const ownSkill = await writeSkill(resolve(workspace, '.agents', 'skills'), 'agentwolf-player')
    const expected = await Promise.all(
      ['.agents', '.trae', '.codex'].map((provider) =>
        writeSkill(resolve(parent, provider, 'skills'), 'parent-skill'),
      ),
    )
    expected.push(await writeSkill(resolve(root, '.agents', 'skills'), 'grandparent-skill'))

    const entries = isolatedSkillConfig([], workspace)['config'] as DisabledSkill[]
    expect(entries.filter((entry) => entry.path.startsWith(root + sep))).toEqual(
      expected.sort().map((path) => ({ path, enabled: false })),
    )
    expect(entries.map((entry) => entry.path)).not.toContain(ownSkill)
    expect(isolatedSkillConfigToml([], workspace)).toBe(asToml(entries))
  })

  it('supports default roots without a workspace in both configuration formats', () => {
    const config = isolatedSkillConfig()
    const entries = config['config'] as DisabledSkill[]
    expect(config).toMatchObject({
      include_instructions: true,
      bundled: { enabled: false },
      config: expect.any(Array),
    })
    expect(entries.every((entry) => entry.enabled === false)).toBe(true)
    expect(isolatedSkillConfigToml()).toBe(asToml(entries))
  })
})

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-codex-skills-'))
  roots.push(root)
  return root
}

async function writeSkill(root: string, name: string): Promise<string> {
  const directory = resolve(root, name)
  await mkdir(directory, { recursive: true })
  const path = resolve(directory, 'SKILL.md')
  await writeFile(path, '# Fixture Skill\n', 'utf8')
  return path
}

function asToml(entries: readonly DisabledSkill[]): string {
  const values = entries.map(({ path }) => `{ path=${JSON.stringify(path)}, enabled=false }`)
  return `skills.config=[${values.join(',')}]`
}
