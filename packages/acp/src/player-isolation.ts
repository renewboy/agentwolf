import { createHash } from 'node:crypto'
import { access, lstat, mkdir, readlink, realpath, rm, symlink } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, parse, relative, resolve } from 'node:path'
import type { McpServer } from '@agentclientprotocol/sdk'
import type { AgentTool } from '@agentwolf/contracts'
import { resolvePlayerLaunchSpec } from './player-policy.js'
import { resolveLaunchSpec, type ProcessLaunchSpec } from './tool-catalog.js'

const ambientInstructionFileNames = [
  'CODEBUDDY.md',
  'CODEBUDDY.mdc',
  'AGENTS.md',
  'AGENTS.mdc',
  'CLAUDE.md',
  'CLAUDE.local.md',
] as const

export interface PreparedPlayerSessionLaunch {
  readonly cwd: string
  readonly launch: ProcessLaunchSpec
}

export interface PlayerIsolationOptions {
  readonly isolationRoot?: string
  readonly hostCodexHome?: string
  readonly hostCodeBuddyHome?: string
}

export async function preparePlayerSessionLaunch(
  tool: AgentTool,
  workspace: string,
  mcpServers: readonly McpServer[] = [],
  options: PlayerIsolationOptions = {},
): Promise<PreparedPlayerSessionLaunch> {
  const canonicalWorkspace = resolve(workspace)
  const hostLaunch = resolveLaunchSpec(tool)
  let runtimeWorkspace = canonicalWorkspace

  if (tool.kind === 'codex') {
    await prepareCredentialLink(
      resolve(
        options.hostCodexHome ?? hostLaunch.env['CODEX_HOME'] ?? resolve(homedir(), '.codex'),
      ),
      resolve(canonicalWorkspace, '.provider-homes', 'codex'),
      'auth.json',
    )
  }

  if (tool.kind === 'claude' || tool.kind === 'codebuddy') {
    runtimeWorkspace = await prepareDetachedPlayerWorkspace(
      canonicalWorkspace,
      options.isolationRoot,
      tool.kind === 'claude' ? ['.agents', '.claude'] : ['.agents'],
    )
  }

  if (tool.kind === 'codebuddy') {
    await prepareCredentialLink(
      resolve(
        options.hostCodeBuddyHome ??
          hostLaunch.env['CODEBUDDY_CONFIG_DIR'] ??
          resolve(homedir(), '.codebuddy'),
      ),
      resolve(canonicalWorkspace, '.provider-homes', 'codebuddy'),
      'local_storage',
    )
  }

  return {
    cwd: runtimeWorkspace,
    launch: resolvePlayerLaunchSpec(tool, runtimeWorkspace, mcpServers, canonicalWorkspace),
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

async function prepareDetachedPlayerWorkspace(
  workspace: string,
  isolationRoot?: string,
  linkedDirectories: readonly string[] = ['.agents'],
): Promise<string> {
  const root = resolve(isolationRoot ?? defaultIsolationRoot())
  const detached = playerIsolationWorkspace(workspace, root)
  requireDirectChild(root, detached)
  await mkdir(detached, { recursive: true, mode: 0o700 })
  await assertInstructionFreeAncestors(detached)
  await Promise.all(
    linkedDirectories.map((directory) =>
      ensureRelativeLink(resolve(detached, directory), resolve(workspace, directory)),
    ),
  )
  return detached
}

async function prepareCredentialLink(
  hostHome: string,
  isolatedHome: string,
  entryName: string,
): Promise<void> {
  await mkdir(isolatedHome, { recursive: true, mode: 0o700 })
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
