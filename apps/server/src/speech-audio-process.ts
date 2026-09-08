import { randomUUID } from 'node:crypto'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { PassThrough } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'
import { z } from 'zod'
import { SpeechAudioBackendSchema, type SpeechAudioBackend } from '@agentwolf/contracts'

const WorkerMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready'), backend: SpeechAudioBackendSchema.optional() }),
  z.object({
    type: z.literal('meta'),
    id: z.string(),
    sampleRate: z.literal(24_000),
    channels: z.literal(1),
    format: z.literal('pcm_s16le'),
  }),
  z.object({
    type: z.literal('audio'),
    id: z.string(),
    sequence: z.number().int().nonnegative(),
    pcm: z
      .string()
      .max(4_000_000)
      .regex(/^[A-Za-z0-9+/]*={0,2}$/u),
  }),
  z.object({ type: z.literal('done'), id: z.string(), frames: z.number().int().positive() }),
  z.object({ type: z.literal('cancelled'), id: z.string() }),
  z.object({ type: z.literal('error'), id: z.string().optional(), message: z.string() }),
])

export interface SpeechAudioProcessOptions {
  readonly python: string
  readonly script: string
  readonly dataDirectory: string
  readonly onLog: (data: string) => void
  readonly onExit: (error: Error) => void
  readonly onReady?: (backend: SpeechAudioBackend | undefined) => void
}

interface AudioJob {
  readonly id: string
  readonly text: string
  readonly reference: string
  readonly referenceText: string
  readonly stream: PassThrough
  readonly cleanup: () => void
  sequence: number
  bytes: number
  meta: boolean
  cancelled: boolean
}

interface Backpressure {
  readonly job: AudioJob
  readonly child: ChildProcessWithoutNullStreams
  readonly drain: () => void
}

export class SpeechAudioProcess {
  readonly #options: SpeechAudioProcessOptions
  #child: ChildProcessWithoutNullStreams | null = null
  #ready = false
  #started = false
  #failed = false
  #closed = false
  #current: AudioJob | null = null
  #queue: AudioJob[] = []
  #cancelTimer: ReturnType<typeof setTimeout> | null = null
  #startup: {
    readonly resolve: () => void
    readonly reject: (error: Error) => void
    readonly timeout: ReturnType<typeof setTimeout>
  } | null = null
  #backpressure: Backpressure | null = null
  #termination: Promise<void> | null = null

  public constructor(options: SpeechAudioProcessOptions) {
    this.#options = options
  }

  public async start(): Promise<void> {
    if (this.#closed) throw new Error('Speech worker is closed')
    if (this.#started) throw new Error('Speech worker can only start once')
    this.#started = true
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => this.#fail(new Error('Speech model loading timed out')),
        300_000,
      )
      timeout.unref()
      this.#startup = { resolve, reject, timeout }
      let child: ChildProcessWithoutNullStreams
      try {
        child = spawn(
          this.#options.python,
          ['-u', this.#options.script, '--data-dir', this.#options.dataDirectory],
          {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, TOKENIZERS_PARALLELISM: 'false', HF_HUB_OFFLINE: '1' },
          },
        )
      } catch (error) {
        this.#fail(error instanceof Error ? error : new Error(String(error)))
        return
      }
      this.#child = child
      const decoder = new StringDecoder('utf8')
      let buffered = ''
      child.stderr.on('data', (data: Buffer) => this.#options.onLog(data.toString('utf8')))
      child.stdin.on('error', (error) => this.#fail(error))
      child.stdout.on('data', (data: Buffer) => {
        if (this.#closed || this.#failed) return
        buffered += decoder.write(data)
        if (buffered.length > 8_000_000) {
          this.#fail(new Error('Speech worker message exceeds limit'))
          return
        }
        let newline = buffered.indexOf('\n')
        while (newline >= 0 && !this.#closed && !this.#failed) {
          const line = buffered.slice(0, newline).trim()
          buffered = buffered.slice(newline + 1)
          newline = buffered.indexOf('\n')
          if (!line) continue
          try {
            const message = WorkerMessageSchema.parse(JSON.parse(line))
            if (message.type === 'ready') {
              if (this.#ready) throw new Error('Duplicate speech worker ready message')
              this.#ready = true
              this.#options.onReady?.(message.backend)
              this.#finishStartup()
              this.#pump()
            } else if (message.type === 'error' && !message.id) {
              throw new Error(message.message)
            } else {
              this.#receive(message)
            }
          } catch (error) {
            const failure = error instanceof Error ? error : new Error(String(error))
            this.#fail(failure)
            return
          }
        }
      })
      child.once('error', (error) => this.#fail(error))
      child.once('exit', (code, signal) => {
        const error = new Error(`Speech worker exited (${code ?? signal})`)
        this.#fail(error)
      })
    })
    if (this.#closed || this.#failed) throw new Error('Speech model is not ready')
  }

  public generate(
    text: string,
    reference: string,
    signal: AbortSignal,
    referenceText: string,
  ): PassThrough {
    if (!this.#ready || this.#closed || this.#failed) throw new Error('Speech model is not ready')
    if (this.#queue.length >= 24) throw new Error('Speech generation queue is full')
    signal.throwIfAborted()
    const stream = new PassThrough()
    stream.on('error', () => {})
    const abort = () => this.#cancel(job)
    const job: AudioJob = {
      id: randomUUID(),
      text,
      reference,
      referenceText,
      stream,
      sequence: 0,
      bytes: 0,
      meta: false,
      cancelled: false,
      cleanup: () => signal.removeEventListener('abort', abort),
    }
    signal.addEventListener('abort', abort, { once: true })
    stream.once('close', () => {
      if (!stream.readableEnded) this.#cancel(job)
    })
    this.#queue.push(job)
    this.#pump()
    return stream
  }

  public async close(): Promise<void> {
    if (!this.#closed) {
      this.#closed = true
      this.#ready = false
      const error = new Error('Speech audio service is closed')
      this.#finishStartup(error)
      this.#clearCancelTimer()
      this.#releaseBackpressure()
      this.#finishAll(error)
    }
    await this.#terminate()
  }

  #finishStartup(error?: Error): void {
    const startup = this.#startup
    if (!startup) return
    this.#startup = null
    clearTimeout(startup.timeout)
    if (error) startup.reject(error)
    else startup.resolve()
  }

  #terminate(): Promise<void> {
    if (this.#termination) return this.#termination
    const child = this.#child
    if (!child || child.pid === undefined || child.exitCode !== null || child.signalCode !== null) {
      return Promise.resolve()
    }
    this.#termination = new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timeout)
        child.off('exit', finish)
        resolve()
      }
      const timeout = setTimeout(() => {
        child.kill('SIGKILL')
        finish()
      }, 2_000)
      timeout.unref()
      child.once('exit', finish)
      child.stdout.resume()
      child.kill('SIGTERM')
    })
    return this.#termination
  }

  #pump(): void {
    if (!this.#ready || this.#closed || this.#failed || this.#current) return
    const next = this.#queue.shift()
    if (!next) return
    this.#current = next
    this.#child?.stdin.write(
      JSON.stringify({
        id: next.id,
        text: next.text,
        reference: next.reference,
        referenceText: next.referenceText,
        seed: 42,
      }) + '\n',
    )
  }

  #receive(message: Exclude<z.infer<typeof WorkerMessageSchema>, { type: 'ready' }>): void {
    const job = this.#current
    if (!job || message.id !== job.id) return
    if (message.type === 'audio') {
      if (job.cancelled) return
      if (!job.meta || message.sequence !== job.sequence++)
        throw new Error('Speech chunk sequence mismatch')
      const bytes = Buffer.from(message.pcm, 'base64')
      if (bytes.length === 0 || bytes.length % 2 !== 0) throw new Error('Invalid PCM chunk')
      job.bytes += bytes.length
      if (job.bytes > 48_000_000) throw new Error('Speech output exceeds limit')
      bytes.swap16()
      if (!job.stream.write(bytes)) {
        this.#pauseFor(job)
      }
      return
    }
    if (message.type === 'meta') {
      if (job.meta) throw new Error('Duplicate speech metadata')
      job.meta = true
      return
    }
    this.#clearCancelTimer()
    job.cleanup()
    this.#releaseBackpressure(job)
    if (message.type === 'done' && !job.cancelled) {
      if (!job.meta || job.bytes !== message.frames * 2)
        throw new Error('Speech output length mismatch')
      job.stream.end()
    } else if (message.type === 'error' && !job.cancelled) {
      job.stream.destroy(new Error('Speech generation failed'))
      this.#options.onLog(`Speech generation failed: ${message.message}\n`)
    } else {
      job.stream.destroy(new Error('Speech generation cancelled'))
    }
    this.#current = null
    this.#pump()
  }

  #cancel(job: AudioJob): void {
    if (job.cancelled || this.#closed || this.#failed) return
    job.cancelled = true
    job.cleanup()
    this.#releaseBackpressure(job)
    job.stream.destroy(new Error('Speech generation cancelled'))
    if (this.#current !== job) {
      this.#queue = this.#queue.filter((entry) => entry !== job)
      return
    }
    this.#child?.stdin.write(JSON.stringify({ type: 'cancel', id: job.id }) + '\n')
    this.#clearCancelTimer()
    this.#cancelTimer = setTimeout(
      () => this.#fail(new Error('Speech cancellation timed out')),
      30_000,
    )
    this.#cancelTimer.unref()
  }

  #pauseFor(job: AudioJob): void {
    const child = this.#child
    if (!child || this.#backpressure) return
    const drain = () => this.#releaseBackpressure(job)
    this.#backpressure = { job, child, drain }
    child.stdout.pause()
    job.stream.once('drain', drain)
  }

  #releaseBackpressure(job?: AudioJob): void {
    const pressure = this.#backpressure
    if (!pressure || (job && pressure.job !== job)) return
    this.#backpressure = null
    pressure.job.stream.off('drain', pressure.drain)
    pressure.child.stdout.resume()
  }

  #clearCancelTimer(): void {
    if (this.#cancelTimer) clearTimeout(this.#cancelTimer)
    this.#cancelTimer = null
  }

  #finishAll(error: Error): void {
    for (const job of [...(this.#current ? [this.#current] : []), ...this.#queue]) {
      job.cleanup()
      job.stream.destroy(error)
    }
    this.#current = null
    this.#queue = []
  }

  #fail(error: Error): void {
    if (this.#closed || this.#failed) return
    this.#failed = true
    this.#ready = false
    this.#finishStartup(error)
    this.#clearCancelTimer()
    this.#releaseBackpressure()
    this.#finishAll(error)
    void this.#terminate()
    this.#options.onExit(error)
  }
}
