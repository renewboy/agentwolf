import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import { PassThrough, type Readable } from 'node:stream'
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MatchIdSchema } from '@agentwolf/contracts'
import { EdgeSpeechService } from '../src/edge-speech-service.js'
import { loadServerConfig } from '../src/config.js'

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }))
class Child extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  readonly kill = vi.fn(() => {
    this.emit('close', null)
    return true
  })
  pid = 98_000
}
let root: string
let children: Child[]
let jobs: Child[]
let service: EdgeSpeechService
const requirements = 'edge-tts==7.2.8\n'
const id = MatchIdSchema.parse('match-edge-test')
function input(text = '测试云希。', matchId = id, signal = new AbortController().signal) {
  return { text, matchId, signal }
}
async function bytes(stream: Readable) {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}
beforeEach(async () => {
  root = await mkdtemp(resolve(tmpdir(), 'agentwolf-edge-'))
  await mkdir(resolve(root, 'scripts/tts'), { recursive: true })
  await writeFile(resolve(root, 'scripts/tts/requirements-edge.txt'), requirements)
  children = []
  jobs = []
  mocks.spawn.mockReset().mockImplementation((command: string, args: string[]) => {
    const child = new Child()
    children.push(child)
    if (command === 'uv')
      queueMicrotask(() => {
        if (args[0] === 'venv') {
          const py = resolve(args.at(-1)!, 'bin/python')
          mkdirSync(dirname(py), { recursive: true })
          writeFileSync(py, 'python')
        }
        child.stdout.write('package prepared')
        child.stderr.write('dependency info')
        child.emit('close', 0)
      })
    else jobs.push(child)
    return child
  })
  service = new EdgeSpeechService(loadServerConfig({ AGENTWOLF_PROJECT_ROOT: root }))
})
afterEach(async () => {
  await service.close()
  vi.restoreAllMocks()
  await rm(root, { recursive: true, force: true })
})

describe('Edge TTS default voice', () => {
  it('prepares a separate binary-only environment and sends visible text over stdin to fixed Yunxi', async () => {
    service.start()
    const result = service.openAudio(input())
    await vi.waitFor(() => expect(jobs).toHaveLength(1))
    const [command, args] = mocks.spawn.mock.calls.at(-1)!
    expect(command).toBe(resolve(root, '.agentwolf/tts-runtime/.venv-edge/bin/python'))
    expect(args).toEqual(['-u', '-m', 'edge_tts', '--file', '-', '--voice', 'zh-CN-YunxiNeural'])
    expect(jobs[0]!.stdin.read().toString()).toBe('测试云希。')
    jobs[0]!.stdout.write(Buffer.from('mp3'))
    const stream = await result
    jobs[0]!.emit('close', 0)
    expect(await bytes(stream)).toEqual(Buffer.from('mp3'))
    expect(mocks.spawn.mock.calls.some(([, a]) => (a as string[]).includes('--only-binary'))).toBe(
      true,
    )
    expect(
      await readFile(resolve(root, '.agentwolf/tts-runtime/dependencies-edge.sha256'), 'utf8'),
    ).toBe(createHash('sha256').update(requirements).digest('hex'))
  })
  it('uses an existing matching environment without reinstalling', async () => {
    const dir = resolve(root, '.agentwolf/tts-runtime')
    await mkdir(resolve(dir, '.venv-edge/bin'), { recursive: true })
    await writeFile(resolve(dir, '.venv-edge/bin/python'), 'python')
    await writeFile(
      resolve(dir, 'dependencies-edge.sha256'),
      createHash('sha256').update(requirements).digest('hex'),
    )
    const pending = service.openAudio(input())
    await vi.waitFor(() => expect(jobs).toHaveLength(1))
    jobs[0]!.stdout.write('mp3')
    const stream = await pending
    jobs[0]!.emit('close', 0)
    await bytes(stream)
    expect(mocks.spawn).toHaveBeenCalledOnce()
  })
  it('rejects an empty or failed synthesis before advertising playable audio', async () => {
    const pending = service.openAudio(input())
    const failed = expect(pending).rejects.toThrow('complete audio')
    await vi.waitFor(() => expect(jobs).toHaveLength(1))
    jobs[0]!.stderr.write('remote failure')
    jobs[0]!.emit('close', 1)
    await failed
  })
  it('cancels the child and stream and preserves other matches', async () => {
    const abort = new AbortController()
    const pending = service.openAudio(input('第一段', id, abort.signal))
    await vi.waitFor(() => expect(jobs).toHaveLength(1))
    jobs[0]!.stdout.write('mp3')
    const stream = await pending
    const failed = bytes(stream).catch(() => null)
    const other = service.openAudio(input('第二段', MatchIdSchema.parse('match-edge-other')))
    await vi.waitFor(() => expect(jobs).toHaveLength(2))
    jobs[1]!.stdout.write('mp3')
    const second = await other
    service.forgetMatch(id)
    expect(jobs[0]!.kill).toHaveBeenCalled()
    expect(jobs[1]!.kill).not.toHaveBeenCalled()
    await failed
    jobs[1]!.emit('close', 0)
    expect(await bytes(second)).toEqual(Buffer.from('mp3'))
  })
  it('honors cancellation while dependency preparation is pending', async () => {
    mocks.spawn.mockImplementation(() => {
      const child = new Child()
      children.push(child)
      return child
    })
    const abort = new AbortController()
    const pending = service.openAudio(input('取消。', id, abort.signal))
    const failed = expect(pending).rejects.toBeDefined()
    await vi.waitFor(() => expect(children).toHaveLength(1))
    abort.abort()
    children[0]!.emit('close', 1)
    await failed
    expect(jobs).toHaveLength(0)
  })
  it.each([false, true])(
    'stops an in-progress environment preparation (group missing: %s)',
    async (missing) => {
      mocks.spawn.mockImplementation(() => {
        const child = new Child()
        children.push(child)
        return child
      })
      service.start()
      await vi.waitFor(() => expect(children).toHaveLength(1))
      const kill = vi.spyOn(process, 'kill').mockImplementation(() => {
        if (missing) throw new Error('group exited')
        children[0]!.emit('close', null)
        return true
      })
      await service.close()
      expect(kill).toHaveBeenCalledWith(-98_000, 'SIGTERM')
      if (missing) expect(children[0]!.kill).toHaveBeenCalledWith('SIGTERM')
    },
  )

  it('does not run when default speech is explicitly disabled or the service is closed', async () => {
    await service.close()
    service = new EdgeSpeechService(
      loadServerConfig({ AGENTWOLF_PROJECT_ROOT: root, AGENTWOLF_EDGE_TTS_ENABLED: 'false' }),
    )
    service.start()
    await expect(service.openAudio(input())).rejects.toThrow('unavailable')
    expect(mocks.spawn).not.toHaveBeenCalled()
    await service.close()
    await expect(service.openAudio(input())).rejects.toThrow('unavailable')
  })
})
