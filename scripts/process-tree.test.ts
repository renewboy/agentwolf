import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { terminateProcessTree } from './process-tree.js'

const roots: string[] = []
const ownedPids = new Set<number>()

afterEach(async () => {
  for (const pid of ownedPids) killOwned(pid)
  ownedPids.clear()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe.skipIf(process.platform === 'win32')('development process-tree shutdown', () => {
  it('escalates from TERM to KILL for a child group that ignores TERM', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-dev-tree-'))
    roots.push(root)
    const infoPath = resolve(root, 'tree.json')
    const fixture = resolve('packages/acp/tests/fixtures/process-tree-agent.mjs')
    const child = spawn(process.execPath, [fixture], {
      detached: true,
      env: { ...process.env, AGENTWOLF_PROCESS_TREE_INFO: infoPath },
      stdio: 'ignore',
    })
    if (!child.pid) throw new Error('Development fixture did not start')
    ownedPids.add(child.pid)
    const info = await readInfo(infoPath)
    ownedPids.add(info.childPid)

    await terminateProcessTree(child, 200)

    await waitForExit(child.pid)
    await waitForExit(info.childPid)
    expect(processExists(child.pid)).toBe(false)
    expect(processExists(info.childPid)).toBe(false)
  }, 5_000)
})

async function readInfo(path: string): Promise<{ childPid: number }> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      return JSON.parse(await readFile(path, 'utf8')) as { childPid: number }
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 25))
    }
  }
  throw new Error(`Timed out waiting for ${path}`)
}

async function waitForExit(pid: number): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (!processExists(pid)) return
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25))
  }
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return false
    throw error
  }
}

function killOwned(pid: number): void {
  try {
    process.kill(pid, 'SIGKILL')
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error
  }
}
