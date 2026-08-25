import { access, cp, lstat, mkdir, rm } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface CopyPlayerSkillsOptions {
  readonly dataDirectory: string
  readonly sourceRoot?: string
}

export function resolvePlayerSkillSourceRoot(input?: string): string {
  return resolve(input ?? fileURLToPath(new URL('../player-skills', import.meta.url)))
}

export async function ensurePlayerSkills(options: CopyPlayerSkillsOptions): Promise<string> {
  const outputRoot = resolve(options.dataDirectory, 'skills')
  try {
    await Promise.all(
      ['agentwolf-player', 'werewolf-strategy'].map((name) =>
        access(resolve(outputRoot, name, 'SKILL.md')),
      ),
    )
    return outputRoot
  } catch {
    return copyPlayerSkills(options)
  }
}

export async function copyPlayerSkills(options: CopyPlayerSkillsOptions): Promise<string> {
  const sourceRoot = resolvePlayerSkillSourceRoot(options.sourceRoot)
  await requireSkillSource(sourceRoot, 'agentwolf-player')
  await requireSkillSource(sourceRoot, 'werewolf-strategy')

  const dataDirectory = resolve(options.dataDirectory)
  const outputRoot = resolve(dataDirectory, 'skills')
  await mkdir(dataDirectory, { recursive: true })
  await rm(outputRoot, { recursive: true, force: true })
  await cp(sourceRoot, outputRoot, {
    recursive: true,
    force: false,
    errorOnExist: true,
    filter: async (sourcePath) => {
      if ((await lstat(sourcePath)).isSymbolicLink()) {
        throw new Error(`Player Skill sources cannot contain symlinks: ${sourcePath}`)
      }
      return true
    },
  })
  return outputRoot
}

async function requireSkillSource(root: string, name: string): Promise<void> {
  const entry = resolve(root, name, 'SKILL.md')
  const localPath = relative(root, entry)
  if (localPath.startsWith('..') || dirname(localPath) !== name) {
    throw new Error(`Invalid Player Skill source path: ${entry}`)
  }
  try {
    if (!(await lstat(entry)).isFile()) throw new Error('not a file')
  } catch (error) {
    throw new Error(`Missing Player Skill source ${name}/SKILL.md under ${root}`, {
      cause: error,
    })
  }
}
