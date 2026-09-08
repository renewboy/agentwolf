import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PostgameReviewViewSchema, type SeatView } from '@agentwolf/contracts'
import { PlayerRail } from '../src/components/match/PlayerRail.js'
import { matchView } from './fixtures/match.js'

describe('player activity presentation', () => {
  it('shows review completion, awards, and the current reflection without exposing them on idle cards', () => {
    const seats = matchView().seats
    const scores = { information: 8, communication: 8, decision: 8, objective: 8, adaptability: 8 }
    const review = PostgameReviewViewSchema.parse({
      state: 'collecting',
      decisionDeadlineAt: null,
      startedAt: null,
      winningPlayerIds: [seats[0]!.playerId],
      losingPlayerIds: [seats[1]!.playerId],
      submittedCount: 1,
      totalPlayers: 2,
      currentSpeakerId: null,
      submissions: [
        {
          matchId: matchView().id,
          reviewerId: seats[0]!.playerId,
          mvpPlayerId: seats[0]!.playerId,
          svpPlayerId: seats[1]!.playerId,
          ratings: [{ playerId: seats[1]!.playerId, scores }],
          submittedAt: '2026-09-08T00:00:00.000Z',
        },
      ],
      result: {
        mvp: { playerId: seats[0]!.playerId, votes: 2, resolvedBy: 'votes' },
        svp: { playerId: seats[1]!.playerId, votes: 1, resolvedBy: 'votes' },
        players: seats.map((seat) => ({
          playerId: seat.playerId,
          scores,
          overall: 8,
          ratingCount: 1,
        })),
        completedAt: '2026-09-08T00:00:00.000Z',
      },
      reflections: [],
      pausedReason: null,
    })
    const { container, rerender } = render(
      <PlayerRail seats={seats} phaseId="phase-match-ended" postgameReview={review} />,
    )
    expect(container.querySelector('[data-player-id="player-1"]')).toHaveAttribute(
      'data-review-submitted',
      'true',
    )
    expect(container.querySelector('[data-player-id="player-2"]')).toHaveAttribute(
      'data-review-submitted',
      'false',
    )
    expect(screen.getByText('MVP')).toBeVisible()
    expect(screen.getByText('SVP')).toBeVisible()
    rerender(
      <PlayerRail
        seats={seats}
        phaseId="phase-match-ended"
        postgameReview={{ ...review, state: 'speaking', currentSpeakerId: seats[1]!.playerId }}
      />,
    )
    expect(screen.getByText('复盘感言')).toBeVisible()
    expect(screen.getByText('已就绪')).toBeVisible()
    rerender(<PlayerRail seats={seats} phaseId="phase-day-speech" />)
    expect(container.querySelector('.aw-postgame-player-award')).toBeNull()
  })
  it.each([
    ['starting', 'starting', '启动中', true],
    ['syncing', 'syncing', '同步中', true],
    ['thinking', 'thinking', '思考中', true],
    ['ready', 'ready', '已就绪', false],
    ['submitted', 'ready', '已提交', false],
    ['closed', 'ended', '已结束', false],
    ['idle', 'idle', '等待中', false],
    ['failed', 'idle', '连接异常', false],
  ] as const)(
    'presents %s with the right label and moving or resting avatar',
    (sessionStatus, activity, label, moving) => {
      const seat = { ...matchView().seats[0]!, sessionStatus }
      const { container } = render(<PlayerRail seats={[seat]} phaseId="phase-day-speech" />)
      expect(screen.getByText(label)).toBeVisible()
      expect(container.querySelector('article')).toHaveAttribute('data-activity', activity)
      expect(container.querySelectorAll('.aw-avatar-orbit')).toHaveLength(moving ? 1 : 0)
    },
  )

  it('keeps voting, streaming and narration visible, and suspends their avatar motion', () => {
    const seats = matchView().seats.map((seat) => ({ ...seat, sessionStatus: 'thinking' as const }))
    const props = { seats, phaseId: 'phase-day-vote' }
    const { container, rerender } = render(<PlayerRail {...props} />)
    expect(screen.getAllByText('投票中')).toHaveLength(2)
    expect(container.querySelectorAll('[data-activity="voting"]')).toHaveLength(2)
    rerender(
      <PlayerRail
        {...props}
        streamingPlayerId={seats[0]!.playerId}
        narratingPlayerId={seats[1]!.playerId}
      />,
    )
    expect(container.querySelectorAll('[data-activity="speaking"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-activity="narrating"]')).toHaveLength(1)
    expect(container.querySelectorAll('.aw-avatar-orbit')).toHaveLength(2)
    rerender(<PlayerRail {...props} suspended />)
    expect(container.querySelectorAll('[data-activity="paused"]')).toHaveLength(2)
    expect(container.querySelectorAll('.aw-avatar-orbit')).toHaveLength(0)
  })

  it('renders only supplied identity, character and relationship facts', () => {
    const original = matchView().seats[0]!
    const { roleId: _role, roleName: _name, faction: _faction, ...hidden } = original
    const seats: SeatView[] = [
      { ...hidden, sessionStatus: 'idle', active: false },
      {
        ...matchView().seats[1]!,
        alive: false,
        sheriffCandidate: true,
        markers: ['thief-origin', 'cupid-lover'],
        character: { name: '山岚', portraitAssetId: 'portrait-test' } as NonNullable<
          SeatView['character']
        >,
      },
    ]
    const { container } = render(
      <PlayerRail side="right" seats={seats} phaseId="phase-day-speech" />,
    )
    expect(screen.getByRole('complementary', { name: '右侧玩家' })).toBeVisible()
    expect(screen.getByText('未知')).toHaveAttribute('data-role-id', 'hidden')
    expect(container.querySelector('[data-player-id="player-1"]')).toHaveAttribute(
      'data-role-art',
      'hidden',
    )
    expect(screen.getByText('山岚')).toBeVisible()
    expect(container.querySelector('img[src="/api/character-assets/portrait-test"]')).not.toBeNull()
    expect(screen.getByLabelText('已出局')).toBeVisible()
    expect(screen.getByLabelText('上警')).toBeVisible()
    expect(
      container.querySelector('[data-marker-id="thief-origin"] [data-icon="cards"]'),
    ).not.toBeNull()
    expect(
      container.querySelector('[data-marker-id="cupid-lover"] [data-icon="heart"]'),
    ).not.toBeNull()
  })
})
