import { createHash } from 'node:crypto'
import type { SpawnOptions } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { PassThrough, Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CharacterIdSchema, MatchIdSchema, SpeechIdSchema } from '@agentwolf/contracts'
import type { ServerConfig } from '../src/config.js'
import type { SpeechAudioProcessOptions } from '../src/speech-audio-process.js'
import {
  SpeechAudioService,
  SpeechAudioUnavailableError,
  type SpeechAudioInput,
} from '../src/speech-audio-service.js'

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  workerConstructor: vi.fn(),
  voice: {
    characterId: 'character-audio-service-test',
    referenceFile: 'reference.flac',
    referenceText: '这是参考录音。',
    revision: 'voice-revision-test',
    sha256: '',
  },
}))
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }))
vi.mock('../src/speech-audio-process.js', () => ({ SpeechAudioProcess: mocks.workerConstructor }))
vi.mock('@agentwolf/assets/voices', () => ({ builtInCharacterVoices: [mocks.voice] }))

class PreparationChild extends EventEmitter {
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  exitCode: number | null = null
  readonly kill = vi.fn((signal: NodeJS.Signals) => {
    this.finish(null, signal)
    return true
  })
  public constructor(readonly pid: number) {
    super()
  }
  public finish(code: number | null = 0, signal: string | null = null): void {
    this.exitCode = code
    this.emit('exit', code, signal)
  }
}

const reference = Buffer.from('audio-service-test-reference')
const requirements = 'official-precompiled-wheel==1.0\n'
const services: SpeechAudioService[] = []
const children: PreparationChild[] = []
const activeStreams: PassThrough[] = []
const worker = {
  start: vi.fn<() => Promise<void>>(),
  generate:
    vi.fn<
      (text: string, reference: string, signal: AbortSignal, referenceText: string) => Readable
    >(),
  close: vi.fn<() => Promise<void>>(),
}
const terminateProcess = vi.fn<typeof process.kill>()
const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
const architecture = Object.getOwnPropertyDescriptor(process, 'arch')!
let config: ServerConfig
let directory: string
let workerOptions: SpeechAudioProcessOptions
let finishCommands = true
let commandFailure: 'exit' | 'error' | null = null
let ignoreTermination = false

function input(overrides: Partial<SpeechAudioInput> = {}): SpeechAudioInput {
  return {
    matchId: MatchIdSchema.parse('match-audio-service-test'),
    speechId: SpeechIdSchema.parse(17),
    characterId: CharacterIdSchema.parse(mocks.voice.characterId),
    text: '测试参考音色。',
    signal: new AbortController().signal,
    ...overrides,
  }
}

function createService(overrides: Partial<ServerConfig> = {}): SpeechAudioService {
  const service = new SpeechAudioService({ ...config, ...overrides })
  services.push(service)
  return service
}

async function ready(): Promise<SpeechAudioService> {
  const service = createService()
  service.start()
  await vi.waitFor(() => expect(service.status().state).toBe('ready'))
  return service
}

async function audioBytes(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    if (!Buffer.isBuffer(chunk)) throw new Error('Expected PCM bytes')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

beforeEach(async () => {
  Object.defineProperty(process, 'platform', { ...platform, value: 'darwin' })
  Object.defineProperty(process, 'arch', { ...architecture, value: 'arm64' })
  directory = await mkdtemp(resolve(tmpdir(), 'agentwolf-speech-audio-service-'))
  const projectRoot = resolve(directory, 'project')
  const dataDirectory = resolve(directory, 'custom-runtime')
  config = {
    host: '127.0.0.1',
    port: 4310,
    projectRoot,
    dataDirectory,
    databasePath: resolve(dataDirectory, 'test.sqlite'),
    publicBaseUrl: 'http://127.0.0.1:4310',
    webDistPath: resolve(projectRoot, 'apps/web/dist'),
    developerMode: false,
    publicSpeechInterruptMode: 'legacy',
    speechAudioEnabled: true,
  }
  await mkdir(resolve(projectRoot, 'scripts/tts'), { recursive: true })
  await mkdir(resolve(projectRoot, 'packages/assets/voices'), { recursive: true })
  await writeFile(resolve(projectRoot, 'scripts/tts/requirements-macos.txt'), requirements)
  await writeFile(resolve(projectRoot, 'packages/assets/voices/reference.flac'), reference)
  mocks.voice.sha256 = createHash('sha256').update(reference).digest('hex')
  finishCommands = true
  commandFailure = null
  ignoreTermination = false
  children.length = 0
  worker.start.mockReset().mockResolvedValue(undefined)
  worker.close.mockReset().mockResolvedValue(undefined)
  worker.generate
    .mockReset()
    .mockImplementation(() => Readable.from([Buffer.from([0x40, 0, 0x80, 0])]))
  mocks.workerConstructor.mockReset().mockImplementation(function (
    options: SpeechAudioProcessOptions,
  ) {
    workerOptions = options
    return worker
  })
  mocks.spawn
    .mockReset()
    .mockImplementation((_command: string, args: string[], _options: SpawnOptions) => {
      const child = new PreparationChild(90_000 + children.length)
      children.push(child)
      if (finishCommands)
        queueMicrotask(() => {
          if (commandFailure === 'error') {
            child.emit('error', new Error('spawn failed'))
            return
          }
          if (commandFailure === 'exit') {
            child.finish(1)
            return
          }
          if (args[0] === 'venv') {
            const python = resolve(args.at(-1)!, 'bin/python')
            mkdirSync(dirname(python), { recursive: true })
            writeFileSync(python, 'test-python')
          }
          child.stdout.write('preparation stdout\n')
          child.stderr.write('preparation stderr\n')
          child.finish()
        })
      return child
    })
  terminateProcess.mockReset().mockImplementation((pid, signal) => {
    const child = children.find((entry) => entry.pid === -pid)
    if (!child) throw new Error('Unknown test process group')
    if (!(ignoreTermination && signal === 'SIGTERM')) child.finish(null, signal as NodeJS.Signals)
    return true
  })
  vi.spyOn(process, 'kill').mockImplementation(terminateProcess)
})

afterEach(async () => {
  vi.useRealTimers()
  ignoreTermination = false
  for (const stream of activeStreams.splice(0)) stream.destroy()
  await Promise.all(services.splice(0).map((service) => service.close()))
  Object.defineProperty(process, 'platform', platform)
  Object.defineProperty(process, 'arch', architecture)
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

describe('speech audio model preparation', () => {
  it('publishes validated progress across fragmented preparation output and clears it when ready', async () => {
    const original = mocks.spawn.getMockImplementation()!
    let preparation!: PreparationChild
    mocks.spawn.mockImplementation((command: string, args: string[], options: SpawnOptions) => {
      if (args.includes('--watch-parent')) {
        preparation = new PreparationChild(90_000 + children.length)
        children.push(preparation)
        expect(options.stdio).toEqual(['pipe', 'pipe', 'pipe'])
        return preparation
      }
      return original(command, args, options)
    })
    const service = createService()
    service.start()
    await vi.waitFor(() => expect(preparation).toBeDefined())
    const progress = { stage: 'downloading', downloadedBytes: 400, totalBytes: 1000 }
    const message = JSON.stringify({ type: 'progress', progress }) + '\n'
    preparation.stdout.write(message.slice(0, 30))
    preparation.stdout.write(message.slice(30))
    expect(service.status().progress).toEqual(progress)
    preparation.stdout.write(
      JSON.stringify({ type: 'progress', progress: { ...progress, downloadedBytes: 2000 } }) + '\n',
    )
    expect(service.status().progress).toEqual(progress)
    preparation.finish()
    await vi.waitFor(() => expect(service.status().state).toBe('ready'))
    expect(service.status().progress).toBeUndefined()
  })

  it('installs the portable backend, retries CPU wheels, and reports actual worker capabilities', async () => {
    Object.defineProperty(process, 'platform', { ...platform, value: 'linux' })
    Object.defineProperty(process, 'arch', { ...architecture, value: 'x64' })
    await writeFile(
      resolve(config.projectRoot, 'scripts/tts/requirements-portable.txt'),
      requirements,
    )
    const original = mocks.spawn.getMockImplementation()!
    mocks.spawn.mockImplementation((command: string, args: string[], options: SpawnOptions) => {
      if (args.includes('auto')) {
        const child = new PreparationChild(90_000 + children.length)
        children.push(child)
        queueMicrotask(() => child.finish(1))
        return child
      }
      return original(command, args, options)
    })
    const backend = {
      id: 'cpu',
      device: 'cpu',
      engine: 'qwen-tts',
      precision: 'float32',
      codecPrecision: 'float32',
      streaming: false,
      optimization: 'sdpa',
    } as const
    worker.start.mockImplementation(async () => workerOptions.onReady?.(backend))
    const service = await ready()
    expect(service.status().backend).toEqual(backend)
    expect(mocks.spawn.mock.calls.some(([, args]) => (args as string[]).includes('auto'))).toBe(
      true,
    )
    expect(mocks.spawn.mock.calls.some(([, args]) => (args as string[]).includes('cpu'))).toBe(true)
  })

  it('starts in the background, prepares only binary dependencies inside dataDirectory, and materializes reference voices', async () => {
    const service = createService()
    expect(service.start()).toBeUndefined()
    service.start()
    expect(service.status().state).toBe('preparing')
    await vi.waitFor(() =>
      expect(service.status()).toMatchObject({
        state: 'ready',
        voices: 1,
        model: 'qwen3-tts-0.6b',
      }),
    )
    service.start()
    const python = resolve(config.dataDirectory, 'tts-runtime/.venv-qwen-macos/bin/python')
    expect(mocks.spawn.mock.calls.map(([command, args]) => ({ command, args }))).toEqual([
      {
        command: 'uv',
        args: [
          'venv',
          '--python',
          '3.12',
          resolve(config.dataDirectory, 'tts-runtime/.venv-qwen-macos'),
        ],
      },
      {
        command: 'uv',
        args: [
          'pip',
          'install',
          '--only-binary',
          ':all:',
          '--python',
          python,
          '-r',
          resolve(config.projectRoot, 'scripts/tts/requirements-macos.txt'),
        ],
      },
      {
        command: python,
        args: [
          '-u',
          resolve(config.projectRoot, 'scripts/tts/prepare.py'),
          '--data-dir',
          config.dataDirectory,
          '--watch-parent',
        ],
      },
    ])
    for (const call of mocks.spawn.mock.calls) {
      const options = call[2] as SpawnOptions
      expect({
        cwd: options.cwd,
        cache: options.env?.['UV_CACHE_DIR'],
        python: options.env?.['UV_PYTHON_INSTALL_DIR'],
        tmp: options.env?.['TMPDIR'],
        pipUser: options.env?.['PIP_USER'],
      }).toEqual({
        cwd: config.projectRoot,
        cache: resolve(config.dataDirectory, 'tts-runtime/uv-cache'),
        python: resolve(config.dataDirectory, 'tts-runtime/python'),
        tmp: resolve(config.dataDirectory, 'tts-runtime/tmp'),
        pipUser: 'false',
      })
    }
    expect(workerOptions).toMatchObject({
      python,
      script: resolve(config.projectRoot, 'scripts/tts/runtime.py'),
      dataDirectory: config.dataDirectory,
    })
    expect(
      await readFile(resolve(config.dataDirectory, 'voice-library/builtin/reference.flac')),
    ).toEqual(reference)
    expect(
      await readFile(
        resolve(config.dataDirectory, 'tts-runtime/dependencies-qwen-macos.sha256'),
        'utf8',
      ),
    ).toBe(createHash('sha256').update(requirements).digest('hex'))
    workerOptions.onLog('worker message')
    await vi.waitFor(async () =>
      expect(
        await readFile(resolve(config.dataDirectory, 'tts-runtime/service.log'), 'utf8'),
      ).toContain('worker message\n'),
    )
  })

  it('reuses an installed matching dependency environment and exposes loading until the worker is ready', async () => {
    const runtime = resolve(config.dataDirectory, 'tts-runtime')
    await mkdir(resolve(runtime, '.venv-qwen-macos/bin'), { recursive: true })
    await writeFile(resolve(runtime, '.venv-qwen-macos/bin/python'), 'existing test interpreter')
    await writeFile(
      resolve(runtime, 'dependencies-qwen-macos.sha256'),
      createHash('sha256').update(requirements).digest('hex'),
    )
    let finishLoading!: () => void
    worker.start.mockImplementation(
      () =>
        new Promise((resolveStart) => {
          finishLoading = resolveStart
        }),
    )
    const service = createService()
    service.start()
    await vi.waitFor(() => expect(service.status().state).toBe('loading'))
    expect(mocks.spawn.mock.calls.map(([command]) => command)).toEqual([
      resolve(runtime, '.venv-qwen-macos/bin/python'),
    ])
    finishLoading()
    await vi.waitFor(() => expect(service.status().state).toBe('ready'))
  })

  it('does not prepare disabled speech or unknown voices', async () => {
    const service = createService({ speechAudioEnabled: false })
    service.start()
    expect(service.status().state).toBe('disabled')
    expect(service.hasVoice(input().characterId)).toBe(true)
    expect(service.hasVoice(CharacterIdSchema.parse('character-no-reference'))).toBe(false)
    await expect(service.openAudio(input())).rejects.toBeInstanceOf(SpeechAudioUnavailableError)
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it('installs dependencies after rebuilding a missing virtual environment even when the old hash marker remains', async () => {
    const runtime = resolve(config.dataDirectory, 'tts-runtime')
    await mkdir(runtime, { recursive: true })
    await writeFile(
      resolve(runtime, 'dependencies-qwen-macos.sha256'),
      createHash('sha256').update(requirements).digest('hex'),
    )
    await ready()
    const commands = mocks.spawn.mock.calls.map(([command, args]) => ({ command, args }))
    expect(commands).toHaveLength(3)
    expect(commands[1]).toMatchObject({
      command: 'uv',
      args: expect.arrayContaining(['pip', 'install', '--only-binary', ':all:']),
    })
  })

  it.each([
    ['win32', 'arm64'],
    ['darwin', 'x64'],
  ])('reports unsupported %s/%s without installing dependencies', (platformValue, archValue) => {
    Object.defineProperty(process, 'platform', { ...platform, value: platformValue })
    Object.defineProperty(process, 'arch', { ...architecture, value: archValue })
    const service = createService()
    service.start()
    expect(service.status()).toMatchObject({
      state: 'error',
      message: expect.stringContaining('64 位'),
    })
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it.each(['exit', 'error'] as const)(
    'reports preparation %s failures and can retry',
    async (failure) => {
      commandFailure = failure
      const service = createService()
      service.start()
      await vi.waitFor(() => expect(service.status().state).toBe('error'))
      expect(worker.start).not.toHaveBeenCalled()
      commandFailure = null
      const time = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31_000)
      service.start()
      await vi.waitFor(() => expect(service.status().state).toBe('ready'))
      time.mockRestore()
    },
  )

  it('automatically restarts an exited worker without another playback request', async () => {
    const service = await ready()
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    workerOptions.onExit(new Error('worker stopped'))
    expect(service.status().state).toBe('error')
    await vi.advanceTimersByTimeAsync(5_000)
    vi.useRealTimers()
    await vi.waitFor(() => expect(worker.start).toHaveBeenCalledTimes(2))
    expect(service.status().state).toBe('ready')
  })

  it('rejects a corrupted reference before starting the model worker', async () => {
    await writeFile(
      resolve(config.projectRoot, 'packages/assets/voices/reference.flac'),
      'corrupted voice',
    )
    const service = createService()
    service.start()
    await vi.waitFor(() => expect(service.status().state).toBe('error'))
    await vi.waitFor(async () =>
      expect(
        await readFile(resolve(config.dataDirectory, 'tts-runtime/service.log'), 'utf8'),
      ).toContain('Character voice checksum mismatch'),
    )
    expect(worker.start).not.toHaveBeenCalled()
  })

  it('rejects requests before readiness and after a worker failure', async () => {
    const service = createService()
    await expect(service.openAudio(input())).rejects.toBeInstanceOf(SpeechAudioUnavailableError)
    service.start()
    await vi.waitFor(() => expect(service.status().state).toBe('ready'))
    await expect(
      service.openAudio(input({ characterId: CharacterIdSchema.parse('character-unknown') })),
    ).rejects.toBeInstanceOf(SpeechAudioUnavailableError)
    workerOptions.onExit(new Error('worker crashed'))
    expect(service.status()).toMatchObject({
      state: 'error',
      message: expect.stringContaining('已停止'),
    })
    await expect(service.openAudio(input())).rejects.toBeInstanceOf(SpeechAudioUnavailableError)
  })
})

describe('speech audio cache and cancellation', () => {
  it('forgets only the selected Match while another in-flight Match continues and remains cacheable', async () => {
    const service = await ready()
    const first = input()
    const second = input({ matchId: MatchIdSchema.parse('match-audio-surviving') })
    const firstSource = new PassThrough()
    const secondSource = new PassThrough()
    activeStreams.push(firstSource, secondSource)
    worker.generate.mockReturnValueOnce(firstSource).mockReturnValueOnce(secondSource)
    const firstOutput = await service.openAudio(first)
    const secondOutput = await service.openAudio(second)
    const firstRejected = expect(audioBytes(firstOutput)).rejects.toThrow(
      'Match audio is no longer available',
    )
    const secondComplete = audioBytes(secondOutput)
    firstSource.write(Buffer.from([0x10, 0]))
    secondSource.write(Buffer.from([0x20, 0]))
    service.forgetMatch(first.matchId)
    await firstRejected
    await vi.waitFor(() => expect(firstSource.destroyed).toBe(true))
    expect(secondSource.destroyed).toBe(false)
    expect(secondOutput.destroyed).toBe(false)
    secondSource.end(Buffer.from([0x30, 0]))
    const expected = Buffer.from([0x20, 0, 0x30, 0])
    expect(await secondComplete).toEqual(expected)
    expect(await audioBytes(await service.openAudio(second))).toEqual(expected)
    expect(worker.generate).toHaveBeenCalledTimes(2)
  })

  it('does not repopulate a forgotten key when the cancelled source completes late', async () => {
    const service = await ready()
    const request = input()
    const source = new PassThrough()
    activeStreams.push(source)
    worker.generate.mockReturnValueOnce(source)
    const output = await service.openAudio(request)
    const rejected = expect(audioBytes(output)).rejects.toThrow(
      'Match audio is no longer available',
    )
    source.write(Buffer.from([0x11, 0x22]))
    service.forgetMatch(request.matchId)
    source.end(Buffer.from([0x33, 0x44]))
    await rejected
    expect(await audioBytes(await service.openAudio(request))).toEqual(
      Buffer.from([0x40, 0, 0x80, 0]),
    )
    expect(worker.generate).toHaveBeenCalledTimes(2)
  })

  it.each(['forget', 'close'] as const)(
    'destroys unconsumed cached Readables on %s',
    async (action) => {
      const service = await ready()
      const request = input()
      await audioBytes(await service.openAudio(request))
      const cached = await service.openAudio(request)
      const anotherCached = await service.openAudio(request)
      expect(cached.readableFlowing).toBeNull()
      expect(anotherCached.readableFlowing).toBeNull()
      expect(worker.generate).toHaveBeenCalledOnce()
      if (action === 'forget') service.forgetMatch(request.matchId)
      else await service.close()
      expect(cached.destroyed).toBe(true)
      expect(anotherCached.destroyed).toBe(true)
      const message =
        action === 'forget'
          ? 'Match audio is no longer available'
          : 'Speech audio service is closed'
      await expect(audioBytes(cached)).rejects.toThrow(message)
      await expect(audioBytes(anotherCached)).rejects.toThrow(message)
    },
  )

  it('caches complete audio by Match, speech and text and only forgets the requested Match', async () => {
    const service = await ready()
    const first = input()
    const second = input({ matchId: MatchIdSchema.parse('match-audio-other') })
    expect(await audioBytes(await service.openAudio(first))).toEqual(
      Buffer.from([0x40, 0, 0x80, 0]),
    )
    await audioBytes(await service.openAudio(first))
    expect(worker.generate).toHaveBeenCalledOnce()
    expect(worker.generate.mock.calls[0]).toEqual([
      first.text,
      resolve(config.dataDirectory, 'voice-library/builtin/reference.flac'),
      first.signal,
      '这是参考录音。',
    ])
    await audioBytes(await service.openAudio(second))
    await audioBytes(await service.openAudio(input({ text: '不同的句子。' })))
    service.forgetMatch(first.matchId)
    await audioBytes(await service.openAudio(second))
    expect(worker.generate).toHaveBeenCalledTimes(3)
    await audioBytes(await service.openAudio(first))
    expect(worker.generate).toHaveBeenCalledTimes(4)
  })

  it('evicts the least recently used entry when the cache exceeds its entry limit', async () => {
    const service = await ready()
    for (let id = 1; id <= 128; id += 1)
      await audioBytes(await service.openAudio(input({ speechId: SpeechIdSchema.parse(id) })))
    await audioBytes(await service.openAudio(input({ speechId: SpeechIdSchema.parse(1) })))
    await audioBytes(await service.openAudio(input({ speechId: SpeechIdSchema.parse(129) })))
    expect(worker.generate).toHaveBeenCalledTimes(129)
    await audioBytes(await service.openAudio(input({ speechId: SpeechIdSchema.parse(1) })))
    expect(worker.generate).toHaveBeenCalledTimes(129)
    await audioBytes(await service.openAudio(input({ speechId: SpeechIdSchema.parse(2) })))
    expect(worker.generate).toHaveBeenCalledTimes(130)
  })

  it('does not retain a generated response larger than the cache byte limit', async () => {
    const service = await ready()
    worker.generate.mockImplementationOnce(() => Readable.from([Buffer.alloc(33 * 1_024 * 1_024)]))
    let bytes = 0
    for await (const chunk of await service.openAudio(input())) {
      if (!Buffer.isBuffer(chunk)) throw new Error('Expected PCM bytes')
      bytes += chunk.length
    }
    expect(bytes).toBe(33 * 1_024 * 1_024)
    await audioBytes(await service.openAudio(input()))
    expect(worker.generate).toHaveBeenCalledTimes(2)
  })

  it('propagates cancellation to the worker stream, rejects partial output, and does not cache it', async () => {
    const service = await ready()
    const abort = new AbortController()
    worker.generate.mockImplementationOnce((_text, _reference, signal) => {
      const stream = new PassThrough()
      activeStreams.push(stream)
      signal.addEventListener(
        'abort',
        () => stream.destroy(new DOMException('Cancelled', 'AbortError')),
        { once: true },
      )
      stream.write(Buffer.from([0x40, 0]))
      return stream
    })
    const stream = await service.openAudio(input({ signal: abort.signal }))
    const rejected = expect(audioBytes(stream)).rejects.toMatchObject({ name: 'AbortError' })
    abort.abort()
    await rejected
    await audioBytes(await service.openAudio(input()))
    expect(worker.generate).toHaveBeenCalledTimes(2)
    const alreadyAborted = new AbortController()
    alreadyAborted.abort()
    await expect(service.openAudio(input({ signal: alreadyAborted.signal }))).rejects.toMatchObject(
      { name: 'AbortError' },
    )
  })

  it('cancels cached playback and stops its source when a consumer releases unfinished output', async () => {
    const service = await ready()
    await audioBytes(await service.openAudio(input()))
    const abort = new AbortController()
    const cached = await service.openAudio(input({ signal: abort.signal }))
    const rejected = expect(audioBytes(cached)).rejects.toMatchObject({ name: 'AbortError' })
    abort.abort()
    await rejected
    expect(worker.generate).toHaveBeenCalledOnce()
    const source = new PassThrough()
    activeStreams.push(source)
    worker.generate.mockReturnValueOnce(source)
    const output = await service.openAudio(input({ text: '未完成的另一段。' }))
    output.destroy()
    await vi.waitFor(() => expect(source.destroyed).toBe(true))
  })
})

describe('speech audio service shutdown', () => {
  it('closes the loaded worker once, ignores its late exit callback, and rejects further work', async () => {
    const service = await ready()
    await service.close()
    await service.close()
    service.start()
    expect(worker.close).toHaveBeenCalledOnce()
    expect(mocks.workerConstructor).toHaveBeenCalledOnce()
    const state = service.status()
    workerOptions.onExit(new Error('late exit'))
    expect(service.status()).toEqual(state)
    await expect(service.openAudio(input())).rejects.toBeInstanceOf(SpeechAudioUnavailableError)
  })

  it('terminates an active preparation process group and prevents later preparation commands', async () => {
    finishCommands = false
    const service = createService()
    service.start()
    await vi.waitFor(() => expect(children).toHaveLength(1))
    await service.close()
    expect(terminateProcess).toHaveBeenCalledExactlyOnceWith(-children[0]!.pid, 'SIGTERM')
    expect(mocks.spawn).toHaveBeenCalledOnce()
    expect(worker.start).not.toHaveBeenCalled()
  })

  it('escalates an unresponsive preparation group after a bounded shutdown wait', async () => {
    finishCommands = false
    ignoreTermination = true
    const service = createService()
    service.start()
    await vi.waitFor(() => expect(children).toHaveLength(1))
    vi.useFakeTimers()
    const closing = service.close()
    await vi.advanceTimersByTimeAsync(2_000)
    await closing
    expect(terminateProcess).toHaveBeenNthCalledWith(1, -children[0]!.pid, 'SIGTERM')
    expect(terminateProcess).toHaveBeenNthCalledWith(2, -children[0]!.pid, 'SIGKILL')
  })
})
