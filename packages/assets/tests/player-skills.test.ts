import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  copyPlayerSkills,
  ensurePlayerSkills,
  resolvePlayerSkillSourceRoot,
} from '../src/player-skills.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-player-skills-'))
  roots.push(root)
  const sourceRoot = resolve(root, 'source')
  for (const name of ['agentwolf-player', 'werewolf-strategy']) {
    await mkdir(resolve(sourceRoot, name), { recursive: true })
    await writeFile(resolve(sourceRoot, name, 'SKILL.md'), `# ${name}\n`)
  }
  return { root, sourceRoot, dataDirectory: resolve(root, 'data') }
}

describe('player Skill copies', () => {
  it('resolves default/custom roots, copies sources, and reuses a complete output', async () => {
    expect(resolvePlayerSkillSourceRoot()).toContain('packages/assets/player-skills')
    expect(resolvePlayerSkillSourceRoot('./relative')).toBe(resolve('./relative'))
    const { sourceRoot, dataDirectory } = await fixture()
    const first = await ensurePlayerSkills({ dataDirectory, sourceRoot })
    expect(await readFile(resolve(first, 'agentwolf-player', 'SKILL.md'), 'utf8')).toContain(
      'agentwolf-player',
    )
    await writeFile(resolve(first, 'marker'), 'keep')
    expect(await ensurePlayerSkills({ dataDirectory, sourceRoot })).toBe(first)
    expect(await readFile(resolve(first, 'marker'), 'utf8')).toBe('keep')
    expect(await copyPlayerSkills({ dataDirectory, sourceRoot })).toBe(first)
    await expect(readFile(resolve(first, 'marker'), 'utf8')).rejects.toThrow()
  })

  it('rejects missing, non-file, and symlinked Skill sources', async () => {
    const { root, sourceRoot, dataDirectory } = await fixture()
    await rm(resolve(sourceRoot, 'werewolf-strategy', 'SKILL.md'))
    await expect(copyPlayerSkills({ dataDirectory, sourceRoot })).rejects.toThrow(
      /Missing Player Skill source/,
    )

    await mkdir(resolve(sourceRoot, 'werewolf-strategy', 'SKILL.md'))
    await expect(copyPlayerSkills({ dataDirectory, sourceRoot })).rejects.toThrow(
      /Missing Player Skill source/,
    )

    await rm(resolve(sourceRoot, 'werewolf-strategy', 'SKILL.md'), { recursive: true })
    await writeFile(resolve(sourceRoot, 'werewolf-strategy', 'SKILL.md'), '# restored')
    await symlink(
      resolve(sourceRoot, 'agentwolf-player', 'SKILL.md'),
      resolve(sourceRoot, 'agentwolf-player', 'linked.md'),
    )
    await expect(
      copyPlayerSkills({ dataDirectory: resolve(root, 'symlink-data'), sourceRoot }),
    ).rejects.toThrow(/cannot contain symlinks/)
  })

  it('repairs an incomplete existing output through ensure', async () => {
    const { sourceRoot, dataDirectory } = await fixture()
    await mkdir(resolve(dataDirectory, 'skills', 'agentwolf-player'), { recursive: true })
    await writeFile(resolve(dataDirectory, 'skills', 'agentwolf-player', 'SKILL.md'), '# partial')
    const output = await ensurePlayerSkills({ dataDirectory, sourceRoot })
    expect(await readFile(resolve(output, 'werewolf-strategy', 'SKILL.md'), 'utf8')).toContain(
      'werewolf-strategy',
    )
  })
})
