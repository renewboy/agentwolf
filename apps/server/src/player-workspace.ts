import { access, lstat, mkdir, readdir, readlink, realpath, rm, symlink } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { cleanupPlayerProviderWorkspaces } from '@agentwolf/acp'
import type { MatchId, PlayerId } from '@agentwolf/contracts'

const playerSkillNames = ['agentwolf-player', 'werewolf-strategy'] as const

export async function preparePlayerWorkspace(
  dataDirectory: string,
  matchId: MatchId,
  playerId: PlayerId,
): Promise<string> {
  const sharedSkills = await requireBuiltPlayerSkills(dataDirectory)
  const workspace = resolve(dataDirectory, 'matches', matchId, 'players', playerId, 'workspace')
  await mkdir(workspace, { recursive: true })
  await Promise.all(
    ['.agents', '.claude', '.trae', '.codebuddy'].map((directory) =>
      ensureRelativeDirectoryLink(resolve(workspace, directory, 'skills'), sharedSkills),
    ),
  )
  return workspace
}

export async function removeMatchPlayerWorkspaces(
  dataDirectory: string,
  matchId: MatchId,
): Promise<void> {
  const matchesRoot = resolve(dataDirectory, 'matches')
  const matchRoot = resolve(matchesRoot, matchId)
  const localPath = relative(matchesRoot, matchRoot)
  if (localPath !== matchId || localPath.startsWith('..')) {
    throw new Error(`Invalid Match workspace path: ${matchRoot}`)
  }
  const playersRoot = resolve(matchRoot, 'players')
  try {
    const players = await readdir(playersRoot, { withFileTypes: true })
    await Promise.all(
      players
        .filter((entry) => entry.isDirectory())
        .map((entry) =>
          cleanupPlayerProviderWorkspaces(resolve(playersRoot, entry.name, 'workspace')),
        ),
    )
  } catch (error) {
    if (!isMissingPath(error)) throw error
  }
  await rm(matchRoot, { recursive: true, force: true })
}

async function requireBuiltPlayerSkills(dataDirectory: string): Promise<string> {
  const root = resolve(dataDirectory, 'skills')
  for (const name of playerSkillNames) {
    try {
      await access(resolve(root, name, 'SKILL.md'))
    } catch (error) {
      throw new Error(`Player Skills have not been built under ${root}`, { cause: error })
    }
  }
  return realpath(root)
}

async function ensureRelativeDirectoryLink(linkPath: string, targetPath: string): Promise<void> {
  await mkdir(dirname(linkPath), { recursive: true })
  const relativeTarget = relative(await realpath(dirname(linkPath)), targetPath)
  try {
    const status = await lstat(linkPath)
    if (
      status.isSymbolicLink() &&
      (await readlink(linkPath)) === relativeTarget &&
      (await realpath(linkPath)) === targetPath
    ) {
      return
    }
    await rm(linkPath, { recursive: true, force: true })
  } catch (error) {
    if (!isMissingPath(error)) throw error
  }
  await symlink(relativeTarget, linkPath, 'dir')
  if ((await realpath(linkPath)) !== targetPath) {
    await rm(linkPath, { force: true })
    throw new Error(`Player Skill link does not resolve to ${targetPath}`)
  }
}

function isMissingPath(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}
