import { createHash } from 'node:crypto'
import { access, lstat, mkdir, readlink, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, parse, relative, resolve } from 'node:path'
import type {
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
  environment: () => ({}),
  prepare: () => Promise.resolve(),
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
}

export function playerProviderHome(options: PlayerProviderHomeOptions): PlayerProviderStatePolicy {
  return {
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
      const hostEnvironmentVariable = options.hostEnvironmentVariable ?? options.environmentVariable
      const hostHome = resolve(
        context.isolation.hostHomes?.[options.id] ??
          context.baseLaunch.env[hostEnvironmentVariable] ??
          options.defaultHostHome(),
      )
      await mkdir(isolatedHome, { recursive: true, mode: 0o700 })
      await Promise.all(
        options.credentialEntries.map((entryName) =>
          prepareCredentialLink(hostHome, isolatedHome, entryName),
        ),
      )
    },
  }
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
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}
