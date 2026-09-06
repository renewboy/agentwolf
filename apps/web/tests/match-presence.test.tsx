import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PostgameReviewViewSchema, type PostgameReviewView } from '@agentwolf/contracts'
import { PresenceStage } from '../src/components/match/MatchPresence.js'
import { matchView } from './fixtures/match.js'

function review(overrides: Partial<PostgameReviewView>): PostgameReviewView {
  const seats = matchView().seats
  return PostgameReviewViewSchema.parse({
    state: 'speaking',
    decisionDeadlineAt: null,
    startedAt: '2026-09-05T00:00:00.000Z',
    winningPlayerIds: [seats[0]!.playerId],
    losingPlayerIds: [seats[1]!.playerId],
    submittedCount: 0,
    totalPlayers: seats.length,
    currentSpeakerId: null,
    submissions: [],
    result: null,
    reflections: [],
    pausedReason: null,
    ...overrides,
  })
}

describe('MatchPresence visibility boundaries', () => {
  it.each([
    ['paused', '复盘已暂停'],
    ['countdown', '复盘即将开始'],
    ['collecting', '等待玩家完成赛后评分'],
  ] as const)('announces the %s review without naming the previous game actor', (state, label) => {
    const match = matchView({ status: 'ended', postgameReview: review({ state }) })
    const { container } = render(
      <PresenceStage
        activePlayer={match.seats[0]!}
        connectionState="live"
        match={match}
        state="thinking"
        thinkingCount={1}
      />,
    )
    expect(container.querySelector('.aw-presence__copy strong')).toHaveTextContent(label)
    expect(screen.queryByText(/一号玩家|二号玩家/)).not.toBeInTheDocument()
  })

  it('names only the review speaker available in the current projection', () => {
    const base = matchView()
    const projectedReview = review({ currentSpeakerId: base.seats[1]!.playerId })
    const { container, rerender } = render(
      <PresenceStage
        activePlayer={base.seats[0]!}
        connectionState="live"
        match={matchView({ postgameReview: projectedReview })}
        state="thinking"
        thinkingCount={1}
      />,
    )
    expect(container.querySelector('.aw-presence__copy strong')).toHaveTextContent(
      '二号玩家正在发表复盘感言',
    )
    expect(screen.queryByText(/一号玩家/)).not.toBeInTheDocument()

    rerender(
      <PresenceStage
        activePlayer={null}
        connectionState="reconnecting"
        match={matchView({ seats: [base.seats[0]!], postgameReview: projectedReview })}
        state="thinking"
        thinkingCount={1}
      />,
    )
    expect(container.querySelector('.aw-presence__copy strong')).toHaveTextContent(
      '等待玩家完成当前行动',
    )
    expect(container).not.toHaveTextContent('二号玩家')
    expect(container).not.toHaveTextContent(base.seats[1]!.playerId)
  })

  it('uses a neutral activity label when the projection has no active player or phase label', () => {
    const match = matchView({ phaseLabel: '' })
    const { container } = render(
      <PresenceStage
        activePlayer={null}
        connectionState="reconnecting"
        match={match}
        state="thinking"
        thinkingCount={1}
      />,
    )
    expect(screen.getByText('对局实时同步中')).toBeVisible()
    expect(container.querySelector('.aw-presence__copy strong')).toHaveTextContent(
      '等待玩家完成当前行动',
    )
    expect(container).not.toHaveTextContent('二号玩家')
  })

  it('ends the review without retaining its previous speaker and announces settled synchronization', () => {
    const base = matchView()
    const { container } = render(
      <PresenceStage
        activePlayer={null}
        connectionState="settled"
        match={matchView({
          status: 'ended',
          winner: 'village',
          postgameReview: review({ state: 'completed', currentSpeakerId: base.seats[1]!.playerId }),
        })}
        state="ended"
        thinkingCount={0}
      />,
    )
    expect(container.querySelector('.aw-presence__copy strong')).toHaveTextContent('好人阵营获胜')
    expect(container.querySelector('.aw-presence__copy small')).toBeNull()
    expect(container).toHaveTextContent('对局记录已完整同步')
    expect(container).not.toHaveTextContent('二号玩家')
  })

  it('keeps the authorized faction result when no winning name is available in the projection', () => {
    const base = matchView()
    const { container } = render(
      <PresenceStage
        activePlayer={null}
        connectionState="settled"
        match={matchView({
          status: 'ended',
          winner: 'independent',
          winningPlayerIds: [base.seats[1]!.playerId],
          seats: [base.seats[0]!],
        })}
        state="ended"
        thinkingCount={0}
      />,
    )
    expect(container.querySelector('.aw-presence__copy strong')).toHaveTextContent('第三方阵营获胜')
    expect(container).not.toHaveTextContent('二号玩家')
    expect(container).not.toHaveTextContent(base.seats[1]!.playerId)
  })
})
