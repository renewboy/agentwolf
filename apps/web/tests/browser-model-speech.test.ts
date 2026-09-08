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
