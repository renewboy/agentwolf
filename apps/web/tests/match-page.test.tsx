import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MatchView } from '@agentwolf/contracts'

const live = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
  useLiveMatch: vi.fn(),
}))
const speech = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
  useSpeechPlayback: vi.fn(),
}))
const presence = vi.hoisted(() => ({ current: 'awaiting-actions' }))
const apiMocks = vi.hoisted(() => ({
  resumeMatch: vi.fn(),
  deleteMatch: vi.fn(),
  startPostgameReview: vi.fn(),
  skipPostgameReview: vi.fn(),
  resumePostgameReview: vi.fn(),
}))
const effect = vi.hoisted(() => ({ mode: 'full', setMode: vi.fn() }))

vi.mock('../src/api.js', () => ({ api: apiMocks }))
vi.mock('../src/hooks/useLiveMatch.js', () => ({
  useLiveMatch: (...args: unknown[]) => live.useLiveMatch(...args),
}))
vi.mock('../src/hooks/useSpeechPlayback.js', () => ({
  useSpeechPlayback: (...args: unknown[]) => speech.useSpeechPlayback(...args),
}))
vi.mock('../src/hooks/useRoleEffectMode.js', () => ({
  useRoleEffectMode: () => [effect.mode, effect.setMode],
}))
vi.mock('../src/components/match/MatchMotionController.js', () => ({
  deriveMatchPresenceState: () => presence.current,
  MatchMotionController: ({ presenceState }: { presenceState: string }) => (
    <div data-testid="motion">{presenceState}</div>
  ),
}))
vi.mock('../src/components/match/RoleEffectController.js', () => ({
  RoleEffectController: ({ mode, projectionKey }: { mode: string; projectionKey: string }) => (
    <div data-testid="effects">
      {mode}:{projectionKey}
    </div>
  ),
}))
vi.mock('../src/components/match/MatchHeader.js', () => ({
  MatchHeader: ({
    onToggleAudio,
    setEffectMode,
    setPlayerId,
    setViewKind,
    viewKind,
  }: {
    onToggleAudio: () => void
    setEffectMode: (mode: string) => void
    setPlayerId: (id: string) => void
    setViewKind: (kind: string) => void
    viewKind: string
  }) => (
    <div data-testid="header">
      view:{viewKind}
      <button type="button" onClick={() => setViewKind('player')}>
        player view
      </button>
      <button type="button" onClick={() => setPlayerId('player-2')}>
        player two
      </button>
      <button type="button" onClick={() => setEffectMode('off')}>
        effect off
      </button>
      <button type="button" onClick={onToggleAudio}>
        toggle audio
      </button>
    </div>
  ),
}))
vi.mock('../src/components/match/PlayerRail.js', () => ({
  PlayerRail: ({ side, seats }: { side: string; seats: readonly unknown[] }) => (
    <div data-testid={`rail-${side}`}>{seats.length}</div>
  ),
}))
vi.mock('../src/components/match/MatchFeed.js', () => ({
  MatchFeed: ({ audio }: { audio: { play: () => void; stop: () => void; skip: () => void } }) => (
    <div data-testid="feed">
      <button type="button" onClick={audio.play}>
        feed play
      </button>
      <button type="button" onClick={audio.stop}>
        feed stop
      </button>
      <button type="button" onClick={audio.skip}>
        feed skip
      </button>
    </div>
  ),
}))
vi.mock('../src/components/match/PostgameReviewPanel.js', () => ({
  PostgameReviewPanel: ({
    error,
    open,
    onOpenChange,
    onResume,
    onSkip,
    onStart,
  }: {
    error: string | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onResume: () => void
    onSkip: () => void
    onStart: () => void
  }) => (
    <div data-testid="postgame">
      open:{String(open)} error:{error ?? 'none'}
      <button type="button" onClick={() => onOpenChange(!open)}>
        review toggle
      </button>
      <button type="button" onClick={onStart}>
        review start
      </button>
      <button type="button" onClick={onSkip}>
        review skip
      </button>
      <button type="button" onClick={onResume}>
        review resume
      </button>
    </div>
  ),
}))

import { MatchPage } from '../src/pages/MatchPage.js'
import { matchView } from './fixtures/match.js'

const retry = vi.fn(async () => 'loaded')
const setSpeechPlaybackEnabled = vi.fn(() => true)
const resolveSpeechPlayback = vi.fn(() => true)
const cancelAll = vi.fn()
const playManual = vi.fn()
const stopManual = vi.fn()
const skipAutomatic = vi.fn()

function setLive(match: MatchView | null, overrides: Record<string, unknown> = {}): void {
  live.current = {
    match,
    error: null,
    controlError: null,
    retry,
    connectionState: 'live',
    playbackState: {
      enabled: true,
      controlledByThisClient: true,
      pendingSequence: null,
    },
    setSpeechPlaybackEnabled,
    resolveSpeechPlayback,
    viewPending: false,
    ...overrides,
  }
}

function setSpeech(overrides: Record<string, unknown> = {}): void {
  speech.current = {
    supported: true,
    automaticSequence: null,
    automaticPlayerId: null,
    automaticBusy: false,
    manualSequence: null,
    notice: null,
    playManual,
    stopManual,
    skipAutomatic,
    cancelAll,
    ...overrides,
  }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/matches/match-test-abcdef']}>
      <Routes>
        <Route path="/matches/:matchId" element={<MatchPage />} />
        <Route path="/" element={<div>lobby destination</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  for (const mock of [
    retry,
    setSpeechPlaybackEnabled,
    resolveSpeechPlayback,
    cancelAll,
    playManual,
    stopManual,
    skipAutomatic,
    effect.setMode,
    ...Object.values(apiMocks),
    live.useLiveMatch,
    speech.useSpeechPlayback,
  ]) {
    mock.mockReset()
  }
  retry.mockResolvedValue('loaded')
  setSpeechPlaybackEnabled.mockReturnValue(true)
  resolveSpeechPlayback.mockReturnValue(true)
  for (const mock of Object.values(apiMocks)) mock.mockResolvedValue(matchView())
  live.useLiveMatch.mockImplementation(() => live.current)
  speech.useSpeechPlayback.mockImplementation(() => speech.current)
  setLive(matchView())
  setSpeech()
  presence.current = 'awaiting-actions'
  effect.mode = 'full'
})

describe('MatchPage', () => {
  it('renders loading and fatal errors and retries', async () => {
    setLive(null)
    const { rerender } = renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('同步')
    setLive(null, { error: 'match failed' })
    rerender(
      <MemoryRouter initialEntries={['/matches/match-test-abcdef']}>
        <Routes>
          <Route path="/matches/:matchId" element={<MatchPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('match failed')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(retry).toHaveBeenCalled()
  })

  it('wires projection, effects, audio, rails, feed, notice, and projection veil', async () => {
    setLive(matchView(), {
      controlError: 'controller busy',
      viewPending: true,
      playbackState: {
        enabled: true,
        controlledByThisClient: false,
        pendingSequence: 4,
      },
    })
    setSpeech({ notice: 'playback notice' })
    const { rerender } = renderPage()
    expect(screen.getByTestId('rail-mobile')).toHaveTextContent('2')
    expect(screen.getByTestId('rail-left')).toHaveTextContent('1')
    expect(screen.getByTestId('rail-right')).toHaveTextContent('1')
    expect(document.querySelector('.aw-audio-notice')).toHaveTextContent('playback notice')
    expect(document.querySelector('.aw-stage-grid')).toHaveAttribute('aria-hidden', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'player view' }))
    await userEvent.click(screen.getByRole('button', { name: 'player two' }))
    await userEvent.click(screen.getByRole('button', { name: 'effect off' }))
    await userEvent.click(screen.getByRole('button', { name: 'toggle audio' }))
    expect(effect.setMode).toHaveBeenCalledWith('off')
    expect(cancelAll).toHaveBeenCalled()
    expect(setSpeechPlaybackEnabled).toHaveBeenCalledWith(true)
    rerender(
      <MemoryRouter initialEntries={['/matches/match-test-abcdef']}>
        <Routes>
          <Route path="/matches/:matchId" element={<MatchPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(live.useLiveMatch).toHaveBeenLastCalledWith('match-test-abcdef', {
      kind: 'player',
      playerId: 'player-2',
    })
    expect(screen.getByTestId('effects')).toHaveTextContent('player:player-2')
    await userEvent.click(screen.getByText('feed play'))
    await userEvent.click(screen.getByText('feed stop'))
    await userEvent.click(screen.getByText('feed skip'))
    expect(playManual).toHaveBeenCalled()
    expect(stopManual).toHaveBeenCalled()
    expect(skipAutomatic).toHaveBeenCalled()
  })

  it.each([
    ['starting', '唤醒'],
    ['resolving', '结算'],
    ['reconnecting', '恢复实时'],
    ['recovering-agents', '恢复'],
    ['switching-view', '切换'],
    ['paused', '暂停'],
    ['initial-loading', '同步'],
  ])('renders %s presence', (state, expected) => {
    presence.current = state
    renderPage()
    expect(document.querySelector('.aw-presence__copy strong')).toHaveTextContent(expected)
  })

  it('renders thinking, streaming, narrating, ended, vote, and Sheriff ordering labels', () => {
    const base = matchView()
    const cases: Array<{ state: string; match: MatchView; speech?: Record<string, unknown> }> = [
      { state: 'thinking', match: base },
      {
        state: 'thinking',
        match: {
          ...base,
          seats: base.seats.map((seat) => ({ ...seat, sessionStatus: 'thinking' })),
        } as MatchView,
      },
      {
        state: 'thinking',
        match: {
          ...base,
          phaseId: 'phase-day-speech-order',
          seats: base.seats.map((seat, index) => ({ ...seat, sheriff: index === 0 })),
        } as MatchView,
      },
      { state: 'streaming', match: { ...base, activeSpeech: null } as MatchView },
      {
        state: 'streaming',
        match: {
          ...base,
          activeSpeech: { playerId: 'player-1', text: 'stream', final: false },
        } as MatchView,
      },
      { state: 'narrating', match: base },
      { state: 'narrating', match: base, speech: { automaticPlayerId: 'player-2' } },
      { state: 'ended', match: { ...base, status: 'ended', winner: 'village' } as MatchView },
      { state: 'ended', match: { ...base, status: 'ended', winner: null } as MatchView },
      { state: 'awaiting-actions', match: { ...base, phaseId: 'phase-day-vote' } as MatchView },
      {
        state: 'awaiting-actions',
        match: {
          ...base,
          phaseId: 'phase-day-speech-order',
          seats: base.seats.map((seat, index) => ({ ...seat, sheriff: index === 0 })),
        } as MatchView,
      },
      { state: 'unknown', match: base },
    ]
    const rendered = renderPage()
    for (const entry of cases) {
      presence.current = entry.state
      setLive(entry.match)
      setSpeech(entry.speech)
      rendered.rerender(
        <MemoryRouter initialEntries={['/matches/match-test-abcdef']}>
          <Routes>
            <Route path="/matches/:matchId" element={<MatchPage />} />
          </Routes>
        </MemoryRouter>,
      )
      expect(document.querySelector('.aw-presence__copy strong')?.textContent).toBeTruthy()
    }
  })

  it('renders every active postgame presence state and controls inspector openness', async () => {
    const base = matchView({ status: 'ended', winner: 'village' })
    const states = [
      { state: 'paused' },
      { state: 'countdown' },
      { state: 'collecting' },
      { state: 'reflecting', currentSpeakerId: 'player-1' },
      { state: 'reflecting', currentSpeakerId: null },
    ]
    const rendered = renderPage()
    for (const review of states) {
      setLive({ ...base, postgameReview: review } as MatchView)
      rendered.rerender(
        <MemoryRouter initialEntries={['/matches/match-test-abcdef']}>
          <Routes>
            <Route path="/matches/:matchId" element={<MatchPage />} />
          </Routes>
        </MemoryRouter>,
      )
      expect(document.querySelector('.aw-presence__copy strong')?.textContent).toBeTruthy()
    }
    setLive({ ...base, postgameReview: { state: 'collecting' } } as MatchView)
    rendered.rerender(
      <MemoryRouter initialEntries={['/matches/match-test-abcdef']}>
        <Routes>
          <Route path="/matches/:matchId" element={<MatchPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'review toggle' }))
    expect(screen.getByTestId('postgame')).toHaveTextContent('open:true')
    setLive({ ...base, postgameReview: { state: 'countdown' } } as MatchView)
    rendered.rerender(
      <MemoryRouter initialEntries={['/matches/match-test-abcdef']}>
        <Routes>
          <Route path="/matches/:matchId" element={<MatchPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByTestId('postgame')).toHaveTextContent('open:false'))
  })

  it('names the exact winning players for a third-party ending', () => {
    presence.current = 'ended'
    setLive(
      matchView({
        status: 'ended',
        winner: 'independent',
        winningPlayerIds: ['player-1', 'player-2'],
      }),
    )
    renderPage()
    expect(document.querySelector('.aw-presence__copy strong')).toHaveTextContent(
      '第三方阵营获胜：1号 一号玩家、2号 二号玩家',
    )
  })

  it('keeps an ordinary faction ending concise when explicit winners match the faction', () => {
    presence.current = 'ended'
    setLive(matchView({ status: 'ended', winner: 'village', winningPlayerIds: ['player-1'] }))
    renderPage()
    expect(document.querySelector('.aw-presence__copy strong')).toHaveTextContent('好人阵营获胜')
    expect(document.querySelector('.aw-presence__copy strong')).not.toHaveTextContent('一号玩家')
  })

  it('resumes and deletes paused matches, including Error and string failures', async () => {
    const paused = matchView({ status: 'paused', pausedReason: 'agent failed' })
    setLive(paused)
    apiMocks.resumeMatch
      .mockRejectedValueOnce(new Error('resume failed'))
      .mockRejectedValueOnce('resume string failed')
      .mockResolvedValueOnce(paused)
    apiMocks.deleteMatch
      .mockRejectedValueOnce(new Error('delete failed'))
      .mockRejectedValueOnce('delete string failed')
      .mockResolvedValueOnce(undefined)
    renderPage()
    const resume = screen.getByRole('button', { name: '继续对局' })
    await userEvent.click(resume)
    expect(await screen.findByText('resume failed')).toBeVisible()
    await userEvent.click(resume)
    expect(await screen.findByText('resume string failed')).toBeVisible()
    await userEvent.click(resume)
    expect(retry).toHaveBeenCalled()

    const deleteButton = screen.getByRole('button', { name: '删除对局' })
    for (const error of ['delete failed', 'delete string failed']) {
      await userEvent.click(deleteButton)
      await userEvent.click(
        within(screen.getByRole('alertdialog')).getByRole('button', { name: '删除对局' }),
      )
      expect(await screen.findByText(error)).toBeVisible()
    }
    await userEvent.click(deleteButton)
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: '删除对局' }),
    )
    expect(await screen.findByText('lobby destination')).toBeVisible()
  })

  it('runs start/skip/resume postgame actions and reports failures', async () => {
    apiMocks.startPostgameReview
      .mockRejectedValueOnce(new Error('start failed'))
      .mockRejectedValueOnce('start string failed')
      .mockResolvedValueOnce(matchView())
    apiMocks.skipPostgameReview.mockResolvedValue(matchView())
    apiMocks.resumePostgameReview.mockResolvedValue(matchView())
    renderPage()
    for (const expected of ['start failed', 'start string failed']) {
      await userEvent.click(screen.getByRole('button', { name: 'review start' }))
      expect(await screen.findByTestId('postgame')).toHaveTextContent(expected)
    }
    await userEvent.click(screen.getByRole('button', { name: 'review start' }))
    await userEvent.click(screen.getByRole('button', { name: 'review skip' }))
    await userEvent.click(screen.getByRole('button', { name: 'review resume' }))
    expect(apiMocks.startPostgameReview).toHaveBeenCalledTimes(3)
    expect(apiMocks.skipPostgameReview).toHaveBeenCalledOnce()
    expect(apiMocks.resumePostgameReview).toHaveBeenCalledOnce()
  })
})
