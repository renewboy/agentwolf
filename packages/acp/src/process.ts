import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { ProcessLaunchSpec } from './tool-catalog.js'

export interface AgentProcessOptions {
  readonly cwd: string
  readonly launch: ProcessLaunchSpec
  readonly stderrLimit?: number
  readonly onStderr?: (chunk: string) => void
}

export class AgentProcess {
  readonly #child: ChildProcessWithoutNullStreams
  readonly #stderrLimit: number
  #stderr = ''
  #closed = false

  public constructor(options: AgentProcessOptions) {
    this.#stderrLimit = options.stderrLimit ?? 16_384
    this.#child = spawn(options.launch.command, [...options.launch.args], {
      cwd: options.cwd,
      env: options.launch.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    })
    this.#child.stderr.setEncoding('utf8')
    this.#child.stderr.on('data', (chunk: string) => {
      this.#stderr = `${this.#stderr}${chunk}`.slice(-this.#stderrLimit)
      options.onStderr?.(chunk)
    })
  }

  public get child(): ChildProcessWithoutNullStreams {
    return this.#child
  }

  public get stderrTail(): string {
    return this.#stderr
  }

  public exited(): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
    return new Promise((resolve, reject) => {
      if (this.#child.exitCode !== null || this.#child.signalCode !== null) {
        resolve({ code: this.#child.exitCode, signal: this.#child.signalCode })
        return
      }
      this.#child.once('error', reject)
      this.#child.once('exit', (code, signal) => resolve({ code, signal }))
    })
  }

  public async close(graceMs = 1_500): Promise<void> {
    if (this.#closed) return
    this.#closed = true
    if (this.#child.exitCode !== null || this.#child.signalCode !== null) return
    this.#child.kill('SIGTERM')
    const exited = this.exited().then(() => true)
    const timedOut = new Promise<false>((resolve) => {
      const timer = setTimeout(() => resolve(false), graceMs)
      timer.unref()
    })
    if (!(await Promise.race([exited, timedOut]))) {
      this.#child.kill('SIGKILL')
      await this.exited()
    }
  }
}
