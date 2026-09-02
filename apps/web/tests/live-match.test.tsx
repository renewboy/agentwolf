import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SpectatorView } from '@agentwolf/contracts'

const apiMocks = vi.hoisted(() => ({ getMatch: vi.fn() }))

vi.mock('../src/api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/api.js')>()
  return { ...actual, api: { ...actual.api, getMatch: apiMocks.getMatch } }
})

import { ApiError } from '../src/api.js'
import { useLiveMatch } from '../src/hooks/useLiveMatch.js'
import { matchView } from './fixtures/match.js'

class FakeWebSocket extends EventTarget {
  public static readonly OPEN = 1
  public static readonly instances: FakeWebSocket[] = []
  public readonly url: string
  public readyState = 0
  public readonly sent: string[] = []

  public constructor(url: string | URL) {
    super()
    this.url = String(url)
    FakeWebSocket.instances.push(this)
  }

  public open(): void {
    this.readyState = FakeWebSocket.OPEN
    this.dispatchEvent(new Event('open'))
  }

  public message(value: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) }))
  }

  public fail(): void {
    this.dispatchEvent(new Event('error'))
  }

  public send(value: string): void {
    this.sent.push(value)
  }

  public close(): void {
    if (this.readyState === 3) return
    this.readyState = 3
    this.dispatchEvent(new CloseEvent('close'))
  }
}

beforeEach(() => {
  FakeWebSocket.instances.length = 0
  apiMocks.getMatch.mockReset()
  vi.stubGlobal('WebSocket', FakeWebSocket)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useLiveMatch', () => {
  it('rejects absent and malformed Match IDs without opening a connection', async () => {
    const { result, rerender } = renderHook(
      ({ matchId }: { matchId: string | undefined }) => useLiveMatch(matchId, { kind: 'god' }),
      { initialProps: { matchId: undefined } as { matchId: string | undefined } },
    )
    await waitFor(() => expect(result.current.connectionState).toBe('unavailable'))
    expect(result.current.error).toContain('对局')
    expect(await result.current.retry()).toBe('missing')
    rerender({ matchId: 'bad' })
    await waitFor(() => expect(result.current.connectionState).toBe('unavailable'))
    expect(apiMocks.getMatch).not.toHaveBeenCalled()
    expect(FakeWebSocket.instances).toHaveLength(0)
  })

  it('loads, streams, switches view, controls playback, and localizes live errors', async () => {
    const initial = matchView()
    apiMocks.getMatch.mockResolvedValue(initial)
    const { result, rerender, unmount } = renderHook(
      ({ view }: { view: SpectatorView }) => useLiveMatch(initial.id, view),
      { initialProps: { view: { kind: 'god' } as SpectatorView } },
    )
    await waitFor(() => expect(result.current.match).toEqual(initial))
    const socket = FakeWebSocket.instances[0]!
    expect(socket.url).toContain('/api/matches/match-test-abcdef/live?view=god')
    expect(result.current.setSpeechPlaybackEnabled(true)).toBe(false)

    act(() => socket.open())
    expect(result.current.connectionState).toBe('live')
    act(() => {
      expect(result.current.setSpeechPlaybackEnabled(true)).toBe(true)
      expect(result.current.resolveSpeechPlayback(9, 'skipped')).toBe(true)
    })
    expect(socket.sent.map((entry) => JSON.parse(entry))).toEqual([
      { type: 'speech-playback.set', enabled: true },
      { type: 'speech-playback.resolve', sequence: 9, outcome: 'skipped' },
    ])

    act(() =>
      socket.message({
        type: 'speech-chunk',
        matchId: initial.id,
        speechId: 31,
        playerId: 'player-1',
        text: '第一段',
      }),
    )
    act(() =>
      socket.message({
        type: 'speech-chunk',
        matchId: initial.id,
        speechId: 31,
        playerId: 'player-1',
        text: '第二段',
      }),
    )
    expect(result.current.match?.activeSpeech?.text).toBe('第一段第二段')
    expect(result.current.match?.activeSpeech?.speechId).toBe(31)
    act(() =>
      socket.message({
        type: 'speech-chunk',
        matchId: initial.id,
        speechId: 32,
        playerId: 'player-2',
        text: '切换玩家',
      }),
    )
    expect(result.current.match?.activeSpeech?.text).toBe('切换玩家')

    act(() =>
      socket.message({
        type: 'speech-playback.state',
        state: { enabled: true, controlledByThisClient: false, pendingSequence: 3 },
      }),
    )
    expect(result.current.playbackState.pendingSequence).toBe(3)
    act(() =>
      socket.message({
        type: 'error',
        code: 'speech-playback-controller-busy',
        message: 'fallback',
      }),
    )
    expect(result.current.controlError).toContain('另一个')
    act(() =>
      socket.message({
        type: 'speech-playback.state',
        state: { enabled: false, controlledByThisClient: false, pendingSequence: null },
      }),
    )
    expect(result.current.controlError).toBeNull()
    act(() =>
      socket.message({
        type: 'error',
        code: 'speech-playback-invalid-resolution',
        message: 'fallback',
      }),
    )
    expect(result.current.controlError).not.toBe('fallback')
    act(() => socket.message({ type: 'error', message: 'fallback' }))
    expect(result.current.controlError).toBe('fallback')

    rerender({ view: { kind: 'player', playerId: 'player-2' as never } })
    expect(result.current.viewPending).toBe(true)
    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({
      type: 'view.set',
      view: { kind: 'player', playerId: 'player-2' },
    })
    const playerSnapshot = matchView({ phaseLabel: '玩家视角' })
    act(() =>
      socket.message({
        type: 'snapshot',
        view: { kind: 'player', playerId: 'player-2' },
        data: playerSnapshot,
      }),
    )
    expect(result.current.viewPending).toBe(false)
    expect(result.current.match?.phaseLabel).toBe('玩家视角')

    void act(() => socket.dispatchEvent(new MessageEvent('message', { data: '{' })))
    expect(result.current.error).toBeTruthy()
    unmount()
    expect(socket.readyState).toBe(3)
  })

  it('settles terminal snapshots and closes a late-open socket', async () => {
    apiMocks.getMatch.mockResolvedValue(matchView())
    const { result } = renderHook(() => useLiveMatch('match-test-abcdef', { kind: 'god' }))
    await waitFor(() => expect(result.current.match).not.toBeNull())
    const socket = FakeWebSocket.instances[0]!
    const ended = matchView({ status: 'ended', winner: 'village' })
    act(() => socket.message({ type: 'snapshot', view: { kind: 'god' }, data: ended }))
    expect(result.current.connectionState).toBe('settled')
    expect(socket.readyState).toBe(3)

    const activeReview = matchView({
      status: 'ended',
      winner: 'village',
      postgameReview: { state: 'collecting' } as never,
    })
    apiMocks.getMatch.mockResolvedValue(activeReview)
    const second = renderHook(() => useLiveMatch('match-test-review', { kind: 'god' }))
    await waitFor(() => expect(second.result.current.match).toEqual(activeReview))
    const reviewSocket = FakeWebSocket.instances.at(-1)!
    act(() => reviewSocket.open())
    expect(second.result.current.connectionState).toBe('live')
    second.unmount()
  })

  it('handles missing, failed, closed, and errored connections with bounded reconnects', async () => {
    apiMocks.getMatch.mockRejectedValueOnce(new ApiError('missing', 404))
    const missing = renderHook(() => useLiveMatch('match-test-missing', { kind: 'god' }))
    await waitFor(() => expect(missing.result.current.connectionState).toBe('unavailable'))
    expect(missing.result.current.match).toBeNull()
    expect(missing.result.current.error).toContain('不存在')
    missing.unmount()

    apiMocks.getMatch.mockRejectedValueOnce('network failed').mockResolvedValue(matchView())
    const reconnecting = renderHook(() => useLiveMatch('match-test-retry', { kind: 'god' }))
    await waitFor(() => expect(reconnecting.result.current.error).toBe('network failed'))
    const firstSocket = FakeWebSocket.instances.at(-1)!
    act(() => firstSocket.open())
    act(() => firstSocket.fail())
    await waitFor(() => expect(reconnecting.result.current.connectionState).toBe('reconnecting'))
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 280))
    await waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThanOrEqual(3))
    const nextSocket = FakeWebSocket.instances.at(-1)!
    act(() => nextSocket.open())
    expect(reconnecting.result.current.connectionState).toBe('live')
    reconnecting.unmount()
  })

  it('recognizes completed and skipped postgame states as terminal loads', async () => {
    for (const state of ['completed', 'skipped'] as const) {
      const terminal = matchView({
        status: 'ended',
        winner: 'village',
        postgameReview: { state } as never,
      })
      apiMocks.getMatch.mockResolvedValueOnce(terminal)
      const hook = renderHook(() => useLiveMatch(`match-test-${state}`, { kind: 'god' }))
      await waitFor(() => expect(hook.result.current.connectionState).toBe('settled'))
      hook.unmount()
    }
  })
})
