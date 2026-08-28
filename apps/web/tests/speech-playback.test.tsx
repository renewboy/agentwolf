import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MatchView, SpeechPlaybackState, TimelineItem } from '@agentwolf/contracts'
import { useSpeechPlayback } from '../src/hooks/useSpeechPlayback.js'

class FakeUtterance extends EventTarget {
  public lang = ''
  public rate = 1
  public readonly text: string

  public constructor(text: string) {
    super()
    this.text = text
  }
}

const speechSynthesis = {
  cancel: vi.fn(),
  speak: vi.fn<(utterance: SpeechSynthesisUtterance) => void>(),
}

function item(sequence: number, text = `发言 ${sequence}`, playerId = 'player-1'): TimelineItem {
  return {
    sequence,
    kind: 'speech.committed',
    title: text,
    playerIds: [playerId as never],
    occurredAt: '2026-08-28T00:00:00.000Z',
    postgame: false,
  }
}

function state(overrides: Partial<SpeechPlaybackState> = {}): SpeechPlaybackState {
  return {
    enabled: true,
    controlledByThisClient: true,
    pendingSequence: null,
    ...overrides,
  }
}

interface HookProps {
  readonly timeline: readonly TimelineItem[]
  readonly activeSpeech: MatchView['activeSpeech']
  readonly playbackState: SpeechPlaybackState
  readonly projectionKey: string
  readonly viewPending: boolean
}

beforeEach(() => {
  speechSynthesis.cancel.mockReset()
  speechSynthesis.speak.mockReset()
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: speechSynthesis,
  })
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
})

function renderPlayback(initial: Partial<HookProps> = {}) {
  const resolveAutomatic = vi.fn(() => true)
  const initialProps: HookProps = {
    timeline: [],
    activeSpeech: null,
    playbackState: state(),
    projectionKey: 'god',
    viewPending: false,
    ...initial,
  }
  const hook = renderHook((props: HookProps) => useSpeechPlayback({ ...props, resolveAutomatic }), {
    initialProps,
  })
  return { ...hook, resolveAutomatic }
}

describe('useSpeechPlayback committed speech', () => {
  it('plays new committed speech once and resolves its pending barrier', async () => {
    const speech = item(10, '完整发言。')
    const { result, rerender, resolveAutomatic } = renderPlayback()
    rerender({
      timeline: [speech],
      activeSpeech: null,
      playbackState: state({ pendingSequence: 10 }),
      projectionKey: 'god',
      viewPending: false,
    })
    await waitFor(() => expect(speechSynthesis.speak).toHaveBeenCalledOnce())
    expect(result.current.automaticSequence).toBe(10)
    expect(result.current.automaticPlayerId).toBe('player-1')
    expect(result.current.automaticBusy).toBe(true)
    const utterance = speechSynthesis.speak.mock.calls[0]![0] as unknown as FakeUtterance
    expect(utterance.text).toBe('完整发言。')
    expect(utterance.lang).toBe('zh-CN')
    expect(utterance.rate).toBe(1)
    void act(() => utterance.dispatchEvent(new Event('end')))
    await waitFor(() => expect(result.current.automaticBusy).toBe(false))
    expect(resolveAutomatic).toHaveBeenCalledWith(10, 'completed')
    rerender({
      timeline: [speech],
      activeSpeech: null,
      playbackState: state({ pendingSequence: 10 }),
      projectionKey: 'god',
      viewPending: false,
    })
    expect(speechSynthesis.speak).toHaveBeenCalledOnce()
    expect(resolveAutomatic).toHaveBeenCalledOnce()
  })

  it('records an outcome before a later barrier and supports explicit skipping', async () => {
    const first = item(11)
    const { result, rerender, resolveAutomatic } = renderPlayback()
    rerender({
      timeline: [first],
      activeSpeech: null,
      playbackState: state(),
      projectionKey: 'god',
      viewPending: false,
    })
    await waitFor(() => expect(speechSynthesis.speak).toHaveBeenCalledOnce())
    act(() => result.current.skipAutomatic())
    await waitFor(() => expect(result.current.automaticSequence).toBeNull())
    rerender({
      timeline: [first],
      activeSpeech: null,
      playbackState: state({ pendingSequence: 11 }),
      projectionKey: 'god',
      viewPending: false,
    })
    await waitFor(() => expect(resolveAutomatic).toHaveBeenCalledWith(11, 'skipped'))
    act(() => result.current.skipAutomatic())
  })

  it('skips unsupported, errored, and throwing synthesis without blocking barriers', async () => {
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: undefined })
    vi.stubGlobal('SpeechSynthesisUtterance', undefined)
    const unsupported = renderPlayback()
    unsupported.rerender({
      timeline: [item(12)],
      activeSpeech: null,
      playbackState: state({ pendingSequence: 12 }),
      projectionKey: 'god',
      viewPending: false,
    })
    await waitFor(() => expect(unsupported.result.current.notice).toContain('跳过'))
    expect(unsupported.resolveAutomatic).toHaveBeenCalledWith(12, 'skipped')
    unsupported.unmount()

    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: speechSynthesis,
    })
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
    const errored = renderPlayback()
    errored.rerender({
      timeline: [item(13)],
      activeSpeech: null,
      playbackState: state({ pendingSequence: 13 }),
      projectionKey: 'god',
      viewPending: false,
    })
    await waitFor(() => expect(speechSynthesis.speak).toHaveBeenCalledOnce())
    void act(() =>
      (speechSynthesis.speak.mock.calls[0]![0] as unknown as FakeUtterance).dispatchEvent(
        new Event('error'),
      ),
    )
    await waitFor(() => expect(errored.result.current.notice).toContain('跳过'))
    errored.unmount()

    speechSynthesis.speak.mockImplementationOnce(() => {
      throw new Error('synthesis failed')
    })
    const throwing = renderPlayback()
    throwing.rerender({
      timeline: [item(14)],
      activeSpeech: null,
      playbackState: state({ pendingSequence: 14 }),
      projectionKey: 'god',
      viewPending: false,
    })
    await waitFor(() => expect(throwing.result.current.notice).toContain('跳过'))
    expect(throwing.resolveAutomatic).toHaveBeenCalledWith(14, 'skipped')
  })
})

describe('useSpeechPlayback streaming speech', () => {
  it('plays complete streamed sentences, flushes the committed tail, and resolves once', async () => {
    const { result, rerender, resolveAutomatic } = renderPlayback()
    rerender({
      timeline: [],
      activeSpeech: { playerId: 'player-1' as never, text: '第一句。尾', final: false },
      playbackState: state(),
      projectionKey: 'god',
      viewPending: false,
    })
    await waitFor(() => expect(speechSynthesis.speak).toHaveBeenCalledOnce())
    expect(result.current.automaticSequence).toBeNull()
    expect(result.current.automaticPlayerId).toBe('player-1')
    void act(() =>
      (speechSynthesis.speak.mock.calls[0]![0] as unknown as FakeUtterance).dispatchEvent(
        new Event('end'),
      ),
    )

    rerender({
      timeline: [],
      activeSpeech: { playerId: 'player-1' as never, text: '第一句。尾第二句！尾巴', final: false },
      playbackState: state(),
      projectionKey: 'god',
      viewPending: false,
    })
    await waitFor(() => expect(speechSynthesis.speak).toHaveBeenCalledTimes(2))
    void act(() =>
      (speechSynthesis.speak.mock.calls[1]![0] as unknown as FakeUtterance).dispatchEvent(
        new Event('end'),
      ),
    )

    const committed = item(20, '第一句。尾第二句！尾巴')
    rerender({
      timeline: [committed],
      activeSpeech: null,
      playbackState: state({ pendingSequence: 20 }),
      projectionKey: 'god',
      viewPending: false,
    })
    await waitFor(() => expect(speechSynthesis.speak).toHaveBeenCalledTimes(3))
    expect(result.current.automaticSequence).toBe(20)
    expect((speechSynthesis.speak.mock.calls[2]![0] as unknown as FakeUtterance).text).toBe('尾巴')
    void act(() =>
      (speechSynthesis.speak.mock.calls[2]![0] as unknown as FakeUtterance).dispatchEvent(
        new Event('end'),
      ),
    )
    await waitFor(() => expect(resolveAutomatic).toHaveBeenCalledWith(20, 'completed'))
  })

  it('skips a stream, consumes later text, and resolves the eventual commit as skipped', async () => {
    const { result, rerender, resolveAutomatic } = renderPlayback()
    rerender({
      timeline: [],
      activeSpeech: { playerId: 'player-1' as never, text: '准备跳过。', final: false },
      playbackState: state(),
      projectionKey: 'god',
      viewPending: false,
    })
    await waitFor(() => expect(speechSynthesis.speak).toHaveBeenCalledOnce())
    act(() => result.current.skipAutomatic())
    rerender({
      timeline: [],
      activeSpeech: {
        playerId: 'player-1' as never,
        text: '准备跳过。后续不会播。',
        final: false,
      },
      playbackState: state(),
      projectionKey: 'god',
      viewPending: false,
    })
    const committed = item(21, '准备跳过。后续不会播。')
    rerender({
      timeline: [committed],
      activeSpeech: null,
      playbackState: state({ pendingSequence: 21 }),
      projectionKey: 'god',
      viewPending: false,
    })
    await waitFor(() => expect(resolveAutomatic).toHaveBeenCalledWith(21, 'skipped'))
    expect(speechSynthesis.speak).toHaveBeenCalledOnce()
  })

  it('starts a new stream when the speaker or observed prefix changes', async () => {
    const { rerender } = renderPlayback()
    rerender({
      timeline: [],
      activeSpeech: { playerId: 'player-1' as never, text: '一号。', final: false },
      playbackState: state(),
      projectionKey: 'god',
      viewPending: false,
    })
    await waitFor(() => expect(speechSynthesis.speak).toHaveBeenCalledOnce())
    void act(() =>
      (speechSynthesis.speak.mock.calls[0]![0] as unknown as FakeUtterance).dispatchEvent(
        new Event('end'),
      ),
    )
    rerender({
      timeline: [],
      activeSpeech: { playerId: 'player-2' as never, text: '二号。', final: false },
      playbackState: state(),
      projectionKey: 'god',
      viewPending: false,
    })
    await waitFor(() => expect(speechSynthesis.speak).toHaveBeenCalledTimes(2))
    void act(() =>
      (speechSynthesis.speak.mock.calls[1]![0] as unknown as FakeUtterance).dispatchEvent(
        new Event('end'),
      ),
    )
    rerender({
      timeline: [],
      activeSpeech: { playerId: 'player-2' as never, text: '重写。', final: false },
      playbackState: state(),
      projectionKey: 'god',
      viewPending: false,
    })
    await waitFor(() => expect(speechSynthesis.speak).toHaveBeenCalledTimes(3))
  })
})

describe('useSpeechPlayback controls and projection changes', () => {
  it('plays, stops, errors, and catches failures for manual speech', async () => {
    const speech = item(30, '手动发言')
    const { result } = renderPlayback({ playbackState: state({ controlledByThisClient: false }) })
    act(() => result.current.playManual(speech))
    expect(result.current.manualSequence).toBe(30)
    const utterance = speechSynthesis.speak.mock.calls[0]![0] as unknown as FakeUtterance
    void act(() => utterance.dispatchEvent(new Event('error')))
    expect(result.current.manualSequence).toBeNull()

    act(() => result.current.playManual(speech))
    act(() => result.current.stopManual())
    expect(result.current.manualSequence).toBeNull()
    expect(speechSynthesis.cancel).toHaveBeenCalled()

    speechSynthesis.speak.mockImplementationOnce(() => {
      throw new Error('manual failure')
    })
    act(() => result.current.playManual(speech))
    expect(result.current.notice).toContain('失败')
    act(() => result.current.cancelAll())
  })

  it('interrupts on a pending view and replays after projection changes', async () => {
    const speech = item(40)
    const { result, rerender } = renderPlayback()
    rerender({
      timeline: [speech],
      activeSpeech: null,
      playbackState: state(),
      projectionKey: 'god',
      viewPending: false,
    })
    await waitFor(() => expect(speechSynthesis.speak).toHaveBeenCalledOnce())
    expect(result.current.automaticSequence).toBe(40)
    rerender({
      timeline: [speech],
      activeSpeech: null,
      playbackState: state({ pendingSequence: 40 }),
      projectionKey: 'god',
      viewPending: true,
    })
    await waitFor(() => expect(result.current.automaticSequence).toBeNull())
    rerender({
      timeline: [speech],
      activeSpeech: null,
      playbackState: state({ pendingSequence: 40 }),
      projectionKey: 'player:player-1',
      viewPending: false,
    })
    await waitFor(() => expect(speechSynthesis.speak).toHaveBeenCalledTimes(2))
    rerender({
      timeline: [speech],
      activeSpeech: null,
      playbackState: state({ controlledByThisClient: false }),
      projectionKey: 'player:player-1',
      viewPending: false,
    })
    expect(result.current.automaticBusy).toBe(false)
    act(() => result.current.skipAutomatic())
  })
})
