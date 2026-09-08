import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawn: mocks.spawn,
}))

import { SpeechAudioProcess } from '../src/speech-audio-process.js'

interface Command {
  readonly id: string
  readonly text?: string
  readonly reference?: string
  readonly type?: string
}

type ShutdownSignal = 'SIGTERM' | 'SIGKILL'

class FakeWorker extends EventEmitter {
  public readonly stdin = new PassThrough()
  public readonly stdout = new PassThrough()
  public readonly stderr = new PassThrough()
  public readonly commands: Command[] = []
  public exitCode: number | null = null
  public signalCode: ShutdownSignal | null = null
  public pid: number | undefined = 123
  public ignoreTerm = false
  public readonly kill = vi.fn((signal: ShutdownSignal) => {
    if (!this.ignoreTerm || signal === 'SIGKILL') {
      queueMicrotask(() => this.exit(signal))
    }
    return true
  })

  public constructor() {
    super()
    this.stdin.on('data', (chunk: Buffer) => {
      this.commands.push(JSON.parse(chunk.toString('utf8')) as Command)
    })
  }

  public send(...messages: readonly unknown[]): void {
    this.stdout.write(messages.map((message) => JSON.stringify(message) + '\n').join(''))
  }

  public exit(signal: ShutdownSignal = 'SIGTERM'): void {
    this.signalCode = signal
    this.emit('exit', null, signal)
  }
}

const processes: SpeechAudioProcess[] = []

beforeEach(() => {
  mocks.spawn.mockReset()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(async () => {
  const closed = Promise.all(processes.splice(0).map((process) => process.close()))
  await vi.advanceTimersByTimeAsync(2_000)
  await closed
  vi.useRealTimers()
})

function create(ready = true) {
  const worker = new FakeWorker()
  mocks.spawn.mockReturnValue(worker)
  const onExit = vi.fn()
  const onLog = vi.fn()
  const process = new SpeechAudioProcess({
    python: '/test/python',
    script: '/test/worker.py',
    dataDirectory: '/test/data',
    onExit,
    onLog,
  })
  processes.push(process)
  const started = process.start()
  if (ready) worker.send({ type: 'ready' })
  return { worker, process, started, onExit, onLog }
}

const signal = () => new AbortController().signal
const meta = (id: string) => ({
  type: 'meta',
  id,
  sampleRate: 24_000,
  channels: 1,
  format: 'pcm_s16le',
})
const audio = (id: string, bytes = Buffer.from([0x34, 0x12]), sequence = 0) => ({
  type: 'audio',
  id,
  sequence,
  pcm: bytes.toString('base64'),
})
const done = (id: string, frames = 1) => ({ type: 'done', id, frames })
const tick = () => new Promise<void>((resolve) => setImmediate(resolve))

async function collect(stream: PassThrough): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array))
  return Buffer.concat(chunks)
}

describe('SpeechAudioProcess', () => {
  it('completes the next queued request when a backpressured audio chunk and done share a batch', async () => {
    const { process, worker, started, onExit } = create()
    await started
    const first = process.generate('第一段', '/voices/a.flac', signal(), '这是参考录音。')
    const second = process.generate('第二段', '/voices/b.flac', signal(), '这是参考录音。')
    const firstId = worker.commands[0]!.id
    const large = Buffer.alloc(200_000, Buffer.from([0x34, 0x12]))
    worker.send(meta(firstId), audio(firstId, large), done(firstId, large.length / 2))
    expect(first.writableEnded).toBe(true)
    expect(first.listenerCount('drain')).toBe(0)
    expect(worker.stdout.isPaused()).toBe(false)
    expect(worker.commands.map(({ text }) => text)).toEqual(['第一段', '第二段'])
    const secondId = worker.commands[1]!.id
    worker.send(meta(secondId), audio(secondId), done(secondId))
    expect(await collect(second)).toEqual(Buffer.from([0x12, 0x34]))
    expect(await collect(first)).toEqual(Buffer.from(large).swap16())
    expect(onExit).not.toHaveBeenCalled()
  })

  it('resumes a paused worker when the current consumer drains its PCM buffer', async () => {
    const { process, worker, started } = create()
    await started
    const stream = process.generate('继续', '/voices/a.flac', signal(), '这是参考录音。')
    const id = worker.commands[0]!.id
    const large = Buffer.alloc(200_000)
    worker.send(meta(id), audio(id, large))
    expect(worker.stdout.isPaused()).toBe(true)
    const result = collect(stream)
    await tick()
    expect(worker.stdout.isPaused()).toBe(false)
    worker.send(done(id, large.length / 2))
    expect(await result).toHaveLength(large.length)
  })

  it('isolates cancelled requests, removes queued work and ignores late audio from the previous job', async () => {
    const { process, worker, started, onExit } = create()
    await started
    const activeAbort = new AbortController()
    const queuedAbort = new AbortController()
    const active = process.generate(
      '取消当前',
      '/voices/a.flac',
      activeAbort.signal,
      '这是参考录音。',
    )
    const queued = process.generate(
      '取消排队',
      '/voices/b.flac',
      queuedAbort.signal,
      '这是参考录音。',
    )
    const next = process.generate('保留', '/voices/c.flac', signal(), '这是参考录音。')
    const previousId = worker.commands[0]!.id
    worker.send(meta(previousId), audio(previousId, Buffer.alloc(200_000)))
    queuedAbort.abort()
    expect(queued.destroyed).toBe(true)
    expect(worker.stdout.isPaused()).toBe(true)
    activeAbort.abort()
    expect(active.destroyed).toBe(true)
    expect(active.listenerCount('drain')).toBe(0)
    expect(worker.stdout.isPaused()).toBe(false)
    expect(worker.commands[1]).toEqual({ type: 'cancel', id: previousId })
    worker.send(audio(previousId, Buffer.from([9, 9]), 1), { type: 'cancelled', id: previousId })
    await tick()
    expect(worker.commands[2]?.text).toBe('保留')
    const nextId = worker.commands[2]!.id
    worker.send(audio(previousId), done(previousId), meta(nextId), audio(nextId), done(nextId))
    expect(await collect(next)).toEqual(Buffer.from([0x12, 0x34]))
    expect(onExit).not.toHaveBeenCalled()
  })

  it('cancels an abandoned output stream even when its AbortSignal has not fired', async () => {
    const { process, worker, started } = create()
    await started
    const stream = process.generate('断开', '/voices/a.flac', signal(), '这是参考录音。')
    const id = worker.commands[0]!.id
    worker.send(meta(id), audio(id, Buffer.alloc(200_000)))
    stream.destroy()
    await tick()
    expect(worker.commands[1]).toEqual({ type: 'cancel', id })
    expect(worker.stdout.isPaused()).toBe(false)
    worker.send({ type: 'cancelled', id })
  })

  it('fails malformed protocol once and cannot recover from a late ready message or restart', async () => {
    const { process, worker, started, onExit } = create()
    await started
    const stream = process.generate('坏协议', '/voices/a.flac', signal(), '这是参考录音。')
    const id = worker.commands[0]!.id
    worker.send(meta(id), audio(id, Buffer.alloc(200_000)), { type: 'unknown' })
    expect(stream.destroyed).toBe(true)
    expect(worker.stdout.isPaused()).toBe(false)
    worker.send({ type: 'ready' })
    worker.stdin.emit('error', new Error('late EPIPE'))
    await tick()
    expect(onExit).toHaveBeenCalledTimes(1)
    expect(worker.kill).toHaveBeenCalledExactlyOnceWith('SIGTERM')
    expect(() => process.generate('重试', '/voices/a.flac', signal(), '这是参考录音。')).toThrow(
      'not ready',
    )
    await expect(process.start()).rejects.toThrow('can only start once')
    expect(mocks.spawn).toHaveBeenCalledTimes(1)
  })

  it('rejects startup on close, ignores late ready and forcibly exits a worker that ignores SIGTERM', async () => {
    const { process, worker, started, onExit } = create(false)
    worker.ignoreTerm = true
    const rejected = expect(started).rejects.toThrow('is closed')
    const closed = process.close()
    const closedAgain = process.close()
    worker.send({ type: 'ready' })
    await rejected
    expect(() => process.generate('迟到', '/voices/a.flac', signal(), '这是参考录音。')).toThrow(
      'not ready',
    )
    expect(worker.kill).toHaveBeenCalledExactlyOnceWith('SIGTERM')
    await vi.advanceTimersByTimeAsync(2_000)
    await Promise.all([closed, closedAgain])
    expect(worker.kill.mock.calls).toEqual([['SIGTERM'], ['SIGKILL']])
    expect(onExit).not.toHaveBeenCalled()
    await expect(process.start()).rejects.toThrow('is closed')
  })

  it('bounds fault cleanup and cancellation when a worker never acknowledges a request', async () => {
    const { process, worker, started, onExit } = create()
    await started
    worker.ignoreTerm = true
    const abort = new AbortController()
    const stream = process.generate('取消', '/voices/a.flac', abort.signal, '这是参考录音。')
    const queued = process.generate('排队', '/voices/b.flac', signal(), '这是参考录音。')
    abort.abort()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(stream.destroyed).toBe(true)
    expect(queued.destroyed).toBe(true)
    expect(onExit).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(worker.kill.mock.calls).toEqual([['SIGTERM'], ['SIGKILL']])
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('rejects startup for a spawn failure and for a worker that never becomes ready', async () => {
    const first = create(false)
    const spawnRejected = expect(first.started).rejects.toThrow('ENOENT')
    first.worker.pid = undefined
    first.worker.emit('error', new Error('ENOENT'))
    await spawnRejected
    expect(first.onExit).toHaveBeenCalledTimes(1)
    expect(first.worker.kill).not.toHaveBeenCalled()
    const second = create(false)
    const timeoutRejected = expect(second.started).rejects.toThrow('loading timed out')
    await vi.advanceTimersByTimeAsync(300_000)
    await timeoutRejected
    expect(second.onExit).toHaveBeenCalledTimes(1)
  })

  it('handles split UTF-8 error messages and stderr without restoring a failed process', async () => {
    const { worker, started, onExit, onLog } = create(false)
    const rejected = expect(started).rejects.toThrow('模型缺失')
    worker.stderr.write('准备日志')
    const bytes = Buffer.from('\n' + JSON.stringify({ type: 'error', message: '模型缺失' }) + '\n')
    const split = bytes.indexOf(Buffer.from('模')) + 1
    worker.stdout.write(bytes.subarray(0, split))
    worker.stdout.write(bytes.subarray(split))
    await rejected
    expect(onLog).toHaveBeenCalledWith('准备日志')
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('does not report startup success when ready is immediately followed by a fatal worker error', async () => {
    const { worker, started, onExit } = create(false)
    const rejected = expect(started).rejects.toThrow('not ready')
    worker.send({ type: 'ready' }, { type: 'error', message: 'worker stopped during startup' })
    await rejected
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['audio before metadata', (id: string) => [audio(id)]],
    ['invalid sequence', (id: string) => [meta(id), audio(id, Buffer.alloc(2), 1)]],
    ['duplicate metadata', (id: string) => [meta(id), meta(id)]],
    ['odd PCM length', (id: string) => [meta(id), audio(id, Buffer.alloc(1))]],
    ['wrong final length', (id: string) => [meta(id), audio(id), done(id, 2)]],
  ])('rejects %s without reporting a successful audio stream', async (_name, messages) => {
    const { process, worker, started, onExit } = create()
    await started
    const stream = process.generate('测试', '/voices/a.flac', signal(), '这是参考录音。')
    const result = expect(collect(stream)).rejects.toThrow()
    worker.send(...messages(worker.commands[0]!.id))
    await result
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('releases backpressure after a per-request error and keeps the next request usable', async () => {
    const { process, worker, started, onLog, onExit } = create()
    await started
    const first = process.generate('失败', '/voices/a.flac', signal(), '这是参考录音。')
    const next = process.generate('继续', '/voices/b.flac', signal(), '这是参考录音。')
    const id = worker.commands[0]!.id
    worker.send(meta(id), audio(id, Buffer.alloc(200_000)), {
      type: 'error',
      id,
      message: 'bad model turn',
    })
    expect(first.destroyed).toBe(true)
    expect(first.listenerCount('drain')).toBe(0)
    const nextId = worker.commands[1]!.id
    worker.send(meta(nextId), audio(nextId), done(nextId))
    expect(await collect(next)).toEqual(Buffer.from([0x12, 0x34]))
    expect(onLog).toHaveBeenCalledWith(expect.stringContaining('bad model turn'))
    expect(onExit).not.toHaveBeenCalled()
  })
})
