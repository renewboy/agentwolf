import { GameIcon } from '../GameIcon.js'
import { getCopy, getPlayerMarkerDefinition, type PlayerMarkerDefinition } from '@agentwolf/assets'
import type { PlayerId, PlayerMarkerId, PostgameReviewView, SeatView } from '@agentwolf/contracts'
import { gameArt } from '../../game-art.js'
import { characterPortraitUrl } from '../../character-portraits.js'
import { formatAgentConfiguration } from '../../agent-configuration.js'
import { roleArtwork } from '../../role-art.js'
import { InkActivity, type InkActivityState } from './InkActivity.js'
import { AvatarActivity } from './AvatarActivity.js'

export function PlayerRail({
  seats,
  side = 'left',
  phaseId,
  postgameReview = null,
  streamingPlayerId = null,
  narratingPlayerId = null,
  suspended = false,
}: {
  readonly side?: 'left' | 'right'
  readonly seats: readonly SeatView[]
  readonly phaseId: string
  readonly postgameReview?: PostgameReviewView | null
  readonly streamingPlayerId?: PlayerId | null
  readonly narratingPlayerId?: PlayerId | null
  readonly suspended?: boolean
}) {
  return (
    <aside
      className="aw-player-rail"
      data-side={side}
      aria-label={getCopy(side === 'left' ? 'match.leftPlayers' : 'match.rightPlayers')}
    >
      <div className="aw-player-rail__inner">
        {seats.map((seat) => (
          <PlayerCard
            key={seat.playerId}
            phaseId={phaseId}
            postgameReview={postgameReview}
            seat={seat}
            speaking={seat.playerId === streamingPlayerId}
            narrating={seat.playerId === narratingPlayerId}
            suspended={suspended}
          />
        ))}
      </div>
    </aside>
  )
}

function PlayerCard({
  seat,
  phaseId,
  postgameReview,
  speaking,
  narrating,
  suspended,
}: {
  readonly seat: SeatView
  readonly phaseId: string
  readonly postgameReview: PostgameReviewView | null
  readonly speaking: boolean
  readonly narrating: boolean
  readonly suspended: boolean
}) {
  const artwork = roleArtwork(seat.roleId)
  const submittedReview = postgameReview?.submissions.some(
    (submission) => submission.reviewerId === seat.playerId,
  )
  const award =
    postgameReview?.result?.mvp.playerId === seat.playerId
      ? 'mvp'
      : postgameReview?.result?.svp.playerId === seat.playerId
        ? 'svp'
        : null
  const activity: InkActivityState = suspended
    ? 'paused'
    : speaking
      ? 'speaking'
      : narrating
        ? 'narrating'
        : seat.sessionStatus === 'thinking'
          ? phaseId.includes('vote')
            ? 'voting'
            : 'thinking'
          : seat.sessionStatus === 'starting' || seat.sessionStatus === 'syncing'
            ? seat.sessionStatus
            : seat.sessionStatus === 'ready' || seat.sessionStatus === 'submitted'
              ? 'ready'
              : seat.sessionStatus === 'closed'
                ? 'ended'
                : 'idle'
  const statusLabel = speaking
    ? getCopy('match.playerSpeaking')
    : narrating
      ? getCopy('match.playerNarrating')
      : postgameReview
        ? getCopy(
            postgameReview.state === 'collecting'
              ? submittedReview
                ? 'postgame.submitted'
                : 'postgame.waiting'
              : postgameReview.currentSpeakerId === seat.playerId
                ? 'postgame.reflection'
                : `sessionStatuses.${seat.sessionStatus}`,
          )
        : getCopy(
            seat.sessionStatus === 'thinking' && phaseId.includes('vote')
              ? 'match.playerVoting'
              : `sessionStatuses.${seat.sessionStatus}`,
          )
  return (
    <article
      className="aw-player-card"
      data-role-art={artwork.id}
      data-active={seat.active}
      data-alive={seat.alive}
      data-player-id={seat.playerId}
      data-session={seat.sessionStatus}
      data-activity={activity}
      data-review-submitted={submittedReview}
      data-sheriff-candidate={seat.sheriffCandidate}
    >
      <span className="aw-player-card__cloud" aria-hidden />
      <div className="aw-player-avatar">
        <span className="aw-player-avatar__core" aria-hidden>
          {seat.character ? (
            <img src={characterPortraitUrl(seat.character.portraitAssetId)} alt="" />
          ) : (
            <img src={gameArt.defaultPlayer} alt="" />
          )}
        </span>
        <img className="aw-player-avatar__frame" src={artwork.avatar} alt="" />
        <AvatarActivity state={activity} />
        <span className="aw-player-card__role" data-role-id={seat.roleId ?? 'hidden'}>
          {seat.roleName ?? getCopy('match.roleHidden')}
        </span>
      </div>
      <span className="aw-player-card__seat" aria-hidden>
        {String(seat.seat).padStart(2, '0')}
      </span>
      <div className="aw-player-card__copy">
        <div className="aw-player-card__name-row">
          <strong className="aw-player-name">{seat.name}</strong>
          {seat.sheriff ? (
            <span
              className="aw-player-crown"
              data-flip-id="sheriff-crown"
              role="img"
              aria-label={getCopy('roles.sheriff')}
            >
              <GameIcon name="crown" size={16} />
            </span>
          ) : null}
          {!seat.alive ? (
            <span role="img" aria-label={getCopy('match.eliminated')}>
              <GameIcon name="skull" size={15} />
            </span>
          ) : null}
        </div>
        {seat.character ? (
          <span className="aw-player-name aw-player-card__character">{seat.character.name}</span>
        ) : null}
        <div className="aw-player-card__badges">
          {(seat.markers ?? []).map((markerId) => (
            <PlayerMarkerBadge key={markerId} markerId={markerId} />
          ))}
          {seat.sheriffCandidate ? (
            <span className="aw-sheriff-candidate" aria-label={getCopy('match.sheriffCandidate')}>
              <GameIcon name="hand" size={13} />
              {getCopy('match.sheriffCandidate')}
            </span>
          ) : null}
          {award ? (
            <span className="aw-postgame-player-award" data-award={award}>
              <GameIcon name="award" size={13} />
              {award.toUpperCase()}
            </span>
          ) : null}
        </div>
        <span className="aw-player-card__status">
          <span className="aw-player-card__status-mark" aria-hidden />
          <InkActivity className="aw-player-card__activity" state={activity} />
          {statusLabel}
        </span>
      </div>
      <span className="aw-player-card__agent">{formatAgentConfiguration(seat.agent)}</span>
    </article>
  )
}

function PlayerMarkerBadge({ markerId }: { readonly markerId: PlayerMarkerId }) {
  const definition = getPlayerMarkerDefinition(markerId)
  const label = getCopy(definition.labelKey)
  return (
    <span
      className="aw-player-marker"
      data-marker-id={definition.id}
      data-tone={definition.tone}
      aria-label={label}
    >
      <PlayerMarkerIcon icon={definition.icon} />
      {label}
    </span>
  )
}

function PlayerMarkerIcon({ icon }: { readonly icon: PlayerMarkerDefinition['icon'] }) {
  switch (icon) {
    case 'heart':
      return <GameIcon name="heart" size={11} />
    case 'cards':
      return <GameIcon name="cards" size={11} />
  }
  throw new Error('Unknown player marker icon')
}
