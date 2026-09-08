import { waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MatchIdSchema, PlayerIdSchema, SpeechIdSchema } from '@agentwolf/contracts'
import { BrowserEdgeMediaSpeech } from '../src/hooks/browser-edge-media-speech.js'

class Media extends EventTarget {
  static all: Media[] = []
  src = ''
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  play = vi.fn(async () => undefined)
  pause = vi.fn()
  removeAttribute = vi.fn()
  load = vi.fn()
  constructor() {
    super()
    Media.all.push(this)
  }
}
const fetchMock = vi.fn<typeof fetch>()
const revoke = vi.fn()
const matchId = MatchIdSchema.parse('match-edge-media')
const context = { key: SpeechIdSchema.parse(31), actor: PlayerIdSchema.parse('player-1') }
const ports: BrowserEdgeMediaSpeech[] = []
function create(match: typeof matchId | null = matchId) {
  const notice = vi.fn()
  const port = new BrowserEdgeMediaSpeech(() => ({ matchId: match, view: { kind: 'god' } }), notice)
  ports.push(port)
  return { port, notice, callbacks: { end: vi.fn(), error: vi.fn() } }
}
function response() {
  return new Response(new Uint8Array([1, 2, 3]), {
    headers: {
      'Content-Type': 'audio/mpeg',
      'X-AgentWolf-Speech-Source': JSON.stringify({
        provider: 'edge-tts',
        voice: 'zh-CN-YunxiNeural',
        reason: 'browser',
      }),
    },
  })
}
beforeEach(() => {
  Media.all = []
  fetchMock.mockReset().mockResolvedValue(response())
  revoke.mockReset()
  vi.stubGlobal('Audio', Media)
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal(
    'URL',
    class extends URL {
      static override createObjectURL = vi.fn(() => 'blob:edge')
      static override revokeObjectURL = revoke
    },
  )
})
afterEach(() => {
  ports.splice(0).forEach((p) => p.cancel())
  vi.unstubAllGlobals()
})
describe('default voice without Web Audio', () => {
  it('requests only visible speech and completes after the audio element ended', async () => {
    const { port, notice, callbacks } = create()
    expect(port.supported).toBe(true)
    port.speak('云希。', callbacks, context)
    await waitFor(() => expect(Media.all[0]?.play).toHaveBeenCalledOnce())
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toMatchObject({
      speechId: 31,
      text: '云希。',
      preferDefault: true,
    })
    expect(notice).toHaveBeenCalledOnce()
    expect(callbacks.end).not.toHaveBeenCalled()
    Media.all[0]!.dispatchEvent(new Event('ended'))
    expect(callbacks.end).toHaveBeenCalledOnce()
    expect(revoke).toHaveBeenCalledWith('blob:edge')
  })
  it('cancels playback, releases the object URL, and ignores late callbacks', async () => {
    const { port, callbacks } = create()
    port.speak('取消。', callbacks, context)
    await waitFor(() => expect(Media.all[0]?.play).toHaveBeenCalledOnce())
    const late = () => Media.all[0]!.dispatchEvent(new Event('ended'))
    port.cancel()
    late()
    expect(Media.all[0]!.pause).toHaveBeenCalled()
    expect(callbacks.end).not.toHaveBeenCalled()
    expect(revoke).toHaveBeenCalled()
  })
  it('rejects missing identity and absent media support', () => {
    const missing = create(null)
    missing.port.speak('无身份', missing.callbacks, context)
    expect(missing.callbacks.error).toHaveBeenCalledOnce()
    const { port, callbacks } = create()
    port.speak('无发言', callbacks)
    expect(callbacks.error).toHaveBeenCalledOnce()
    expect(fetchMock).not.toHaveBeenCalled()
    vi.stubGlobal('Audio', undefined)
    expect(port.supported).toBe(false)
  })
  it('reports transport and media failures', async () => {
    const { port, callbacks } = create()
    fetchMock.mockRejectedValueOnce(new Error('network'))
    port.speak('失败', callbacks, context)
    await waitFor(() => expect(callbacks.error).toHaveBeenCalledOnce())
    port.speak('再次播放', callbacks, context)
    await waitFor(() => expect(Media.all[0]?.play).toHaveBeenCalledOnce())
    Media.all[0]!.dispatchEvent(new Event('error'))
    expect(callbacks.error).toHaveBeenCalledTimes(2)
  })
  it('rejects an unexpected PCM response on the default media path', async () => {
    const { port, callbacks } = create()
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([0, 0]), {
        headers: { 'Content-Type': 'audio/L16;rate=24000;channels=1' },
      }),
    )
    port.speak('错误格式', callbacks, context)
    await waitFor(() => expect(callbacks.error).toHaveBeenCalledOnce())
    expect(Media.all).toHaveLength(0)
  })

  it('does not play a response received after cancellation', async () => {
    let resolve!: (value: Response) => void
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r
        }),
    )
    const { port, callbacks } = create()
    port.speak('稍后返回', callbacks, context)
    port.cancel()
    resolve(response())
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    expect(Media.all).toHaveLength(0)
    expect(callbacks.error).not.toHaveBeenCalled()
  })
})
