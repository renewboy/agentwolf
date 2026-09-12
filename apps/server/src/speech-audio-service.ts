import { createHash } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { Readable, Transform, type TransformCallback } from 'node:stream'
import { builtInCharacterVoices } from '@agentwolf/assets/voices'
import { getCopy } from '@agentwolf/assets'
import {
  SpeechAudioProgressSchema,
  type CharacterId,
  type MatchId,
  type SpeechAudioBackend,
  type SpeechAudioProgress,
  type SpeechAudioStatus,
  type SpeechId,
} from '@agentwolf/contracts'
import type { ServerConfig } from './config.js'
import { SpeechAudioProcess } from './speech-audio-process.js'
import { speechAudioEnvironment } from './speech-audio-environment.js'

export interface SpeechAudioInput {
  readonly matchId: MatchId
  readonly speechId: SpeechId
  readonly characterId: CharacterId
  readonly text: string
  readonly signal: AbortSignal
}

export interface SpeechAudioProvider {
  status(): SpeechAudioStatus
  start(): void
  hasVoice(characterId: CharacterId): boolean
  openAudio(input: SpeechAudioInput): Promise<Readable>
  forgetMatch(matchId: MatchId): void
  close(): Promise<void>
}

export class SpeechAudioUnavailableError extends Error {}

const MAX_CACHE_BYTES = 32 * 1_024 * 1_024

interface CachedAudio {
  readonly matchId: MatchId
  readonly bytes: Buffer
}

export class SpeechAudioService implements SpeechAudioProvider {
  readonly #config: ServerConfig
  readonly #voices = new Map(builtInCharacterVoices.map((voice) => [voice.characterId, voice]))
  readonly #cache = new Map<string, CachedAudio>()
  readonly #streams = new Map<MatchId, Set<Readable>>()
  readonly #children = new Set<ChildProcess>()
  #cachedBytes = 0
  #state: SpeechAudioStatus['state']
  #message: string | null
  #preparation: Promise<void> | null = null
  #worker: SpeechAudioProcess | null = null
  #closed = false
  #backend: SpeechAudioBackend | undefined
  #progress: SpeechAudioProgress | undefined
  #retryAfter = 0
  #retryTimer: ReturnType<typeof setTimeout> | null = null

  public constructor(config: ServerConfig) {
    this.#config = config
    this.#state = config.speechAudioEnabled === false ? 'disabled' : 'preparing'
    this.#message =
      this.#state === 'disabled'
        ? getCopy('speechAudio.disabled')
        : getCopy('speechAudio.preparing')
  }

  public status(): SpeechAudioStatus {
    return {
      state: this.#state,
      model: 'qwen3-tts-0.6b',
      message: this.#message,
      voices: this.#voices.size,
      ...(this.#backend ? { backend: this.#backend } : {}),
      ...(this.#progress ? { progress: this.#progress } : {}),
    }
  }

  public hasVoice(characterId: CharacterId): boolean {
    return this.#voices.has(characterId)
  }

  public start(): void {
    if (this.#closed || this.#state === 'disabled' || this.#preparation || this.#state === 'ready')
      return
    if (Date.now() < this.#retryAfter) return
    if (this.#retryTimer) clearTimeout(this.#retryTimer)
    this.#retryTimer = null
    this.#preparation = this.#prepare()
      .catch((error: unknown) => {
        if (this.#closed) return
        this.#scheduleRetry(30_000)
        this.#state = 'error'
        this.#message = getCopy('speechAudio.preparationFailed')
        this.#log(error instanceof Error ? (error.stack ?? error.message) : String(error))
      })
      .finally(() => {
        this.#preparation = null
      })
  }

  public async openAudio(input: SpeechAudioInput): Promise<Readable> {
    input.signal.throwIfAborted()
    if (this.#closed || this.#state !== 'ready' || !this.#worker) {
      throw new SpeechAudioUnavailableError('Character speech service is not ready')
    }
    const voice = this.#voices.get(input.characterId)
    if (!voice) throw new SpeechAudioUnavailableError('Character voice is not configured')
    const key = createHash('sha256')
      .update(
        JSON.stringify([
          input.matchId,
          input.speechId,
          input.characterId,
          voice.revision,
          'qwen3-tts-0.6b-reference-context-v1',
          input.text,
          42,
        ]),
      )
      .digest('hex')
    const cached = this.#cache.get(key)
    if (cached) {
      this.#cache.delete(key)
      this.#cache.set(key, cached)
      return this.#track(input.matchId, Readable.from([cached.bytes], { signal: input.signal }))
    }
    const reference = resolve(
      this.#config.dataDirectory,
      'voice-library/builtin',
      voice.referenceFile,
    )
    const source = this.#worker.generate(input.text, reference, input.signal, voice.referenceText)
    const parts: Buffer[] = []
    let byteLength = 0
    let cacheable = true
    const complete = () => {
      if (cacheable && byteLength > 0 && !output.destroyed)
        this.#remember(key, input.matchId, Buffer.concat(parts, byteLength))
    }
    const output = new Transform({
      transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
        byteLength += chunk.length
        if (byteLength > MAX_CACHE_BYTES) {
          cacheable = false
          parts.length = 0
        } else if (cacheable) parts.push(chunk)
        callback(null, chunk)
      },
      flush(callback: TransformCallback) {
        complete()
        callback()
      },
    })
    output.on('error', () => {})
    source.once('error', (error) => output.destroy(error))
    output.once('close', () => {
      if (!source.readableEnded) source.destroy()
    })
    source.pipe(output)
    return this.#track(input.matchId, output)
  }

  public forgetMatch(matchId: MatchId): void {
    for (const stream of this.#streams.get(matchId) ?? []) {
      stream.destroy(new Error('Match audio is no longer available'))
    }
    this.#streams.delete(matchId)
    for (const [key, item] of this.#cache) {
      if (item.matchId !== matchId) continue
      this.#cachedBytes -= item.bytes.length
      this.#cache.delete(key)
    }
  }

  public async close(): Promise<void> {
    if (this.#closed) return
    this.#closed = true
    if (this.#retryTimer) clearTimeout(this.#retryTimer)
    this.#retryTimer = null
    for (const streams of this.#streams.values()) {
      for (const stream of streams) stream.destroy(new Error('Speech audio service is closed'))
    }
    this.#streams.clear()
    await Promise.all([
      ...[...this.#children].map((child) => this.#terminatePreparation(child)),
      this.#worker?.close(),
    ])
    this.#worker = null
    await this.#preparation
    this.#cache.clear()
    this.#cachedBytes = 0
  }

  async #prepare(): Promise<void> {
    this.#state = 'preparing'
    this.#message = getCopy('speechAudio.preparingFallback')
    this.#backend = undefined
    this.#progress = { stage: 'dependencies', downloadedBytes: 0, totalBytes: 0 }
    const previous = this.#worker
    this.#worker = null
    if (previous) await previous.close()
    if (this.#closed) return
    const environment = speechAudioEnvironment(this.#config.projectRoot, this.#config.dataDirectory)
    if (!environment) {
      this.#state = 'error'
      this.#message = getCopy('speechAudio.unsupportedPlatform')
      return
    }
    const directory = resolve(this.#config.dataDirectory, 'tts-runtime')
    const { python, requirements } = environment
    await mkdir(directory, { recursive: true })
    await mkdir(resolve(directory, 'tmp'), { recursive: true })
    const digest = createHash('sha256')
      .update(await readFile(requirements))
      .digest('hex')
    const installed = await readFile(environment.marker, 'utf8').catch(() => '')
    const environmentExists = existsSync(python)
    if (!environmentExists) await this.#run('uv', ['venv', '--python', '3.12', environment.root])
    if (!environmentExists || installed !== digest) {
      const install = [
        'pip',
        'install',
        '--only-binary',
        ':all:',
        '--python',
        python,
        ...(environment.automaticTorch ? ['--torch-backend', 'auto'] : []),
        '-r',
        requirements,
      ]
      try {
        await this.#run('uv', install)
      } catch (error) {
        if (!environment.automaticTorch || this.#closed) throw error
        this.#log('Automatic accelerator installation failed; trying the supported CPU wheels.')
        await this.#run(
          'uv',
          install.map((value) => (value === 'auto' ? 'cpu' : value)),
        )
      }
      await writeFile(environment.marker, digest)
    }
    if (this.#closed) return
    await this.#materializeVoices()
    await this.#run(
      python,
      [
        '-u',
        resolve(this.#config.projectRoot, 'scripts/tts/prepare.py'),
        '--data-dir',
        this.#config.dataDirectory,
        '--watch-parent',
      ],
      true,
    )
    if (this.#closed) return
    this.#state = 'loading'
    this.#progress = { ...this.#progress, stage: 'loading' }
    this.#message = getCopy('speechAudio.loading')
    const worker = new SpeechAudioProcess({
      python,
      script: resolve(this.#config.projectRoot, 'scripts/tts/runtime.py'),
      dataDirectory: this.#config.dataDirectory,
      onLog: (data) => this.#log(data),
      onReady: (backend) => {
        this.#backend = backend
      },
      onExit: (error) => {
        if (this.#closed || this.#worker !== worker) return
        this.#state = 'error'
        this.#message = getCopy('speechAudio.interrupted')
        this.#scheduleRetry(5_000)
        this.#log(error.message)
      },
    })
    this.#worker = worker
    await worker.start()
    if (this.#closed) return
    this.#state = 'ready'
    this.#progress = undefined
    this.#message = null
  }

  #scheduleRetry(delay: number): void {
    if (this.#closed) return
    this.#retryAfter = Date.now() + delay
    if (this.#retryTimer) clearTimeout(this.#retryTimer)
    this.#retryTimer = setTimeout(() => {
      this.#retryTimer = null
      this.start()
    }, delay)
    this.#retryTimer.unref()
  }

  async #materializeVoices(): Promise<void> {
    const directory = resolve(this.#config.dataDirectory, 'voice-library/builtin')
    await mkdir(directory, { recursive: true })
    for (const voice of this.#voices.values()) {
      const bytes = await readFile(
        resolve(this.#config.projectRoot, 'packages/assets/voices', voice.referenceFile),
      )
      if (createHash('sha256').update(bytes).digest('hex') !== voice.sha256) {
        throw new Error(`Character voice checksum mismatch: ${voice.characterId}`)
      }
      await writeFile(resolve(directory, voice.referenceFile), bytes)
    }
  }

  async #run(command: string, args: readonly string[], reportProgress = false): Promise<void> {
    if (this.#closed) throw new Error('Speech audio service is closed')
    await new Promise<void>((resolveRun, reject) => {
      const child = spawn(command, [...args], {
        cwd: this.#config.projectRoot,
        stdio: [reportProgress ? 'pipe' : 'ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
        env: {
          ...process.env,
          PIP_USER: 'false',
          TOKENIZERS_PARALLELISM: 'false',
          UV_CACHE_DIR: resolve(this.#config.dataDirectory, 'tts-runtime/uv-cache'),
          UV_PYTHON_INSTALL_DIR: resolve(this.#config.dataDirectory, 'tts-runtime/python'),
          TMPDIR: resolve(this.#config.dataDirectory, 'tts-runtime/tmp'),
        },
      })
      this.#children.add(child)
      createInterface({ input: child.stdout! }).on('line', (line) => {
        if (reportProgress && !this.#closed) {
          try {
            const message = JSON.parse(line) as { type?: unknown; progress?: unknown }
            const progress = SpeechAudioProgressSchema.safeParse(message.progress)
            if (message.type === 'progress' && progress.success) {
              this.#progress = progress.data
              return
            }
          } catch {
            /* Preparation diagnostics remain available in the service log. */
          }
        }
        this.#log(line)
      })
      child.stderr!.on('data', (data: Buffer) => this.#log(data.toString('utf8')))
      child.once('error', (error) => {
        this.#children.delete(child)
        reject(error)
      })
      child.once('exit', (code, signal) => {
        this.#children.delete(child)
        if (code === 0) resolveRun()
        else reject(new Error(`Speech preparation command failed: ${command} (${code ?? signal})`))
      })
    })
  }

  async #terminatePreparation(child: ChildProcess): Promise<void> {
    if (!child.pid || child.exitCode !== null) return
    const signal = (name: NodeJS.Signals) => {
      try {
        if (process.platform !== 'win32') process.kill(-child.pid!, name)
        else child.kill(name)
      } catch {
        /* The process group has already exited. */
      }
    }
    await new Promise<void>((done) => {
      const timer = setTimeout(() => {
        signal('SIGKILL')
        done()
      }, 2_000)
      timer.unref()
      child.once('exit', () => {
        clearTimeout(timer)
        done()
      })
      signal('SIGTERM')
    })
  }

  #remember(key: string, matchId: MatchId, bytes: Buffer): void {
    if (this.#closed) return
    const previous = this.#cache.get(key)
    if (previous) this.#cachedBytes -= previous.bytes.length
    this.#cache.delete(key)
    this.#cache.set(key, { matchId, bytes })
    this.#cachedBytes += bytes.length
    while (this.#cachedBytes > MAX_CACHE_BYTES || this.#cache.size > 128) {
      const oldest = this.#cache.entries().next().value
      if (!oldest) break
      this.#cache.delete(oldest[0])
      this.#cachedBytes -= oldest[1].bytes.length
    }
  }

  #track(matchId: MatchId, stream: Readable): Readable {
    const streams = this.#streams.get(matchId) ?? new Set<Readable>()
    this.#streams.set(matchId, streams)
    streams.add(stream)
    stream.on('error', () => {})
    stream.once('close', () => {
      streams.delete(stream)
      if (streams.size === 0 && this.#streams.get(matchId) === streams)
        this.#streams.delete(matchId)
    })
    return stream
  }

  #log(data: string): void {
    void appendFile(
      resolve(this.#config.dataDirectory, 'tts-runtime/service.log'),
      data.endsWith('\n') ? data : data + '\n',
    ).catch(() => {})
  }
}
