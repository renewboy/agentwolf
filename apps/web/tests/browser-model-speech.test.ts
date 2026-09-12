import { waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MatchIdSchema, PlayerIdSchema, SpeechIdSchema } from '@agentwolf/contracts'
import { api } from '../src/api.js'
import { FakeMp3Audio, FakeMediaSource, installMp3Audio } from './helpers/fake-mp3-audio.js'
import { BrowserModelSpeech, type SpeechAudioIdentity } from '../src/hooks/browser-model-speech.js'
import {
  FakePcmContext,
  installPcmAudio,
  pcmResponse,
  pcmSamples,
} from './helpers/fake-pcm-audio.js'

const fetchMock = vi.fn<typeof fetch>()
const ports: BrowserModelSpeech[] = []
const matchId = MatchIdSchema.parse('match-audio-test-abcdef')
const actor = PlayerIdSchema.parse('player-2')
const key = SpeechIdSchema.parse(17)

function createPort(
  identity: SpeechAudioIdentity = {
    matchId,
    view: { kind: 'player', playerId: actor },
  },
) {
  const port = new BrowserModelSpeech(identity)
  const callbacks = { end: vi.fn(), error: vi.fn() }
  ports.push(port)
  return { port, callbacks }
}

function controlledResponse() {
  let writer!: ReadableStreamDefaultController<Uint8Array>
  const cancel = vi.fn()
  const stream = new ReadableStream<Uint8Array>({
    start: (value) => {
      writer = value
    },
    cancel,
  })
  return { response: pcmResponse(stream), writer, cancel }
}

beforeEach(() => {
  installPcmAudio()
  installMp3Audio()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  for (const port of ports.splice(0)) port.dispose()
})

describe('BrowserModelSpeech PCM output', () => {
  it('pairs subtitle pages with actual output, preloads only the next page, and completes once', async () => {
    const { port, callbacks: base } = createPort()
    const callbacks = { ...base, update: vi.fn() }
    port.setPortraitActors([actor])
    port.setCaptionCapacity(10)
    fetchMock.mockImplementation(async () =>
      pcmResponse(
        new ReadableStream({
          start(controller) {
            controller.enqueue(pcmSamples(2400))
            controller.close()
          },
        }),
      ),
    )
    port.prepare()
    port.speak('一二三四五六七八九十。再核对这张票的理由。最后看判断是否一致。', callbacks, {
      key,
      actor,
    })
    const audio = FakePcmContext.instances[0]!
    await waitFor(() => expect(audio.sources).toHaveLength(1))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(callbacks.end).not.toHaveBeenCalled()
    audio.currentTime = 0.03
    await waitFor(() =>
      expect(callbacks.update).toHaveBeenCalledWith({
        status: 'playing',
        text: '一二三四五六七八九十。',
        nextText: '再核对这张票的理由。',
      }),
    )
    expect(port.readLevel()).toBeCloseTo(0.2)
    for (let index = 0; index < 3; index++) {
      await waitFor(() => expect(audio.sources).toHaveLength(index + 1))
      audio.sources[index]!.finish()
    }
    await waitFor(() => expect(callbacks.end).toHaveBeenCalledOnce())
    const texts = fetchMock.mock.calls.map(
      ([, request]) => JSON.parse(request!.body as string).text,
    )
    expect(texts).toEqual([
      '一二三四五六七八九十。',
      '再核对这张票的理由。',
      '最后看判断是否一致。',
    ])
    expect(callbacks.error).not.toHaveBeenCalled()
    expect(port.readLevel()).toBe(0)
  })

  it('keeps a failed preload handled until the current audio finishes', async () => {
    const { port, callbacks } = createPort()
    port.setPortraitActors([actor])
    port.setCaptionCapacity(8)
    port.prepare()
    fetchMock
      .mockResolvedValueOnce(
        pcmResponse(
          new ReadableStream({
            start(controller) {
              controller.enqueue(pcmSamples())
              controller.close()
            },
          }),
        ),
      )
      .mockRejectedValueOnce(new Error('next page failed'))
    port.speak('第一段需要核对。第二段需要解释。', callbacks, { key, actor })
    const audio = FakePcmContext.instances[0]!
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(callbacks.error).not.toHaveBeenCalled()
    audio.sources[0]!.finish()
    await waitFor(() => expect(callbacks.error).toHaveBeenCalledOnce())
    expect(callbacks.end).not.toHaveBeenCalled()
  })

  it.each([true, false])(
    'preserves streaming MP3 subtitles and cancellation with Web Audio %s',
    async (webAudio) => {
      if (!webAudio) vi.stubGlobal('AudioContext', undefined)
      const { port, callbacks: base } = createPort()
      expect(port.supported).toBe(true)
      const callbacks = { ...base, update: vi.fn() }
      port.setPortraitActors([actor])
      port.setCaptionCapacity(8)
      fetchMock.mockImplementation(
        async () =>
          new Response(new Uint8Array([1, 2, 3]), {
            headers: {
              'Content-Type': 'audio/mpeg',
              'X-AgentWolf-Speech-Source': JSON.stringify({
                provider: 'edge-tts',
                voice: 'zh-CN-YunxiNeural',
                reason: 'preparing',
              }),
            },
          }),
      )
      port.prepare()
      port.speak('第一段需要核对。第二段需要解释。', callbacks, { key, actor })
      await waitFor(() => expect(FakeMediaSource.all[0]?.endOfStream).toHaveBeenCalledOnce())
      FakeMp3Audio.all[0]!.dispatchEvent(new Event('playing'))
      expect(callbacks.update).toHaveBeenLastCalledWith({
        status: 'playing',
        text: '第一段需要核对。',
        nextText: '第二段需要解释。',
      })
      expect(port.readLevel()).toBeCloseTo(webAudio ? 0.2 : 0)
      FakeMp3Audio.all[0]!.dispatchEvent(new Event('waiting'))
      expect(port.readLevel()).toBe(0)
      FakeMp3Audio.all[0]!.dispatchEvent(new Event('ended'))
      await waitFor(() => expect(FakeMediaSource.all[1]?.endOfStream).toHaveBeenCalledOnce())
      FakeMp3Audio.all[1]!.dispatchEvent(new Event('ended'))
      await waitFor(() => expect(callbacks.end).toHaveBeenCalledOnce())
      port.speak('第三段需要解释。', callbacks, { key, actor })
      await waitFor(() => expect(FakeMediaSource.all[2]?.endOfStream).toHaveBeenCalledOnce())
      port.cancel()
      const updates = callbacks.update.mock.calls.length
      FakeMp3Audio.all[2]!.dispatchEvent(new Event('playing'))
      FakeMp3Audio.all[2]!.dispatchEvent(new Event('ended'))
      expect(callbacks.end).toHaveBeenCalledOnce()
      expect(callbacks.update).toHaveBeenCalledTimes(updates)
      expect(fetchMock).toHaveBeenCalledTimes(3)
    },
  )

  it('uses prefetched subtitle pages once for an automatic presentation unit', async () => {
    const { port, callbacks } = createPort()
    port.setPortraitActors([actor])
    port.setCaptionCapacity(8)
    fetchMock.mockImplementation(async () =>
      pcmResponse(
        new ReadableStream({
          start(controller) {
            controller.enqueue(pcmSamples())
            controller.close()
          },
        }),
      ),
    )
    const unit = { text: '第一段需要核对。第二段需要解释。', context: { key, actor, unitId: 17 } }
    port.prepare()
    port.prefetch([unit])
    port.speak(unit.text, callbacks, unit.context)
    const audio = FakePcmContext.instances[0]!
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    port.prefetch([unit])
    for (let index = 0; index < 2; index++) {
      await waitFor(() => expect(audio.sources).toHaveLength(index + 1))
      audio.sources[index]!.finish()
    }
    await waitFor(() => expect(callbacks.end).toHaveBeenCalledOnce())
    expect(
      fetchMock.mock.calls.map(([, request]) => JSON.parse(request!.body as string).text),
    ).toEqual(['第一段需要核对。', '第二段需要解释。'])
    port.prefetch([])
    expect(callbacks.error).not.toHaveBeenCalled()
  })
  it('uses exact presentation identity, decodes big-endian samples across odd network chunks, and waits for the final sound', async () => {
    const { port, callbacks } = createPort()
    const { response, writer } = controlledResponse()
    fetchMock.mockResolvedValue(response)
    port.prepare()
    port.speak('相同的台词。', callbacks, { key, actor })
    const bytes = pcmSamples(3_600)
    writer.enqueue(bytes.slice(0, 17))
    writer.enqueue(bytes.slice(17, 4_801))
    writer.enqueue(bytes.slice(4_801))
    writer.close()
    const audio = FakePcmContext.instances[0]!
    await waitFor(() => expect(audio.sources).toHaveLength(2))
    const [path, request] = fetchMock.mock.calls[0]!
    expect(path).toBe(`/api/matches/${matchId}/speech-audio`)
    expect(JSON.parse(request?.body as string)).toEqual({
      speechId: key,
      text: '相同的台词。',
      view: { kind: 'player', playerId: actor },
    })
    expect(audio.sources[0]?.buffer?.data.slice(0, 2)).toEqual(new Float32Array([0.5, -1]))
    expect(audio.sources[1]?.buffer?.data).toHaveLength(1_200)
    expect(audio.sources[0]?.playbackRate.value).toBe(1)
    expect(audio.sources[1]?.start.mock.calls[0]?.[0]).toBeCloseTo(0.125)
    expect(callbacks.end).not.toHaveBeenCalled()
    audio.sources[0]!.finish()
    expect(callbacks.end).not.toHaveBeenCalled()
    audio.sources[1]!.finish()
    await waitFor(() => expect(callbacks.end).toHaveBeenCalledOnce())
    expect(callbacks.error).not.toHaveBeenCalled()
  })

  it('does not finish when the last scheduled sound ends before the network EOF', async () => {
    const { port, callbacks } = createPort()
    const { response, writer } = controlledResponse()
    fetchMock.mockResolvedValue(response)
    port.prepare()
    port.speak('未结束。', callbacks, { key, actor })
    writer.enqueue(pcmSamples(14_400))
    const audio = FakePcmContext.instances[0]!
    await waitFor(() => expect(audio.sources).toHaveLength(6))
    for (const source of audio.sources) source.finish()
    expect(callbacks.end).not.toHaveBeenCalled()
    writer.close()
    await waitFor(() => expect(callbacks.end).toHaveBeenCalledOnce())
  })

  it('aborts a pending request and rejects a late response after cancellation', async () => {
    const { port, callbacks } = createPort()
    let respond!: (value: Response) => void
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          respond = resolve
        }),
    )
    port.prepare()
    port.speak('正在等待。', callbacks, { key, actor })
    const signal = fetchMock.mock.calls[0]?.[1]?.signal
    port.cancel()
    expect(signal?.aborted).toBe(true)
    const { response, cancel } = controlledResponse()
    respond(response)
    await waitFor(() => expect(cancel).toHaveBeenCalledOnce())
    expect(FakePcmContext.instances[0]?.sources).toHaveLength(0)
    expect(callbacks.end).not.toHaveBeenCalled()
    expect(callbacks.error).not.toHaveBeenCalled()
  })

  it('stops playing and queued buffers, cancels the reader, and ignores late ended events', async () => {
    const { port, callbacks } = createPort()
    const { response, writer, cancel } = controlledResponse()
    fetchMock.mockResolvedValue(response)
    port.prepare()
    port.speak('停止。', callbacks, { key, actor })
    writer.enqueue(pcmSamples(14_400))
    const audio = FakePcmContext.instances[0]!
    await waitFor(() => expect(audio.sources).toHaveLength(6))
    port.cancel()
    await waitFor(() => expect(cancel).toHaveBeenCalledOnce())
    for (const source of audio.sources) {
      expect(source.stop).toHaveBeenCalledOnce()
      source.finish()
    }
    expect(callbacks.end).not.toHaveBeenCalled()
    expect(callbacks.error).not.toHaveBeenCalled()
  })

  it('fails a broken stream after audio starts without replaying the sentence in another voice', async () => {
    const { port, callbacks } = createPort()
    const { response, writer } = controlledResponse()
    fetchMock.mockResolvedValue(response)
    port.prepare()
    port.speak('已经开始播放。', callbacks, { key, actor })
    writer.enqueue(pcmSamples(14_400))
    const audio = FakePcmContext.instances[0]!
    await waitFor(() => expect(audio.sources).toHaveLength(6))
    audio.currentTime = 0.1
    writer.error(new Error('worker disconnected'))
    await waitFor(() => expect(callbacks.error).toHaveBeenCalledOnce())
    expect(audio.sources[0]?.stop).toHaveBeenCalledOnce()
    expect(callbacks.end).not.toHaveBeenCalled()
  })

  it.each([new Uint8Array(0), new Uint8Array([0, 1, 2])])(
    'rejects empty or truncated PCM without fallback',
    async (bytes) => {
      const { port, callbacks } = createPort()
      fetchMock.mockResolvedValue(
        pcmResponse(
          new ReadableStream({
            start(controller) {
              controller.enqueue(bytes)
              controller.close()
            },
          }),
        ),
      )
      port.prepare()
      port.speak('失败。', callbacks, { key, actor })
      await waitFor(() => expect(callbacks.error).toHaveBeenCalledOnce())
    },
  )
})

describe('BrowserModelSpeech fallback boundaries', () => {
  it.each(['Audio', 'MediaSource'])(
    'reports unavailable playback without Web Audio or %s',
    (capability) => {
      vi.stubGlobal('AudioContext', undefined)
      vi.stubGlobal(capability, undefined)
      const { port } = createPort()
      expect(port.supported).toBe(false)
    },
  )

  it.each(['tts-no-voice', 'tts-unavailable', 'tts-default-unavailable'] as const)(
    'reports %s without changing to system speech',
    async (code) => {
      const { port, callbacks } = createPort()
      fetchMock.mockResolvedValue(Response.json({ code, message: '稍后再试' }, { status: 503 }))
      port.prepare()
      port.speak('保持角色音色。', callbacks, { key, actor })
      await waitFor(() => expect(callbacks.error).toHaveBeenCalledOnce())
      expect(port.snapshot()).toBe(
        code === 'tts-no-voice'
          ? 'no-voice'
          : code === 'tts-default-unavailable'
            ? 'default-unavailable'
            : 'unavailable',
      )
    },
  )

  it('plays Yunxi immediately when the server chooses the default voice', async () => {
    const { port, callbacks } = createPort()
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: {
          'Content-Type': 'audio/mpeg',
          'X-AgentWolf-Speech-Source': JSON.stringify({
            provider: 'edge-tts',
            voice: 'zh-CN-YunxiNeural',
            reason: 'preparing',
          }),
        },
      }),
    )
    port.prepare()
    port.speak('历史发言。', callbacks, { key, actor })
    await waitFor(() => expect(port.snapshot()).toBe('default-preparing'))
    await waitFor(() => expect(FakeMediaSource.all[0]!.endOfStream).toHaveBeenCalledOnce())
    expect(fetchMock).toHaveBeenCalledOnce()
    FakeMp3Audio.all[0]!.dispatchEvent(new Event('ended'))
    await waitFor(() => expect(callbacks.end).toHaveBeenCalledOnce())
  })

  it('does not substitute a system voice when presentation identity is incomplete', () => {
    const missingMatch = createPort({ matchId: null, view: { kind: 'god' } })
    missingMatch.port.speak('历史发言。', missingMatch.callbacks, { key, actor })
    expect(missingMatch.callbacks.error).toHaveBeenCalledOnce()
    const missingSpeech = createPort()
    missingSpeech.port.speak('历史发言。', missingSpeech.callbacks)
    expect(missingSpeech.callbacks.error).toHaveBeenCalledOnce()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([400, 403, 404, 503])(
    'does not bypass speech authorization or text errors with HTTP %s',
    async (status) => {
      const { port, callbacks } = createPort()
      fetchMock.mockResolvedValue(
        Response.json({ code: 'speech-audio-not-visible', message: '不可见' }, { status }),
      )
      port.prepare()
      port.speak('不可播报。', callbacks, { key, actor })
      await waitFor(() => expect(callbacks.error).toHaveBeenCalledOnce())
    },
  )

  it('requires user audio activation and releases the unread response', async () => {
    const { port, callbacks } = createPort()
    const { response, cancel } = controlledResponse()
    fetchMock.mockResolvedValue(response)
    port.speak('需要点击。', callbacks, { key, actor })
    await waitFor(() => expect(callbacks.error).toHaveBeenCalledOnce())
    expect(port.snapshot()).toBe('activation-required')
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('validates the stream media type and parses model status at the API boundary', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('audio', { headers: { 'Content-Type': 'audio/wav' } }),
    )
    await expect(
      api.speechAudio(
        matchId,
        { speechId: key, view: { kind: 'god' }, text: '台词。' },
        new AbortController().signal,
      ),
    ).rejects.toThrow('Unsupported speech audio format')
    const status = { state: 'ready', model: 'qwen3-tts-0.6b', message: null, voices: 12 }
    fetchMock.mockResolvedValueOnce(Response.json(status))
    await expect(api.speechAudioStatus()).resolves.toEqual(status)
  })
})
