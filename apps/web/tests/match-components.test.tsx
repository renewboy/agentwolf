import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  PostgameReviewResult,
  PostgameReviewView,
  SeatView,
  TimelineItem,
} from '@agentwolf/contracts'

vi.mock('../src/hooks/useRuntimeConfig.js', () => ({
  useRuntimeConfig: () => ({ developerMode: true }),
}))

import { MatchFeed, type SpeechAudioControls } from '../src/components/match/MatchFeed.js'
import { MatchHeader } from '../src/components/match/MatchHeader.js'
import {
  PostgameAwardCard,
  PostgameFeedAwards,
} from '../src/components/match/PostgameAwardResults.js'
import { PostgameRadar } from '../src/components/match/PostgameRadar.js'
import { PlayerRail } from '../src/components/match/PlayerRail.js'
import { matchView } from './fixtures/match.js'

const scores = {
  information: 8,
  communication: 7,
  decision: 9,
  objective: 6,
  adaptability: 8,
}

const postgameResult = {
  mvp: { playerId: 'player-1', votes: 3, resolvedBy: 'votes' },
  svp: { playerId: 'player-2', votes: 2, resolvedBy: 'score' },
  players: [
    { playerId: 'player-1', scores, overall: 7.6, ratingCount: 2 },
    { playerId: 'player-2', scores, overall: 7.4, ratingCount: 2 },
  ],
  completedAt: '2026-08-28T00:01:00.000Z',
} as PostgameReviewResult

const postgame = {
  state: 'collecting',
  decisionDeadlineAt: null,
  startedAt: '2026-08-28T00:00:00.000Z',
  winningPlayerIds: ['player-1'],
  losingPlayerIds: ['player-2'],
  submittedCount: 1,
  totalPlayers: 2,
  currentSpeakerId: null,
  submissions: [
    {
      matchId: 'match-test-abcdef',
      reviewerId: 'player-1',
      mvpPlayerId: 'player-1',
      svpPlayerId: 'player-2',
      ratings: [],
      submittedAt: '2026-08-28T00:00:30.000Z',
    },
  ],
  result: postgameResult,
  reflections: [],
  pausedReason: null,
} as unknown as PostgameReviewView

function timelineItem(
  sequence: number,
  kind: string,
  title: string,
  options: Partial<TimelineItem> = {},
): TimelineItem {
  return {
    sequence,
    kind,
    title,
    playerIds: [],
    occurredAt: '2026-08-28T12:34:00.000Z',
    ...options,
  } as TimelineItem
}

const audio = {
  supported: true,
  automaticSequence: null,
  automaticPlayerId: null,
  automaticBusy: false,
  manualSequence: null,
  play: vi.fn(),
  stop: vi.fn(),
  skip: vi.fn(),
} satisfies SpeechAudioControls

beforeEach(() => {
  audio.play.mockReset()
  audio.stop.mockReset()
  audio.skip.mockReset()
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(0)
    return 1
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
})

describe('MatchHeader', () => {
  it('switches views, players, effects, audio, and shows developer navigation', async () => {
    const setViewKind = vi.fn()
    const setPlayerId = vi.fn()
    const setEffectMode = vi.fn()
    const toggleAudio = vi.fn()
    const match = matchView()
    const { rerender } = render(
      <MemoryRouter>
        <MatchHeader
          audioBusyElsewhere={false}
          audioEnabled={false}
          audioSupported
          connectionState="live"
          effectMode="full"
          match={match}
          playerId={'player-1' as never}
          setEffectMode={setEffectMode}
          setPlayerId={setPlayerId}
          setViewKind={setViewKind}
          viewKind="god"
          onToggleAudio={toggleAudio}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: '切换到玩家行动轨迹' })).toHaveAttribute(
      'href',
      `/matches/${match.id}/trajectory`,
    )
    expect(screen.getByText('白天发言')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '闭眼视角' }))
    await userEvent.click(screen.getByRole('button', { name: '玩家视角' }))
    expect(setViewKind).toHaveBeenNthCalledWith(1, 'closed-eye')
    expect(setViewKind).toHaveBeenNthCalledWith(2, 'player')
    await userEvent.click(screen.getByRole('button', { name: /语音播报/ }))
    expect(toggleAudio).toHaveBeenCalledOnce()

    rerender(
      <MemoryRouter>
        <MatchHeader
          audioBusyElsewhere={false}
          audioEnabled
          audioSupported
          connectionState="live"
          effectMode="reduced"
          match={{ ...match, phaseId: 'phase-night-wolf', phaseLabel: '狼人行动' }}
          playerId={'player-1' as never}
          setEffectMode={setEffectMode}
          setPlayerId={setPlayerId}
          setViewKind={setViewKind}
          viewKind="player"
          onToggleAudio={toggleAudio}
        />
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('combobox', { name: '选择玩家视角' }))
    await userEvent.click(screen.getByRole('option', { name: /二号玩家/ }))
    expect(setPlayerId).toHaveBeenCalledWith('player-2')
    await userEvent.click(screen.getByRole('combobox', { name: '技能特效' }))
    await userEvent.click(screen.getByRole('option', { name: '关闭' }))
    expect(setEffectMode).toHaveBeenCalledWith('off')
    expect(screen.getByText('第 2 夜')).toBeVisible()
  })

  it.each([
    ['connecting', '连接中'],
    ['reconnecting', '重连'],
    ['live', '实时'],
    ['settled', '结束'],
    ['unavailable', '不可用'],
  ] as const)('renders %s connection state', (connectionState, _label) => {
    render(
      <MemoryRouter>
        <MatchHeader
          audioBusyElsewhere={connectionState === 'live'}
          audioEnabled={false}
          audioSupported={connectionState !== 'unavailable'}
          connectionState={connectionState}
          effectMode="off"
          match={
            connectionState === 'settled'
              ? matchView({ status: 'ended', winner: 'village' })
              : matchView({ status: 'paused' })
          }
          playerId={'player-1' as never}
          setEffectMode={vi.fn()}
          setPlayerId={vi.fn()}
          setViewKind={vi.fn()}
          viewKind="closed-eye"
          onToggleAudio={vi.fn()}
        />
      </MemoryRouter>,
    )
    expect(document.querySelector('.aw-connection-indicator')).toHaveAttribute(
      'data-state',
      connectionState,
    )
    expect(document.querySelector('.aw-audio-toggle')).toBeDisabled()
  })

  it('keeps audio available during active postgame review', () => {
    render(
      <MemoryRouter>
        <MatchHeader
          audioBusyElsewhere={false}
          audioEnabled={false}
          audioSupported
          connectionState="live"
          effectMode="full"
          match={matchView({ status: 'ended', winner: 'village', postgameReview: postgame })}
          playerId={'player-1' as never}
          setEffectMode={vi.fn()}
          setPlayerId={vi.fn()}
          setViewKind={vi.fn()}
          viewKind="god"
          onToggleAudio={vi.fn()}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: /语音播报/ })).toBeEnabled()
  })
})

describe('PlayerRail and postgame summaries', () => {
  it('renders a projected relationship marker beside the Role badge', () => {
    const seats = matchView().seats.map((seat, index) => ({
      ...seat,
      markers: index === 0 ? ['cupid-lover'] : [],
    })) as SeatView[]
    render(<PlayerRail phaseId="phase-day-vote" postgameReview={null} seats={seats} side="left" />)

    const marker = screen.getByLabelText('情侣')
    expect(marker).toHaveAttribute('data-marker-id', 'cupid-lover')
    expect(marker.closest('.aw-player-card')).toHaveAttribute('data-player-id', 'player-1')
    expect(screen.getByText('二号玩家').closest('.aw-player-card')).not.toContainElement(marker)
  })

  it('renders character, sheriff, candidate, elimination, awards, and postgame statuses', () => {
    const seats = matchView().seats.map((seat, index) => ({
      ...seat,
      alive: index === 0,
      sheriff: index === 0,
      sheriffCandidate: index === 1,
      character:
        index === 0 ? { name: '角色卡', portraitAssetId: 'portrait-test', universe: '测试' } : null,
    })) as SeatView[]
    const { rerender } = render(
      <PlayerRail
        compact
        phaseId="phase-day-vote"
        postgameReview={postgame}
        seats={seats}
        side="left"
      />,
    )
    expect(screen.getByRole('complementary', { name: '左侧玩家' })).toBeVisible()
    expect(screen.getByAltText('')).toHaveAttribute('src', '/api/character-assets/portrait-test')
    expect(screen.getByLabelText('警长')).toBeVisible()
    expect(screen.getByLabelText('上警')).toBeVisible()
    expect(screen.getByLabelText('已出局')).toBeVisible()
    expect(screen.getAllByText(/MVP/).length).toBeGreaterThan(0)
    expect(screen.getByText('SVP')).toBeVisible()
    expect(screen.getByText('一号玩家').closest('.aw-player-card')).toHaveAttribute(
      'data-review-submitted',
      'true',
    )
    expect(screen.getByText('二号玩家').closest('.aw-player-card')).toHaveAttribute(
      'data-review-submitted',
      'false',
    )

    rerender(
      <PlayerRail
        phaseId="phase-day-vote"
        postgameReview={{ ...postgame, state: 'reflecting', currentSpeakerId: 'player-2' } as never}
        seats={seats}
        side="right"
      />,
    )
    expect(screen.getByRole('complementary', { name: '右侧玩家' })).toHaveTextContent('复盘感言')

    rerender(<PlayerRail phaseId="phase-day-vote" seats={seats} side="mobile" />)
    expect(screen.getByRole('complementary', { name: '玩家' })).toHaveTextContent('投票中')
  })

  it('renders radar values and all award resolution methods', () => {
    const seats = matchView().seats
    const { rerender } = render(<PostgameRadar scores={scores} />)
    expect(screen.getByRole('img', { name: '最终结果' })).toBeVisible()
    expect(screen.queryByText(/综合/)).not.toBeInTheDocument()
    rerender(<PostgameRadar ariaLabel="自定义雷达" overall={7.6} scores={scores} />)
    expect(screen.getByRole('img', { name: '自定义雷达' })).toBeVisible()
    expect(screen.getByText(/7.6/)).toBeVisible()
    expect(document.querySelectorAll('.aw-postgame-radar__grid')).toHaveLength(5)
    expect(document.querySelectorAll('.aw-postgame-radar__point')).toHaveLength(5)

    rerender(<PostgameFeedAwards result={postgameResult} seats={seats} />)
    expect(screen.getAllByText(/MVP/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/SVP/).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('img')).toHaveLength(2)

    const stable = {
      ...postgameResult,
      mvp: { playerId: 'player-9', votes: 1, resolvedBy: 'stable-draw' },
      players: [],
    } as unknown as PostgameReviewResult
    rerender(<PostgameAwardCard award="mvp" result={stable} seats={[]} />)
    expect(screen.getByText('player-9')).toBeVisible()
    expect(screen.getByText(/稳定抽签/)).toBeVisible()
  })
})

describe('MatchFeed', () => {
  const baseTimeline = [
    timelineItem(1, 'match.created', '对局创建'),
    timelineItem(2, 'night.started', '第 1 夜'),
    timelineItem(3, 'guard.protected', '守卫守护'),
    timelineItem(4, 'public.announcement', '公开播报', { detail: '详情' }),
    timelineItem(5, 'match.paused', '对局暂停'),
    timelineItem(6, 'speech.committed', '玩家发言', { playerIds: ['player-1' as never] }),
    timelineItem(7, 'vote.resolved', '投票结果', {
      playerIds: ['player-1' as never, 'player-2' as never],
      detail: '投1号：2号\n无人投票',
    }),
    timelineItem(8, 'speech.committed', '复盘发言', {
      playerIds: ['player-2' as never],
      postgame: true,
    }),
  ]

  it('groups and renders every feed-item family with audio controls', async () => {
    const seats = matchView().seats
    const { rerender } = render(
      <MatchFeed
        activeSpeech={null}
        audio={audio}
        postgameReview={postgame}
        seats={seats}
        timeline={baseTimeline}
      />,
    )
    expect(screen.getByRole('log')).toBeVisible()
    for (const toggle of screen.getAllByRole('button', { name: /^展开/u })) {
      await userEvent.click(toggle)
    }
    expect(screen.getByText('对局创建')).toBeVisible()
    expect(screen.getByText('投1号：')).toBeVisible()
    expect(screen.getByText('无人投票')).toBeVisible()
    expect(screen.getAllByText(/MVP/).length).toBeGreaterThan(0)
    const play = screen.getAllByRole('button', { name: /播放.*发言/ })[0]!
    await userEvent.click(play)
    expect(audio.play).toHaveBeenCalled()

    rerender(
      <MatchFeed
        activeSpeech={{ playerId: 'player-1' as never, text: '生成中', final: false }}
        audio={{ ...audio, automaticPlayerId: 'player-1' as never, automaticBusy: true }}
        postgameReview={postgame}
        seats={seats}
        timeline={baseTimeline}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /一号玩家.*跳过/ }))
    expect(audio.skip).toHaveBeenCalledOnce()

    rerender(
      <MatchFeed
        activeSpeech={{ playerId: 'player-1' as never, text: '', final: false }}
        audio={{ ...audio, automaticSequence: 6, manualSequence: 8 }}
        postgameReview={postgame}
        seats={seats}
        timeline={baseTimeline}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /一号玩家.*跳过/ }))
    await userEvent.click(screen.getByRole('button', { name: /二号玩家.*停止/ }))
    expect(audio.stop).toHaveBeenCalledOnce()
    expect(screen.getByText('等待下一位玩家发言')).toBeVisible()
  })

  it('handles empty feeds, unknown speakers, group toggles, and unsupported audio', async () => {
    const { rerender } = render(
      <MatchFeed
        activeSpeech={null}
        audio={{ ...audio, supported: false }}
        postgameReview={null}
        seats={matchView().seats}
        timeline={[]}
      />,
    )
    expect(screen.getByText('等待裁判公布事件')).toBeVisible()
    rerender(
      <MatchFeed
        activeSpeech={{ playerId: 'player-99' as never, text: '隐藏', final: false }}
        audio={{ ...audio, supported: false }}
        postgameReview={null}
        seats={matchView().seats}
        timeline={[timelineItem(1, 'day.started', '第 1 天')]}
      />,
    )
    expect(screen.queryByText('隐藏')).not.toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: /折叠/ })
    await userEvent.click(toggle)
    expect(screen.getByRole('button', { name: /展开/ })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: /展开/ }))
  })

  it('detaches explicit readers, reports new activity, and returns to latest', async () => {
    const { rerender } = render(
      <MatchFeed
        activeSpeech={null}
        audio={audio}
        postgameReview={null}
        seats={matchView().seats}
        timeline={[timelineItem(1, 'night.started', '夜晚')]}
      />,
    )
    const log = screen.getByRole('log')
    const scrollTo = vi.fn()
    Object.defineProperties(log, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 200 },
      scrollTop: { configurable: true, writable: true, value: 300 },
      scrollTo: { configurable: true, value: scrollTo },
    })
    fireEvent.wheel(log, { deltaY: -1 })
    rerender(
      <MatchFeed
        activeSpeech={{ playerId: 'player-1' as never, text: '新增', final: false }}
        audio={audio}
        postgameReview={null}
        seats={matchView().seats}
        timeline={[
          timelineItem(1, 'night.started', '夜晚'),
          timelineItem(2, 'speech.committed', '新增', { playerIds: ['player-1' as never] }),
        ]}
      />,
    )
    expect(await screen.findByRole('button', { name: '回到最新' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '回到最新' }))
    expect(scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: 'smooth' })

    fireEvent.keyDown(log, { key: 'Home' })
    fireEvent.pointerDown(log)
    fireEvent.scroll(log, { target: { scrollTop: 800 } })
    fireEvent.scroll(log, { target: { scrollTop: 700 } })
    fireEvent.wheel(log, { deltaY: 1 })
    fireEvent.keyDown(log, { key: 'ArrowDown' })
    await waitFor(() => expect(screen.queryByRole('button', { name: '回到最新' })).toBeNull())
  })
})
