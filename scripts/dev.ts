import { spawn, type ChildProcess } from 'node:child_process'

const children: ChildProcess[] = []
let closing = false

for (const filter of ['@agentwolf/server', '@agentwolf/web']) {
  const child = spawn('pnpm', ['--filter', filter, 'dev'], {
    stdio: 'inherit',
    shell: false,
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
  for (const child of children) child.kill('SIGTERM')
  await Promise.all(
    children.map(
      (child) =>
        new Promise<void>((resolvePromise) => {
          if (child.exitCode !== null || child.signalCode !== null) resolvePromise()
          else child.once('exit', () => resolvePromise())
        }),
    ),
  )
  process.exitCode = exitCode
}
