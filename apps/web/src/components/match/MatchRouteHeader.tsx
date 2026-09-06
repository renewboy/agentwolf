import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { getCopy } from '@agentwolf/assets'
import type { MatchId, MatchView } from '@agentwolf/contracts'
import { gameArt } from '../../game-art.js'
import { useRuntimeConfig } from '../../hooks/useRuntimeConfig.js'
import { GameIcon } from '../GameIcon.js'
import { DayNavigator } from '../DayNavigator.js'
import { currentMatchDay } from '../../match-timeline.js'

const emptyDays: readonly number[] = []

export function MatchRouteHeader({
  match,
  matchId = match?.id ?? null,
  page,
  viewPending = false,
  days = emptyDays,
  selectedDay,
  onSelectDay,
  children,
}: {
  readonly match: MatchView | null
  readonly matchId?: MatchId | null
  readonly page: 'match' | 'trajectory'
  readonly viewPending?: boolean
  readonly days?: readonly number[]
  readonly selectedDay?: number | undefined
  readonly onSelectDay?: ((day: number) => void) | undefined
  readonly children?: ReactNode
}) {
  const { developerMode } = useRuntimeConfig()
  const switchLabel = getCopy(page === 'match' ? 'match.openTrajectory' : 'trajectory.openMatch')
  return (
    <header className="aw-match-hud" data-page={page}>
      <div className="aw-match-hud__inner">
        <div className="aw-match-brand">
          <div className="aw-match-navigation">
            <Link
              className="aw-button aw-button--compact aw-button--square"
              aria-label={getCopy('match.backLobby')}
              to="/"
            >
              <GameIcon name="back" size={18} />
            </Link>
            {developerMode && matchId ? (
              <Link
                className="aw-button aw-button--compact aw-button--square"
                aria-label={switchLabel}
                to={`/matches/${matchId}${page === 'match' ? '/trajectory' : ''}`}
              >
                <GameIcon name="swap" size={18} />
              </Link>
            ) : null}
          </div>
          <img className="aw-match-brand__emblem" src={gameArt.emblem} alt="" />
          <div className="aw-match-brand__title">
            <span className="aw-brand">{getCopy('brand')}</span>
            {match ? <small>{match.boardName}</small> : null}
          </div>
        </div>
        {match ? (
          <div className="aw-phase-display" aria-hidden={viewPending}>
            <DayNavigator
              day={selectedDay ?? currentMatchDay(match)}
              days={days}
              disabled={viewPending}
              onSelect={onSelectDay}
            />
          </div>
        ) : null}
        {page === 'trajectory' ? (
          <h1 className="aw-match-route-title">{getCopy('trajectory.title')}</h1>
        ) : (
          children
        )}
      </div>
    </header>
  )
}
