import { PassThrough, Readable } from 'node:stream'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'
import {
  MatchViewSchema,
  SPEECH_AUDIO_CONTENT_TYPE,
  SpeechAudioErrorSchema,
  SpeechAudioStatusSchema,
  type MatchView,
  type SpeechAudioStatus,
  type SpectatorView,
} from '@agentwolf/contracts'
import type { MatchManager } from '../src/match-manager.js'
import { registerSpeechAudioRoutes } from '../src/speech-audio-routes.js'
import { DirectSpeechResponse } from '../src/direct-speech-response.js'
import { StreamedSpeechBuffer } from '../src/streamed-speech-buffer.js'
import {
  SpeechAudioUnavailableError,
  type SpeechAudioProvider,
} from '../src/speech-audio-service.js'

const apps: FastifyInstance[] = []
const streams: PassThrough[] = []
const pcm = Buffer.from([0x40, 0x00, 0x80, 0x00, 0x00, 0x01])
const status: SpeechAudioStatus = {
  state: 'ready',
  model: 'qwen3-tts-0.6b',
  message: null,
  voices: 2,
}

function projectedMatch(): MatchView {
  return MatchViewSchema.parse({
    id: 'match-speech-audio-routes',
    boardId: 'board-speech-audio-test',
    boardName: '语音测试',
    status: 'running',
    day: 1,
    phaseId: 'test-speech',
    phaseLabel: '测试发言',
    lastSequence: 50,
    seats: [
      {
        playerId: 'player-1',
        seat: 1,
        name: '测试一',
        character: {
          id: 'character-speech-conan',
          name: '测试柯南',
          universe: '测试',
          portraitAssetId: 'portrait-speech-one',
          revision: 1,
          source: 'built-in',
          editable: false,
        },
      },
      {
        playerId: 'player-2',
        seat: 2,
        name: '测试二',
        character: {
          id: 'character-speech-haibara',
          name: '测试灰原',
          universe: '测试',
          portraitAssetId: 'portrait-speech-two',
          revision: 1,
          source: 'built-in',
          editable: false,
        },
      },
    ].map((seat) => ({
      ...seat,
      agent: null,
      alive: true,
      canVote: true,
      sheriff: false,
      active: false,
      sessionStatus: 'ready',
    })),
    timeline: [
      {
        sequence: 30,
        speechId: 17,
        kind: 'speech.committed',
        title: '第一句是证据。第二句是结论。',
        playerIds: ['player-1'],
        occurredAt: '2026-09-07T00:00:00.000Z',
        postgame: false,
      },
    ],
    activeSpeech: {
      speechId: 41,
      playerId: 'player-2',
      text: '正在核对事实。还有一个疑点。',
      final: false,
    },
    winner: null,
    pausedReason: null,
  })
}

function setup(match = projectedMatch(), useDefault = false) {
  const app = Fastify()
  apps.push(app)
  app.setErrorHandler((error, _request, reply) => {
    return reply.code(error instanceof ZodError ? 400 : 500).send({
      error: error instanceof ZodError ? 'invalid-request' : 'internal-error',
    })
  })
  const getMatch = vi.fn<MatchManager['getMatch']>(() => match)
  const audio = {
    status: vi.fn<SpeechAudioProvider['status']>(() => status),
    start: vi.fn(),
    hasVoice: vi.fn<SpeechAudioProvider['hasVoice']>(() => true),
    openAudio: vi.fn<SpeechAudioProvider['openAudio']>(async () =>
      Readable.from([pcm.subarray(0, 3), pcm.subarray(3)]),
    ),
    forgetMatch: vi.fn(),
    close: vi.fn<SpeechAudioProvider['close']>(async () => undefined),
  } satisfies SpeechAudioProvider
  const defaultSpeech = {
    start: vi.fn(),
    openAudio: vi.fn(async (_input: import('../src/edge-speech-service.js').DefaultSpeechInput) =>
      Readable.from([Buffer.from('edge-mp3')]),
    ),
    forgetMatch: vi.fn(),
    close: vi.fn(async () => undefined),
  }
  registerSpeechAudioRoutes(app, { getMatch }, audio, useDefault ? defaultSpeech : undefined)
  const request = (
    payload: Record<string, unknown> = {
      speechId: 17,
      view: { kind: 'god' },
      text: '第二句是结论。',
    },
  ) =>
    app.inject({
      method: 'POST',
      url: `/api/matches/${match.id}/speech-audio`,
      payload,
    })
  return { app, match, getMatch, audio, request, defaultSpeech }
}

afterEach(async () => {
  for (const stream of streams.splice(0)) stream.destroy()
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

describe('speech audio route projection and identity', () => {
  it('serves filtered live buffer text before commit without exposing hidden speech', async () => {
    const initial = projectedMatch()
    const active = { ...initial.activeSpeech!, text: '' }
    const { request, getMatch, match, audio } = setup({
      ...initial,
      timeline: [],
      activeSpeech: active,
    })
    const buffer = new StreamedSpeechBuffer()
    const attempt = buffer.begin(active.speechId, active.playerId)
    const response = new DirectSpeechResponse((chunk) => buffer.append(attempt, chunk))
    getMatch.mockImplementation((_id, view) =>
      buffer.project(view.kind === 'god' ? match : { ...match, activeSpeech: null }),
    )
    const sentence = '这句发言可以在提交前播放。'
    const visible = sentence + '继续核对公开的时间线。'.repeat(8)
    response.push(visible)
    response.push('\nassistant: 内部角色内容。')
    expect(buffer.project(match).activeSpeech).toMatchObject({ text: visible, final: false })
    const input = { speechId: active.speechId, view: { kind: 'god' }, text: sentence }
    const audioResponse = await request(input)
    expect(audioResponse.statusCode).toBe(200)
    expect(audioResponse.rawPayload).toEqual(pcm)
    expect(audio.openAudio).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        speechId: active.speechId,
        characterId: 'character-speech-haibara',
        text: sentence,
      }),
    )
    expect((await request({ ...input, text: '内部角色内容' })).statusCode).toBe(400)
    expect((await request({ ...input, view: { kind: 'closed-eye' } })).statusCode).toBe(404)
    expect(audio.openAudio).toHaveBeenCalledOnce()
  })

  it('rejects previous-attempt text after the live buffer restarts', async () => {
    const { request, getMatch, match } = setup()
    const active = match.activeSpeech!
    const buffer = new StreamedSpeechBuffer()
    getMatch.mockImplementation(() => buffer.project(match))
    const previous = buffer.begin(active.speechId, active.playerId)
    const previousResponse = new DirectSpeechResponse((chunk) => buffer.append(previous, chunk))
    const previousText = '这是中断前的发言。'
    previousResponse.push(previousText + '继续解释。'.repeat(20))
    const input = { speechId: active.speechId, view: { kind: 'god' }, text: previousText }
    expect((await request(input)).statusCode).toBe(200)
    const retry = buffer.begin(active.speechId, active.playerId)
    previousResponse.push('上次尝试的迟到内容。'.repeat(10))
    expect(buffer.project(match).activeSpeech?.text).toBe('')
    expect((await request(input)).statusCode).toBe(400)
    const retryResponse = new DirectSpeechResponse((chunk) => buffer.append(retry, chunk))
    const retryText = '这是重试后的发言。'
    retryResponse.push(retryText + '重新核对。'.repeat(20))
    expect((await request({ ...input, text: retryText })).statusCode).toBe(200)
  })

  it.each([
    { kind: 'god' },
    { kind: 'closed-eye' },
    { kind: 'player', playerId: 'player-2' },
  ] as const)(
    'passes the requested $kind view to the authoritative Match projection',
    async (view) => {
      const { request, getMatch, match, audio } = setup()
      const response = await request({ speechId: 17, view, text: '第二句是结论。' })
      expect(response.statusCode).toBe(200)
      expect(getMatch).toHaveBeenCalledExactlyOnceWith(match.id, view)
      expect(audio.openAudio).toHaveBeenCalledOnce()
    },
  )

  it('rechecks visibility for a repeated request instead of exposing previously generated audio to another view', async () => {
    const { request, getMatch, match, audio } = setup()
    const hidden = { ...match, timeline: [], activeSpeech: null }
    getMatch.mockImplementation((_id, view) => (view.kind === 'god' ? match : hidden))
    expect((await request()).statusCode).toBe(200)
    const response = await request({
      speechId: 17,
      view: { kind: 'player', playerId: 'player-2' },
      text: '第二句是结论。',
    })
    expect(response.statusCode).toBe(404)
    expect(SpeechAudioErrorSchema.parse(response.json()).code).toBe('speech-audio-not-visible')
    expect(audio.openAudio).toHaveBeenCalledOnce()
  })

  it('rejects a wrong speech ID before consulting or opening the voice service', async () => {
    const { request, audio } = setup()
    const response = await request({ speechId: 999, view: { kind: 'god' }, text: '第二句是结论。' })
    expect(response.statusCode).toBe(404)
    expect(SpeechAudioErrorSchema.parse(response.json()).code).toBe('speech-audio-not-visible')
    expect(audio.hasVoice).not.toHaveBeenCalled()
    expect(audio.openAudio).not.toHaveBeenCalled()
  })

  it('rejects replacement text even when the speech ID is visible', async () => {
    const { request, audio } = setup()
    const response = await request({
      speechId: 17,
      view: { kind: 'god' },
      text: '替换成别的发言。',
    })
    expect(response.statusCode).toBe(400)
    expect(SpeechAudioErrorSchema.parse(response.json()).code).toBe('speech-audio-invalid-text')
    expect(audio.openAudio).not.toHaveBeenCalled()
  })

  it('rejects a non-speech timeline item with a matching ID and text', async () => {
    const match = projectedMatch()
    const { request, audio } = setup({
      ...match,
      timeline: match.timeline.map((item) => ({ ...item, kind: 'vote.result' })),
    })
    const response = await request()
    expect(response.statusCode).toBe(404)
    expect(audio.openAudio).not.toHaveBeenCalled()
  })

  it('selects the Character of the projected active speaker and passes only the visible sentence to generation', async () => {
    const { request, match, audio } = setup()
    const response = await request({
      speechId: 41,
      view: { kind: 'player', playerId: 'player-2' },
      text: '正在核对事实。',
    })
    expect(response.statusCode).toBe(200)
    expect(audio.hasVoice).toHaveBeenCalledExactlyOnceWith('character-speech-haibara')
    expect(audio.openAudio).toHaveBeenCalledExactlyOnceWith({
      matchId: match.id,
      speechId: 41,
      characterId: 'character-speech-haibara',
      text: '正在核对事实。',
      signal: expect.any(AbortSignal),
    })
  })

  it('does not accept a caller-supplied Character override', async () => {
    const { request, getMatch, audio } = setup()
    const response = await request({
      speechId: 17,
      view: { kind: 'god' },
      text: '第二句是结论。',
      characterId: 'character-speech-haibara',
    })
    expect(response.statusCode).toBe(400)
    expect(getMatch).not.toHaveBeenCalled()
    expect(audio.openAudio).not.toHaveBeenCalled()
  })

  it('uses the timeline sequence for archived speech without a stable speech ID', async () => {
    const match = projectedMatch()
    const { request, audio } = setup({
      ...match,
      timeline: match.timeline.map(({ speechId: _speechId, ...item }) => item),
    })
    const response = await request({ speechId: 30, view: { kind: 'god' }, text: '第一句是证据。' })
    expect(response.statusCode).toBe(200)
    expect(audio.openAudio.mock.calls[0]?.[0]).toMatchObject({
      speechId: 30,
      characterId: 'character-speech-conan',
    })
  })

  it('uses committed canonical text when an older active stream with the same ID also exists', async () => {
    const match = projectedMatch()
    const { request, audio } = setup({
      ...match,
      activeSpeech: {
        ...match.activeSpeech!,
        speechId: match.timeline[0]!.speechId!,
        text: '未规范化的流文本。',
      },
    })
    const response = await request({
      speechId: 17,
      view: { kind: 'god' },
      text: '未规范化的流文本。',
    })
    expect(response.statusCode).toBe(400)
    expect(audio.openAudio).not.toHaveBeenCalled()
  })
})

describe('speech audio availability and HTTP output', () => {
  it.each(['missing-character', 'missing-reference', 'missing-seat'] as const)(
    'returns tts-no-voice for %s',
    async (kind) => {
      const match = projectedMatch()
      const projected =
        kind === 'missing-character'
          ? { ...match, seats: match.seats.map((seat) => ({ ...seat, character: null })) }
          : kind === 'missing-seat'
            ? { ...match, seats: [] }
            : match
      const { request, audio } = setup(projected)
      if (kind === 'missing-reference') audio.hasVoice.mockReturnValue(false)
      const response = await request()
      expect(response.statusCode).toBe(503)
      expect(SpeechAudioErrorSchema.parse(response.json()).code).toBe('tts-no-voice')
      expect(audio.openAudio).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['preparing', 'tts-not-ready'],
    ['loading', 'tts-not-ready'],
    ['disabled', 'tts-unavailable'],
    ['error', 'tts-unavailable'],
  ] as const)('reports %s with the precise fallback code', async (state, code) => {
    const { request, audio } = setup()
    audio.status.mockReturnValue({ ...status, state, message: null })
    const response = await request()
    expect(response.statusCode).toBe(503)
    expect(SpeechAudioErrorSchema.parse(response.json()).code).toBe(code)
    expect(audio.openAudio).not.toHaveBeenCalled()
  })

  it('maps a provider readiness race to tts-unavailable', async () => {
    const { request, audio } = setup()
    audio.openAudio.mockRejectedValue(new SpeechAudioUnavailableError('worker exited'))
    const response = await request()
    expect(response.statusCode).toBe(503)
    expect(SpeechAudioErrorSchema.parse(response.json()).code).toBe('tts-unavailable')
  })

  it('does not classify an unrelated provider exception as an allowed fallback', async () => {
    const { request, audio } = setup()
    audio.openAudio.mockRejectedValue(new Error('unexpected failure'))
    const response = await request()
    expect(response.statusCode).toBe(500)
    expect(SpeechAudioErrorSchema.safeParse(response.json()).success).toBe(false)
  })

  it('preserves network-order PCM bytes, advertises L16, prevents shared caching, and does not cancel a completed response', async () => {
    const { request, audio } = setup()
    const response = await request()
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe(SPEECH_AUDIO_CONTENT_TYPE)
    expect(response.headers['cache-control']).toBe('private, no-store')
    expect(response.rawPayload).toEqual(pcm)
    expect(response.rawPayload.readInt16BE(0)).toBe(16384)
    expect(response.rawPayload.readInt16BE(2)).toBe(-32768)
    expect(audio.openAudio.mock.calls[0]?.[0].signal.aborted).toBe(false)
  })

  it('returns the validated model status without opening audio or loading a Match', async () => {
    const { app, getMatch, audio } = setup()
    const response = await app.inject({ method: 'GET', url: '/api/speech-audio/status' })
    expect(response.statusCode).toBe(200)
    expect(SpeechAudioStatusSchema.parse(response.json())).toEqual(status)
    expect(getMatch).not.toHaveBeenCalled()
    expect(audio.openAudio).not.toHaveBeenCalled()
    expect(audio.start).not.toHaveBeenCalled()
  })
})

describe('speech audio client disconnection', () => {
  it('aborts generation when a real client disconnects during the PCM stream', async () => {
    const { app, match, audio } = setup()
    const cancelled = vi.fn()
    audio.openAudio.mockImplementation(async (input) => {
      const stream = new PassThrough()
      streams.push(stream)
      input.signal.addEventListener(
        'abort',
        () => {
          cancelled()
          stream.destroy()
        },
        { once: true },
      )
      stream.write(pcm)
      return stream
    })
    const address = await app.listen({ host: '127.0.0.1', port: 0 })
    const client = new AbortController()
    const view: SpectatorView = { kind: 'god' }
    try {
      const response = await fetch(`${address}/api/matches/${match.id}/speech-audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speechId: 17, view, text: '第一句是证据。' }),
        signal: client.signal,
      })
      expect(response.status).toBe(200)
      const reader = response.body!.getReader()
      expect((await reader.read()).value).toEqual(new Uint8Array(pcm))
      client.abort()
      await vi.waitFor(() => expect(cancelled).toHaveBeenCalledOnce())
      expect(audio.openAudio.mock.calls[0]?.[0].signal.aborted).toBe(true)
      await reader.cancel().catch(() => undefined)
    } finally {
      client.abort()
    }
  })
})

describe('default Yunxi speech routing', () => {
  it.each(['preparing', 'loading', 'error', 'disabled'] as const)(
    'uses Edge when the local model is %s, then restores Character audio',
    async (state) => {
      const { audio, defaultSpeech, request } = setup(projectedMatch(), true)
      audio.status.mockReturnValue({ ...status, state })
      const fallback = await request()
      expect(fallback.statusCode).toBe(200)
      expect(fallback.headers['content-type']).toContain('audio/mpeg')
      expect(JSON.parse(String(fallback.headers['x-agentwolf-speech-source']))).toEqual({
        provider: 'edge-tts',
        voice: 'zh-CN-YunxiNeural',
        reason: state,
      })
      expect(audio.start).toHaveBeenCalledOnce()
      expect(defaultSpeech.openAudio.mock.calls[0]?.[0]).toMatchObject({ text: '第二句是结论。' })
      expect(audio.openAudio).not.toHaveBeenCalled()
      audio.status.mockReturnValue(status)
      const character = await request()
      expect(character.headers['content-type']).toBe(SPEECH_AUDIO_CONTENT_TYPE)
      expect(defaultSpeech.openAudio).toHaveBeenCalledOnce()
    },
  )
  it('uses Yunxi for missing Character references or an unavailable worker', async () => {
    const { audio, defaultSpeech, request } = setup(projectedMatch(), true)
    audio.hasVoice.mockReturnValueOnce(false)
    expect(JSON.parse(String((await request()).headers['x-agentwolf-speech-source'])).reason).toBe(
      'no-voice',
    )
    audio.openAudio.mockRejectedValueOnce(new SpeechAudioUnavailableError('worker stopped'))
    expect(JSON.parse(String((await request()).headers['x-agentwolf-speech-source'])).reason).toBe(
      'error',
    )
    expect(defaultSpeech.openAudio).toHaveBeenCalledTimes(2)
  })
  it('does not send hidden or substituted text to Edge', async () => {
    const { audio, defaultSpeech, request } = setup(projectedMatch(), true)
    audio.status.mockReturnValue({ ...status, state: 'error' })
    expect(
      (await request({ speechId: 999, view: { kind: 'god' }, text: '隐藏内容' })).statusCode,
    ).toBe(404)
    expect(
      (await request({ speechId: 17, view: { kind: 'god' }, text: '替换内容' })).statusCode,
    ).toBe(400)
    expect(defaultSpeech.openAudio).not.toHaveBeenCalled()
  })
  it('reports a default-provider failure instead of claiming playable audio', async () => {
    const { audio, defaultSpeech, request } = setup(projectedMatch(), true)
    audio.status.mockReturnValue({ ...status, state: 'loading' })
    defaultSpeech.openAudio.mockRejectedValue(new Error('network failed'))
    const response = await request()
    expect(response.statusCode).toBe(503)
    expect(response.json().code).toBe('tts-default-unavailable')
  })
})
