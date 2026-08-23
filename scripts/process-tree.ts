import type { ChildProcess } from 'node:child_process'

export async function terminateProcessTree(child: ChildProcess, graceMs = 5_000): Promise<void> {
  signalProcessTree(child, 'SIGTERM')
  const startedAt = Date.now()
  while (processTreeExists(child) && Date.now() - startedAt < graceMs) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100))
  }
  if (processTreeExists(child)) signalProcessTree(child, 'SIGKILL')
}

export function processTreeExists(child: ChildProcess): boolean {
  if (!child.pid) return false
  if (process.platform === 'win32') return child.exitCode === null && child.signalCode === null
  try {
    process.kill(-child.pid, 0)
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return false
    throw error
  }
}

export function signalProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (!child.pid) return
  try {
    if (process.platform === 'win32') child.kill(signal)
    else process.kill(-child.pid, signal)
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error
  }
}
