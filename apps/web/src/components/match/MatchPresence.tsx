import type { ReactNode } from 'react'
import { formatCopy, getCopy } from '@agentwolf/assets'
import type { MatchView, SeatView } from '@agentwolf/contracts'
import type { LiveConnectionState } from '../../hooks/useLiveMatch.js'
import type { MatchPresenceState } from './MatchMotionController.js'
import { InkActivity, type InkActivityState } from './InkActivity.js'

export function PresenceStage({
  state,
  match,
  activePlayer,
  connectionState,
  thinkingCount,
  playbackBar,
}: {
  readonly state: MatchPresenceState
  readonly match: MatchView
  readonly activePlayer: SeatView | null
  readonly connectionState: LiveConnectionState
  readonly thinkingCount: number
  readonly playbackBar?: ReactNode
}) {
  const label = presenceLabel(state, match, activePlayer, thinkingCount)
  const activity: InkActivityState =
    state === 'streaming'
      ? 'speaking'
      : state === 'narrating' ||
          state === 'thinking' ||
          state === 'starting' ||
          state === 'paused' ||
          state === 'ended'
        ? state
        : state === 'reconnecting' || state === 'recovering-agents'
          ? 'reconnecting'
          : state === 'initial-loading'
            ? 'syncing'
            : state === 'awaiting-actions' && match.phaseId.includes('vote')
              ? 'voting'
              : 'waiting'
  return (
    <section className="aw-panel aw-presence" data-state={state} aria-live="polite">
      {playbackBar}
      <InkActivity className="aw-presence__signal" state={activity} />
      <div className="aw-presence__copy">
        {state !== 'ended' ? (
          <small className="aw-phase-title">
            {match.phaseLabel || getCopy('match.presenceLive')}
          </small>
        ) : null}
        <strong className="aw-player-name">{label}</strong>
      </div>
      <span className="aw-presence__wave" aria-hidden>
        <span />
        <span />
        <span />
        <span />
        <span />
      </span>
      <span className="aw-effect-caption-slot" aria-hidden />
      <span className="aw-visually-hidden">
        {connectionState === 'live'
          ? getCopy('match.connectionLive')
          : connectionState === 'settled'
            ? getCopy('match.connectionSettled')
            : label}
      </span>
    </section>
  )
}

function presenceLabel(
  state: MatchPresenceState,
  match: MatchView,
  activePlayer: SeatView | null,
  thinkingCount: number,
): string {
  const review = match.postgameReview
  if (review && !['completed', 'skipped'].includes(review.state)) {
    if (review.state === 'paused') return getCopy('postgame.paused')
    if (review.state === 'countdown') return getCopy('postgame.countdownTitle')
    if (review.state === 'collecting') return getCopy('postgame.collectingPresence')
    const speaker = match.seats.find((seat) => seat.playerId === review.currentSpeakerId)
    if (speaker) {
      return formatCopy(getCopy('postgame.speakingPresence'), { player: speaker.name })
    }
  }
  const orderingSheriff =
    match.phaseId === 'phase-day-speech-order'
      ? match.seats.find((seat) => seat.sheriff && seat.alive)
      : undefined
  switch (state) {
    case 'starting':
      return getCopy('match.presenceStarting')
    case 'thinking':
      if (orderingSheriff) {
        return formatCopy(getCopy('match.presenceSheriffOrdering'), {
          seat: orderingSheriff.seat,
          player: orderingSheriff.name,
        })
      }
      if (thinkingCount > 1) {
        return formatCopy(getCopy('match.presenceThinkingMany'), { count: thinkingCount })
      }
      return activePlayer
        ? formatCopy(getCopy('match.presenceThinking'), { player: activePlayer.name })
        : getCopy('match.presenceAwaiting')
    case 'streaming':
      return activePlayer
        ? formatCopy(getCopy('match.presenceStreaming'), { player: activePlayer.name })
        : getCopy('match.presenceAwaiting')
    case 'narrating':
      return activePlayer
        ? formatCopy(getCopy('match.presenceNarrating'), { player: activePlayer.name })
        : getCopy('match.presenceNarratingFallback')
    case 'resolving':
      return getCopy('match.presenceResolving')
    case 'reconnecting':
      return getCopy('match.presenceReconnecting')
    case 'recovering-agents':
      return getCopy('match.presenceRecoveringAgents')
    case 'switching-view':
      return getCopy('match.presenceSwitchingView')
    case 'paused':
      return getCopy('match.presencePaused')
    case 'ended':
      return matchWinnerLabel(match)
    case 'initial-loading':
      return getCopy('match.syncing')
    case 'awaiting-actions':
      if (orderingSheriff) {
        return formatCopy(getCopy('match.presenceSheriffOrderPending'), {
          seat: orderingSheriff.seat,
          player: orderingSheriff.name,
        })
      }
      return getCopy(
        match.phaseId.includes('vote') ? 'match.presenceVotePending' : 'match.presenceAwaiting',
      )
    default:
      return getCopy('match.presenceAwaiting')
  }
}

export function matchWinnerLabel(match: MatchView): string {
  if (!match.winner) return getCopy('match.presenceEnded')
  const factionWinnerIds = match.seats
    .filter((seat) => seat.faction === match.winner)
    .map((seat) => seat.playerId)
    .sort()
  const explicitWinnerIds = [...match.winningPlayerIds].sort()
  const hasDynamicWinners =
    explicitWinnerIds.length > 0 &&
    (explicitWinnerIds.length !== factionWinnerIds.length ||
      explicitWinnerIds.some((playerId, index) => playerId !== factionWinnerIds[index]))
  if (!hasDynamicWinners) {
    return formatCopy(getCopy('match.winner'), { faction: getCopy(`factions.${match.winner}`) })
  }
  const winningPlayers = match.seats
    .filter((seat) => match.winningPlayerIds.includes(seat.playerId))
    .map((seat) =>
      formatCopy(getCopy('postgame.playerShort'), { seat: seat.seat, name: seat.name }),
    )
    .join('、')
  return winningPlayers
    ? formatCopy(getCopy('match.winnerWithPlayers'), {
        faction: getCopy(`factions.${match.winner}`),
        players: winningPlayers,
      })
    : formatCopy(getCopy('match.winner'), { faction: getCopy(`factions.${match.winner}`) })
}
