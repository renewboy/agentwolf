import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCopy } from '@agentwolf/assets'
import type {
  MatchView,
  PostgameReviewResult,
  PostgameReviewSubmission,
  PostgameReviewView,
} from '@agentwolf/contracts'
import { PostgameReviewPanel } from '../src/components/match/PostgameReviewPanel.js'
import { matchView } from './fixtures/match.js'

const scores = {
  information: 8,
  communication: 7,
  decision: 9,
  objective: 6,
  adaptability: 8,
}

const firstSubmission = {
  matchId: 'match-test-abcdef',
  reviewerId: 'player-1',
  mvpPlayerId: 'player-1',
  svpPlayerId: 'player-2',
  ratings: [
    { playerId: 'player-2', scores },
    { playerId: 'player-99', scores },
  ],
  submittedAt: '2026-08-28T00:00:10.000Z',
} as PostgameReviewSubmission

const secondSubmission = {
  ...firstSubmission,
  reviewerId: 'player-2',
  mvpPlayerId: 'player-99',
  svpPlayerId: 'player-99',
  ratings: [{ playerId: 'player-1', scores }],
  submittedAt: '2026-08-28T00:00:20.000Z',
} as PostgameReviewSubmission

const result = {
  mvp: { playerId: 'player-1', votes: 2, resolvedBy: 'votes' },
  svp: { playerId: 'player-2', votes: 1, resolvedBy: 'score' },
  players: [
    { playerId: 'player-1', scores, overall: 7.6, ratingCount: 1 },
    { playerId: 'player-2', scores, overall: 7.4, ratingCount: 1 },
    { playerId: 'player-99', scores, overall: 5, ratingCount: 1 },
  ],
  completedAt: '2026-08-28T00:01:00.000Z',
} as PostgameReviewResult

function review(overrides: Partial<PostgameReviewView> = {}): PostgameReviewView {
  return {
    state: 'collecting',
    decisionDeadlineAt: null,
    startedAt: '2026-08-28T00:00:00.000Z',
    winningPlayerIds: ['player-1' as never],
    losingPlayerIds: ['player-2' as never],
    submittedCount: 2,
    totalPlayers: 2,
    currentSpeakerId: null,
    submissions: [secondSubmission, firstSubmission],
    result: null,
    reflections: [],
    pausedReason: null,
    ...overrides,
  } as PostgameReviewView
}

function reviewedMatch(value: PostgameReviewView | null): MatchView {
  return matchView({ status: 'ended', winner: 'village', postgameReview: value })
}

afterEach(() => {
  vi.useRealTimers()
})

describe('PostgameReviewPanel', () => {
  it('renders nothing without a review and renders skipped state compactly', () => {
    const props = {
      busy: false,
      error: null,
      onStart: vi.fn(),
      onSkip: vi.fn(),
      onResume: vi.fn(),
      open: false,
      onOpenChange: vi.fn(),
    }
    const { rerender } = render(<PostgameReviewPanel match={reviewedMatch(null)} {...props} />)
    expect(document.body).toHaveTextContent('')
    rerender(<PostgameReviewPanel match={reviewedMatch(review({ state: 'skipped' }))} {...props} />)
    expect(screen.getByText(getCopy('postgame.skipped'))).toBeVisible()
  })

  it('counts down, starts, skips, reports errors, and disables busy actions', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-28T00:00:00.000Z'))
    const onStart = vi.fn()
    const onSkip = vi.fn()
    const countdown = review({
      state: 'countdown',
      decisionDeadlineAt: '2026-08-28T00:00:02.000Z',
      startedAt: null,
      submittedCount: 0,
      submissions: [],
    })
    const { rerender, unmount } = render(
      <PostgameReviewPanel
        busy={false}
        error="start failed"
        match={reviewedMatch(countdown)}
        open={false}
        onOpenChange={vi.fn()}
        onResume={vi.fn()}
        onSkip={onSkip}
        onStart={onStart}
      />,
    )
    expect(screen.getByRole('timer')).toHaveTextContent('2')
    fireEvent.click(screen.getByRole('button', { name: getCopy('postgame.startNow') }))
    fireEvent.click(screen.getByRole('button', { name: getCopy('postgame.skip') }))
    expect(onStart).toHaveBeenCalledOnce()
    expect(onSkip).toHaveBeenCalledOnce()
    expect(screen.getByText('start failed')).toBeVisible()
    void act(() => vi.advanceTimersByTime(2_500))
    expect(screen.getByRole('timer')).toHaveTextContent('0')

    rerender(
      <PostgameReviewPanel
        busy
        error={null}
        match={reviewedMatch(countdown)}
        open={false}
        onOpenChange={vi.fn()}
        onResume={vi.fn()}
        onSkip={onSkip}
        onStart={onStart}
      />,
    )
    expect(screen.getByRole('button', { name: getCopy('postgame.starting') })).toBeDisabled()
    expect(screen.getByRole('button', { name: getCopy('postgame.skip') })).toBeDisabled()
    unmount()
  })

  it('opens collecting sheets, chooses latest valid reviewer and rating, and restores focus', async () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <PostgameReviewPanel
          busy={false}
          error={null}
          match={reviewedMatch(review())}
          open={open}
          onOpenChange={setOpen}
          onResume={vi.fn()}
          onSkip={vi.fn()}
          onStart={vi.fn()}
        />
      )
    }
    render(<Harness />)
    const openButton = screen.getByRole('button', { name: getCopy('postgame.openInspector') })
    await userEvent.click(openButton)
    const close = document.querySelector<HTMLButtonElement>('.aw-postgame-inspector-close')!
    expect(close).toHaveFocus()
    const tabs = document.querySelectorAll('.aw-postgame-player-tab')
    expect(tabs).toHaveLength(2)
    expect(tabs[1]).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/二号玩家的评分/u)).toBeVisible()
    expect(screen.getAllByText(getCopy('common.none'))).toHaveLength(2)
    await userEvent.click(tabs[0] as HTMLElement)
    expect(screen.getByText(/一号玩家的评分/u)).toBeVisible()
    expect(document.querySelectorAll('.aw-postgame-targets button')).toHaveLength(1)
    await userEvent.click(close)
    await waitFor(() => expect(openButton).toHaveFocus())
  })

  it('shows waiting sheets when no valid submission exists', async () => {
    const waiting = review({ submittedCount: 0, submissions: [] })
    render(
      <PostgameReviewPanel
        busy={false}
        error={null}
        match={reviewedMatch(waiting)}
        open
        onOpenChange={vi.fn()}
        onResume={vi.fn()}
        onSkip={vi.fn()}
        onStart={vi.fn()}
      />,
    )
    expect(screen.getByText(getCopy('postgame.waitingSheet'))).toBeVisible()
    expect(document.querySelectorAll('.aw-postgame-player-tab[disabled]')).toHaveLength(2)
  })

  it('shows final awards, selects player results, reflections, and individual sheets', async () => {
    const completed = review({
      state: 'completed',
      result,
      reflections: [
        { playerId: 'player-2', text: '我的复盘', completedAt: result.completedAt } as never,
      ],
    })
    render(
      <PostgameReviewPanel
        busy={false}
        error="result warning"
        match={reviewedMatch(completed)}
        open
        onOpenChange={vi.fn()}
        onResume={vi.fn()}
        onSkip={vi.fn()}
        onStart={vi.fn()}
      />,
    )
    expect(screen.getAllByText('result warning')).toHaveLength(2)
    expect(document.querySelectorAll('.aw-postgame-award')).toHaveLength(2)
    const resultTabs = document
      .querySelector(`.aw-postgame-player-tabs[aria-label="${getCopy('postgame.finalResult')}"]`)!
      .querySelectorAll('button')
    expect(resultTabs).toHaveLength(2)
    expect(screen.getByText(getCopy('postgame.reflectionPending'))).toBeVisible()
    await userEvent.click(resultTabs[1]!)
    expect(screen.getByText('我的复盘')).toBeVisible()
    await userEvent.click(
      screen.getByRole('button', { name: getCopy('postgame.individualSheets') }),
    )
    expect(screen.getByText(/二号玩家的评分/u)).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: getCopy('postgame.finalResult') }))
    expect(document.querySelector('.aw-postgame-final-player')).not.toBeNull()
  })

  it.each([
    ['paused', null, '暂停'],
    ['speaking', 'player-1', '一号玩家'],
    ['speaking', null, '0 / 2'],
    ['completed', null, 'MVP'],
  ] as const)('renders %s summary detail', async (state, currentSpeakerId, expected) => {
    const onResume = vi.fn()
    const value = review({
      state,
      currentSpeakerId: currentSpeakerId as never,
      result: state === 'completed' ? result : null,
    })
    render(
      <PostgameReviewPanel
        busy={false}
        error={state === 'paused' ? 'paused reason' : null}
        match={reviewedMatch(value)}
        open={false}
        onOpenChange={vi.fn()}
        onResume={onResume}
        onSkip={vi.fn()}
        onStart={vi.fn()}
      />,
    )
    expect(document.querySelector('.aw-postgame-strip')).toHaveTextContent(expected)
    if (state === 'paused') {
      await userEvent.click(screen.getByRole('button', { name: getCopy('postgame.resume') }))
      expect(onResume).toHaveBeenCalledOnce()
      expect(screen.getByText('paused reason')).toBeVisible()
    }
  })
})
