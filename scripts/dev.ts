import { spawn, type ChildProcess } from 'node:child_process'
import { terminateProcessTree } from './process-tree.js'

const children: ChildProcess[] = []
let closing = false
const developerMode = process.argv.includes('--developer')

for (const filter of ['@agentwolf/server', '@agentwolf/web']) {
  const child = spawn('pnpm', ['--filter', filter, 'dev'], {
    detached: process.platform !== 'win32',
    stdio: 'inherit',
    shell: false,
    env:
      developerMode && filter === '@agentwolf/server'
        ? { ...process.env, AGENTWOLF_DEVELOPER_MODE: 'true' }
        : process.env,
  })
  children.push(child)
  child.once('exit', (code) => {
    if (closing || code === 0) return
    process.stderr.write(`${filter} exited with status ${code ?? 1}\n`)
    void closeChildren(code ?? 1)
  })
}

process.once('SIGINT', () => void closeChildren(0))
process.once('SIGTERM', () => void closeChildren(0))

await new Promise<void>((resolvePromise) => {
  process.once('beforeExit', () => resolvePromise())
})

async function closeChildren(exitCode: number): Promise<void> {
  if (closing) return
  closing = true
  await Promise.all(children.map((child) => terminateProcessTree(child)))
  process.exitCode = exitCode
}
