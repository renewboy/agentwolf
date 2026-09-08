import { access, mkdir, symlink } from 'node:fs/promises'
import { resolve } from 'node:path'

const requiredSkillNames = ['agentwolf-player', 'werewolf-strategy'] as const

export async function linkPlayerSkills(options: {
  readonly dataDirectory: string
  readonly sourceRoot?: string
}): Promise<string> {
  if (!options.sourceRoot) throw new Error('Simulation requires a Player Skill source root')
  const sourceRoot = resolve(options.sourceRoot)
  for (const name of requiredSkillNames) {
    try {
      await access(resolve(sourceRoot, name, 'SKILL.md'))
    } catch (error) {
      throw new Error(`Missing Player Skill source ${name}/SKILL.md under ${sourceRoot}`, {
        cause: error,
      })
    }
  }
  const outputRoot = resolve(options.dataDirectory, 'skills')
  await mkdir(options.dataDirectory, { recursive: true })
  await symlink(sourceRoot, outputRoot, process.platform === 'win32' ? 'junction' : 'dir')
  return outputRoot
}
