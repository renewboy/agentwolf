import { act, renderHook, waitFor } from '@testing-library/react'
import { StrictMode, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MatchIdSchema,
  PlayerIdSchema,
  SpeechIdSchema,
  type TimelineItem,
} from '@agentwolf/contracts'
import { useSpeechPlayback } from '../src/hooks/useSpeechPlayback.js'
import { FakeMp3Audio, FakeMediaSource, installMp3Audio } from './helpers/fake-mp3-audio.js'
import {
  FakePcmContext,
  installPcmAudio,
  pcmResponse,
  pcmSamples,
} from './helpers/fake-pcm-audio.js'

const matchId = MatchIdSchema.parse('match-audio-hook-abcdef')
const actor = PlayerIdSchema.parse('player-2')
const speechId = SpeechIdSchema.parse(17)
const fetchMock = vi.fn<typeof fetch>()
const browserSpeech = {
  speak: vi.fn<(utterance: SpeechSynthesisUtterance) => void>(),
  cancel: vi.fn(),
}

class BrowserUtterance extends EventTarget {
  public lang = ''
  public rate = 1
  public pitch = 1
  public volume = 1
  public constructor(public readonly text: string) {
    super()
  }
}

function item(): TimelineItem {
  return {
    sequence: 30,
    speechId,
    kind: 'speech.committed',
    title: '只有相同文本也不能猜玩家。',
    playerIds: [actor],
    occurredAt: '2026-09-07T00:00:00.000Z',
    postgame: false,
  }
}

function initialProps(): Parameters<typeof useSpeechPlayback>[0] {
  return {
    timeline: [],
    activeSpeech: null,
    playbackState: { enabled: true, controlledByThisClient: true, pendingSequence: null },
    projectionKey: 'god',
    viewPending: false,
    resolveAutomatic: vi.fn(() => true),
    audioIdentity: { matchId, view: { kind: 'god' } },
  }
}

beforeEach(() => {
  installPcmAudio()
  installMp3Audio()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  browserSpeech.speak.mockReset()
  browserSpeech.cancel.mockReset()
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: browserSpeech })
  vi.stubGlobal('SpeechSynthesisUtterance', BrowserUtterance)
})

describe('Qwen presentation hook integration', () => {
  it.each([
    ['preparing', '角色音色准备中，暂用默认语音。'],
    ['loading', '角色音色加载中，暂用默认语音。'],
    ['error', '角色音色暂不可用，本段使用默认语音。'],
  ] as const)(
    'associates default voice metadata with its speech for %s',
    async (reason, notice) => {
      fetchMock.mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), {
          headers: {
            'Content-Type': 'audio/mpeg',
            'X-AgentWolf-Speech-Source': JSON.stringify({
              provider: 'edge-tts',
              voice: 'zh-CN-YunxiNeural',
              reason,
            }),
          },
        }),
      )
      const props = initialProps()
      const hook = renderHook((input) => useSpeechPlayback(input), { initialProps: props })
      act(() => hook.result.current.prepareAudio())
      hook.rerender({
        ...props,
        timeline: [item()],
        playbackState: { ...props.playbackState, pendingSequence: 30 },
      })
      await waitFor(() => expect(hook.result.current.notice).toBe(notice))
      expect(hook.result.current.noticeTitle).toBe('本段使用默认语音')
      expect(hook.result.current.noticeKind).toBe('fallback')
      expect(hook.result.current.noticeSpeechId).toBe(speechId)
      expect(browserSpeech.speak).not.toHaveBeenCalled()
      await waitFor(() => expect(FakeMediaSource.all[0]!.endOfStream).toHaveBeenCalledOnce())
      act(() => {
        FakeMp3Audio.all[0]!.dispatchEvent(new Event('ended'))
      })
      await waitFor(() =>
        expect(props.resolveAutomatic).toHaveBeenCalledExactlyOnceWith(30, 'completed'),
      )
      expect(hook.result.current.noticeSpeechId).toBe(speechId)
      hook.unmount()
    },
  )

  it('explains missing browser activation and clears the notice when the user replays the speech', async () => {
    for (let index = 0; index < 2; index += 1) {
      fetchMock.mockResolvedValueOnce(
        pcmResponse(
          new ReadableStream({
            start(controller) {
              controller.enqueue(pcmSamples())
              controller.close()
            },
          }),
        ),
      )
    }
    const props = initialProps()
    const hook = renderHook((input) => useSpeechPlayback(input), { initialProps: props })
    hook.rerender({
      ...props,
      timeline: [item()],
      playbackState: { ...props.playbackState, pendingSequence: 30 },
    })
    await waitFor(() =>
      expect(hook.result.current.notice).toBe('请点击发言播放，或重新开启语音以启用声音'),
    )
    expect(props.resolveAutomatic).toHaveBeenCalledExactlyOnceWith(30, 'skipped')
    expect(hook.result.current.noticeSpeechId).toBe(speechId)
    expect(browserSpeech.speak).not.toHaveBeenCalled()
    act(() => hook.result.current.playManual(item()))
    const audio = FakePcmContext.instances[0]!
    await waitFor(() => expect(audio.sources).toHaveLength(1))
    expect(hook.result.current.notice).toBeNull()
    expect(hook.result.current.mode).toBe('manual')
    act(() => audio.sources[0]!.finish())
    await waitFor(() => expect(hook.result.current.mode).toBe('idle'))
    expect(props.resolveAutomatic).toHaveBeenCalledTimes(1)
    hook.unmount()
  })

  it('cancels the old observer stream without a stale completion and sends the next view with its stable speech ID', async () => {
    let firstWriter!: ReadableStreamDefaultController<Uint8Array>
    const cancel = vi.fn()
    fetchMock.mockResolvedValueOnce(
      pcmResponse(
        new ReadableStream({
          start(controller) {
            firstWriter = controller
          },
          cancel,
        }),
      ),
    )
    const secondWriter = new ReadableStream({
      start(controller) {
        controller.enqueue(pcmSamples())
        controller.close()
      },
    })
    fetchMock.mockResolvedValueOnce(pcmResponse(secondWriter))
    const props = initialProps()
    const hook = renderHook((input) => useSpeechPlayback(input), { initialProps: props })
    act(() => hook.result.current.prepareAudio())
    const playing = {
      ...props,
      timeline: [item()],
      playbackState: { ...props.playbackState, pendingSequence: 30 },
    }
    hook.rerender(playing)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    act(() => firstWriter.enqueue(pcmSamples(14_400)))
    const audio = FakePcmContext.instances[0]!
    await waitFor(() => expect(audio.sources).toHaveLength(6))
    const nextView = { matchId, view: { kind: 'player' as const, playerId: actor } }
    hook.rerender({
      ...playing,
      projectionKey: `player:${actor}`,
      viewPending: true,
      audioIdentity: nextView,
    })
    await waitFor(() => expect(cancel).toHaveBeenCalledOnce())
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
    expect(hook.result.current.automaticBusy).toBe(false)
    act(() => audio.sources[0]!.finish())
    expect(props.resolveAutomatic).not.toHaveBeenCalledWith(30, 'completed')
    hook.rerender({
      ...props,
      projectionKey: `player:${actor}`,
      audioIdentity: nextView,
      activeSpeech: {
        speechId: SpeechIdSchema.parse(18),
        playerId: actor,
        text: '新视角发言。',
        final: false,
      },
    })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)).toEqual({
      speechId: 18,
      text: '新视角发言。',
      view: nextView.view,
    })
    hook.unmount()
  })

  it('resolves explicit skip once and stops buffered audio without a completed receipt', async () => {
    let writer!: ReadableStreamDefaultController<Uint8Array>
    fetchMock.mockResolvedValue(
      pcmResponse(
        new ReadableStream({
          start(controller) {
            writer = controller
          },
        }),
      ),
    )
    const props = initialProps()
    const hook = renderHook((input) => useSpeechPlayback(input), { initialProps: props })
    act(() => hook.result.current.prepareAudio())
    hook.rerender({
      ...props,
      timeline: [item()],
      playbackState: { ...props.playbackState, pendingSequence: 30 },
    })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    act(() => writer.enqueue(pcmSamples(14_400)))
    const audio = FakePcmContext.instances[0]!
    await waitFor(() => expect(audio.sources).toHaveLength(6))
    act(() => hook.result.current.skipAutomatic(speechId))
    expect(props.resolveAutomatic).toHaveBeenCalledExactlyOnceWith(30, 'skipped')
    expect(audio.sources[0]?.stop).toHaveBeenCalledOnce()
    act(() => audio.sources[0]!.finish())
    expect(props.resolveAutomatic).not.toHaveBeenCalledWith(30, 'completed')
    hook.unmount()
  })

  it('unlocks AudioContext in manual playback and preserves its controller through StrictMode until actual unmount', async () => {
    const response = pcmResponse(
      new ReadableStream({
        start(controller) {
          controller.enqueue(pcmSamples())
          controller.close()
        },
      }),
    )
    fetchMock.mockResolvedValue(response)
    const props = initialProps()
    const hook = renderHook((input) => useSpeechPlayback(input), {
      initialProps: props,
      wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>,
    })
    act(() => hook.result.current.playManual(item()))
    expect(FakePcmContext.instances).toHaveLength(1)
    const audio = FakePcmContext.instances[0]!
    await waitFor(() => expect(audio.sources).toHaveLength(1))
    expect(hook.result.current.mode).toBe('manual')
    expect(audio.close).not.toHaveBeenCalled()
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toMatchObject({
      speechId,
      text: item().title,
    })
    act(() => audio.sources[0]!.finish())
    await waitFor(() => expect(hook.result.current.mode).toBe('idle'))
    hook.unmount()
    await waitFor(() => expect(audio.close).toHaveBeenCalledOnce())
  })
})
