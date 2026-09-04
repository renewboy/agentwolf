import { createHash } from 'node:crypto'
import {
  access,
  lstat,
  mkdir,
  readFile,
  readlink,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, parse, relative, resolve } from 'node:path'
import type {
  PlayerModelInstructions,
  PlayerProviderHostSessionDeletionContext,
  PlayerProviderPreparationContext,
  PlayerProviderStatePolicy,
  PlayerProviderWorkspaceLifecycle,
  PlayerProviderWorkspacePolicy,
} from './player-provider-contracts.js'

const ambientInstructionFileNames = [
  'CODEBUDDY.md',
  'CODEBUDDY.mdc',
  'AGENTS.md',
  'AGENTS.mdc',
  'CLAUDE.md',
  'CLAUDE.local.md',
] as const

const canonicalWorkspaceLifecycle: PlayerProviderWorkspaceLifecycle = {
  key: 'canonical-player-workspace',
  cleanup: () => Promise.resolve(),
}

const detachedWorkspaceLifecycle: PlayerProviderWorkspaceLifecycle = {
  key: 'detached-player-workspace',
  cleanup: (context) =>
    removePlayerIsolationWorkspace(context.canonicalWorkspace, context.isolation.isolationRoot),
}

export const canonicalPlayerWorkspace: PlayerProviderWorkspacePolicy = {
  lifecycle: canonicalWorkspaceLifecycle,
  resolve: (context) => context.canonicalWorkspace,
  prepare: () => Promise.resolve(),
}

export const noPlayerProviderState: PlayerProviderStatePolicy = {
  key: 'no-player-provider-state',
  ownsSessionStorage: false,
  environment: () => ({}),
  prepare: () => Promise.resolve(),
  cleanup: () => Promise.resolve(),
  deleteHostSessions: () => Promise.resolve(),
}

export function detachedPlayerWorkspace(
  linkedDirectories: readonly string[],
): PlayerProviderWorkspacePolicy {
  return {
    lifecycle: detachedWorkspaceLifecycle,
    resolve: (context) =>
      playerIsolationWorkspace(context.canonicalWorkspace, context.isolation.isolationRoot),
    prepare: async (context) => {
      const root = resolve(context.isolation.isolationRoot ?? defaultIsolationRoot())
      requireDirectChild(root, context.runtimeWorkspace)
      await mkdir(context.runtimeWorkspace, { recursive: true, mode: 0o700 })
      await assertInstructionFreeAncestors(context.runtimeWorkspace)
      await Promise.all(
        linkedDirectories.map((directory) =>
          ensureRelativeLink(
            resolve(context.runtimeWorkspace, directory),
            resolve(context.canonicalWorkspace, directory),
          ),
        ),
      )
    },
  }
}

export interface PlayerProviderHomeOptions {
  readonly id: string
  readonly directoryName: string
  readonly environmentVariable: string
  readonly hostEnvironmentVariable?: string
  readonly defaultHostHome: () => string
  readonly credentialEntries: readonly string[]
  readonly deleteHostSessions?: (input: {
    readonly hostHome: string
    readonly sessions: readonly {
      readonly sessionId: string
      readonly canonicalWorkspace: string
      readonly runtimeWorkspace: string
    }[]
  }) => Promise<void>
}

export function playerProviderHome(options: PlayerProviderHomeOptions): PlayerProviderStatePolicy {
  return {
    key: `player-provider-home:${options.id}:${options.directoryName}`,
    ownsSessionStorage: true,
    environment: (context) => ({
      [options.environmentVariable]: resolve(
        context.canonicalWorkspace,
        '.provider-homes',
        options.directoryName,
      ),
    }),
    prepare: async (context) => {
      const isolatedHome = resolve(
        context.canonicalWorkspace,
        '.provider-homes',
        options.directoryName,
      )
      const hostHome = playerProviderHostHome(options, context)
      await mkdir(isolatedHome, { recursive: true, mode: 0o700 })
      await Promise.all(
        options.credentialEntries.map((entryName) =>
          prepareCredentialLink(hostHome, isolatedHome, entryName),
        ),
      )
    },
    cleanup: async (context) => {
      const homesRoot = resolve(context.canonicalWorkspace, '.provider-homes')
      const ownedHome = resolve(homesRoot, options.directoryName)
      requireDirectChild(homesRoot, ownedHome)
      await rm(ownedHome, { recursive: true, force: true })
    },
    deleteHostSessions: async (contexts) => {
      if (!options.deleteHostSessions) return
      const groups = new Map<string, PlayerProviderHostSessionDeletionContext[]>()
      for (const context of contexts) {
        const hostHome = playerProviderHostHome(options, context)
        const group = groups.get(hostHome) ?? []
        group.push(context)
        groups.set(hostHome, group)
      }
      for (const [hostHome, sessions] of groups) {
        await options.deleteHostSessions({
          hostHome,
          sessions: sessions.map((session) => ({
            sessionId: session.sessionId,
            canonicalWorkspace: session.canonicalWorkspace,
            runtimeWorkspace: session.runtimeWorkspace,
          })),
        })
      }
    },
  }
}

function playerProviderHostHome(
  options: PlayerProviderHomeOptions,
  context: PlayerProviderPreparationContext,
): string {
  const hostEnvironmentVariable = options.hostEnvironmentVariable ?? options.environmentVariable
  return resolve(
    context.isolation.hostHomes?.[options.id] ??
      context.baseLaunch.env[hostEnvironmentVariable] ??
      options.defaultHostHome(),
  )
}

export async function preparePlayerModelInstructions(
  workspace: string,
  candidate: string,
): Promise<PlayerModelInstructions> {
  if (!candidate.trim()) throw new Error('Player model instructions must not be empty')
  const path = playerModelInstructionsPath(workspace)
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  try {
    await writeFile(path, candidate, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
  } catch (error) {
    if (!hasErrorCode(error, 'EEXIST')) throw error
  }
  const status = await lstat(path)
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`Player model instructions must be a regular file at ${path}`)
  }
  const text = await readFile(path, 'utf8')
  if (!text.trim()) throw new Error(`Player model instructions are empty at ${path}`)
  return { path, text }
}

export function playerModelInstructionsPath(workspace: string): string {
  return resolve(workspace, '.agentwolf', 'foundation.md')
}

export async function removePlayerIsolationWorkspace(
  workspace: string,
  isolationRoot?: string,
): Promise<void> {
  const root = resolve(isolationRoot ?? defaultIsolationRoot())
  const detached = playerIsolationWorkspace(workspace, root)
  requireDirectChild(root, detached)
  await rm(detached, { recursive: true, force: true })
}

export function playerIsolationWorkspace(workspace: string, isolationRoot?: string): string {
  const root = resolve(isolationRoot ?? defaultIsolationRoot())
  const digest = createHash('sha256').update(resolve(workspace)).digest('hex').slice(0, 24)
  return resolve(root, digest)
}

async function prepareCredentialLink(
  hostHome: string,
  isolatedHome: string,
  entryName: string,
): Promise<void> {
  const source = resolve(hostHome, entryName)
  try {
    await access(source)
  } catch (error) {
    if (isMissingPath(error)) return
    throw error
  }
  if (resolve(hostHome) === resolve(isolatedHome)) return
  await ensureRelativeLink(resolve(isolatedHome, entryName), source)
}

async function ensureRelativeLink(linkPath: string, targetPath: string): Promise<void> {
  const target = await realpath(targetPath)
  await mkdir(dirname(linkPath), { recursive: true, mode: 0o700 })
  const relativeTarget = relative(await realpath(dirname(linkPath)), target)
  try {
    const status = await lstat(linkPath)
    if (
      status.isSymbolicLink() &&
      (await readlink(linkPath)) === relativeTarget &&
      (await realpath(linkPath)) === target
    ) {
      return
    }
    await rm(linkPath, { recursive: true, force: true })
  } catch (error) {
    if (!isMissingPath(error)) throw error
  }
  await symlink(relativeTarget, linkPath)
  if ((await realpath(linkPath)) !== target) {
    await rm(linkPath, { force: true })
    throw new Error(`Player isolation link does not resolve to ${target}`)
  }
}

async function assertInstructionFreeAncestors(path: string): Promise<void> {
  const root = parse(path).root
  let current = resolve(path)
  while (true) {
    for (const name of ambientInstructionFileNames) {
      const candidate = resolve(current, name)
      try {
        await access(candidate)
        throw new Error(`Player isolation path inherits model instructions from ${candidate}`)
      } catch (error) {
        if (!isMissingPath(error)) throw error
      }
    }
    if (current === root) return
    const parent = dirname(current)
    if (parent === current) return
    current = parent
  }
}

function defaultIsolationRoot(): string {
  return resolve(tmpdir(), 'agentwolf-player-workspaces')
}

function requireDirectChild(root: string, path: string): void {
  const localPath = relative(root, path)
  if (!localPath || localPath.startsWith('..') || dirname(localPath) !== '.') {
    throw new Error(`Invalid player isolation path: ${path}`)
  }
}

function isMissingPath(error: unknown): boolean {
  return hasErrorCode(error, 'ENOENT')
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  )
}
