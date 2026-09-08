import { createHash } from 'node:crypto'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PassThrough, type Readable } from 'node:stream'
import { DEFAULT_SPEECH_VOICE, type MatchId } from '@agentwolf/contracts'
import type { ServerConfig } from './config.js'

export interface DefaultSpeechInput {
  readonly matchId: MatchId
  readonly text: string
  readonly signal: AbortSignal
}
export interface DefaultSpeechProvider {
  start(): void
  openAudio(input: DefaultSpeechInput): Promise<Readable>
  forgetMatch(matchId: MatchId): void
  close(): Promise<void>
}

interface EdgeJob {
  readonly matchId: MatchId
  readonly child: ChildProcessWithoutNullStreams
  readonly output: PassThrough
  readonly cancel: () => void
}

export class EdgeSpeechService implements DefaultSpeechProvider {
  readonly #config: ServerConfig
  readonly #directory: string
  readonly #python: string
  readonly #jobs = new Set<EdgeJob>()
  readonly #preparations = new Set<ChildProcessWithoutNullStreams>()
  readonly #exits = new Map<ChildProcessWithoutNullStreams, Promise<void>>()
  #preparation: Promise<void> | null = null
  #ready = false
  #closed = false

  public constructor(config: ServerConfig) {
    this.#config = config
    this.#directory = resolve(config.dataDirectory, 'tts-runtime')
    this.#python = resolve(
      this.#directory,
      '.venv-edge',
      process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
    )
  }

  public start(): void {
    if (
      this.#closed ||
      this.#ready ||
      this.#preparation ||
      this.#config.edgeSpeechEnabled === false
    )
      return
    this.#preparation = this.#prepare()
      .catch((error: unknown) => {
        this.#log(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        this.#preparation = null
      })
  }

  public async openAudio(input: DefaultSpeechInput): Promise<Readable> {
    input.signal.throwIfAborted()
    this.start()
    await this.#preparation
    input.signal.throwIfAborted()
    if (this.#closed || !this.#ready) throw new Error('Edge TTS runtime is unavailable')
    if (this.#jobs.size >= 24) throw new Error('Edge TTS request queue is full')
    const output = new PassThrough()
    output.on('error', () => {})
    const child = spawn(
      this.#python,
      ['-u', '-m', 'edge_tts', '--file', '-', '--voice', DEFAULT_SPEECH_VOICE],
      {
        cwd: this.#config.projectRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      },
    )
    this.#track(child)
    return new Promise<Readable>((resolveOpen, rejectOpen) => {
      let started = false
      let bytes = 0
      let stderr = ''
      let stopped = false
      const timeout = setTimeout(() => fail(new Error('Edge TTS generation timed out')), 120_000)
      timeout.unref()
      const cleanup = () => {
        clearTimeout(timeout)
        input.signal.removeEventListener('abort', abort)
        this.#jobs.delete(job)
      }
      const fail = (error: Error) => {
        if (stopped) return
        stopped = true
        cleanup()
        child.kill('SIGTERM')
        output.destroy(error)
        rejectOpen(error)
      }
      const abort = () => fail(new Error('Edge TTS request cancelled'))
      const job: EdgeJob = { matchId: input.matchId, child, output, cancel: abort }
      this.#jobs.add(job)
      input.signal.addEventListener('abort', abort, { once: true })
      output.once('close', () => {
        if (!output.readableEnded) abort()
        cleanup()
      })
      child.stderr.on('data', (chunk: Buffer) => {
        stderr = (stderr + chunk.toString('utf8')).slice(-4000)
      })
      child.stdin.on('error', fail)
      child.once('error', fail)
      child.stdout.on('data', (chunk: Buffer) => {
        if (stopped) return
        bytes += chunk.length
        if (!started) {
          started = true
          resolveOpen(output)
        }
        if (!output.write(chunk)) child.stdout.pause()
      })
      output.on('drain', () => child.stdout.resume())
      child.once('close', (code) => {
        if (stopped) return
        if (code !== 0 || bytes === 0) {
          this.#log(stderr)
          fail(new Error('Edge TTS did not produce complete audio'))
          return
        }
        clearTimeout(timeout)
        output.end()
      })
      child.stdin.end(input.text)
    })
  }

  public forgetMatch(matchId: MatchId): void {
    for (const job of this.#jobs) if (job.matchId === matchId) job.cancel()
  }

  public async close(): Promise<void> {
    this.#closed = true
    for (const job of this.#jobs) job.cancel()
    await Promise.all(
      [...this.#exits].map(async ([child, exited]) => {
        this.#signal(child, 'SIGTERM')
        const force = setTimeout(() => this.#signal(child, 'SIGKILL'), 2_000)
        force.unref()
        await exited
        clearTimeout(force)
      }),
    )
    await this.#preparation
  }

  async #prepare(): Promise<void> {
    const root = resolve(this.#directory, '.venv-edge')
    const requirements = resolve(this.#config.projectRoot, 'scripts/tts/requirements-edge.txt')
    const marker = resolve(this.#directory, 'dependencies-edge.sha256')
    await mkdir(resolve(this.#directory, 'tmp'), { recursive: true })
    const digest = createHash('sha256')
      .update(await readFile(requirements))
      .digest('hex')
    const installed = await readFile(marker, 'utf8').catch(() => '')
    const present = existsSync(this.#python)
    if (!present) await this.#run(['venv', '--python', '3.12', root])
    if (!present || installed !== digest) {
      await this.#run([
        'pip',
        'install',
        '--only-binary',
        ':all:',
        '--python',
        this.#python,
        '-r',
        requirements,
      ])
      await writeFile(marker, digest)
    }
    if (!this.#closed) this.#ready = true
  }

  #run(args: string[]): Promise<void> {
    if (this.#closed) return Promise.reject(new Error('Edge TTS service is closed'))
    return new Promise((resolveRun, rejectRun) => {
      const child = spawn('uv', args, {
        detached: process.platform !== 'win32',
        cwd: this.#config.projectRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          UV_CACHE_DIR: resolve(this.#directory, 'uv-cache'),
          UV_PYTHON_INSTALL_DIR: resolve(this.#directory, 'python'),
          TMPDIR: resolve(this.#directory, 'tmp'),
        },
      })
      this.#track(child)
      this.#preparations.add(child)
      child.stdin.end()
      child.stdout.on('data', (chunk: Buffer) => this.#log(chunk.toString('utf8')))
      child.stderr.on('data', (chunk: Buffer) => this.#log(chunk.toString('utf8')))
      child.once('error', rejectRun)
      child.once('close', (code) => {
        this.#preparations.delete(child)
        if (code === 0) resolveRun()
        else rejectRun(new Error('Edge TTS dependency preparation failed'))
      })
    })
  }

  #signal(child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals): void {
    if (this.#preparations.has(child) && process.platform !== 'win32' && child.pid) {
      try {
        process.kill(-child.pid, signal)
        return
      } catch {
        /* The group may already have exited. */
      }
    }
    child.kill(signal)
  }

  #track(child: ChildProcessWithoutNullStreams): void {
    this.#exits.set(
      child,
      new Promise((resolveExit) =>
        child.once('close', () => {
          this.#exits.delete(child)
          resolveExit()
        }),
      ),
    )
  }

  #log(text: string): void {
    void mkdir(this.#directory, { recursive: true })
      .then(() => appendFile(resolve(this.#directory, 'edge.log'), text + '\n'))
      .catch(() => {})
  }
}
