import { Crown, HandPalm, Skull } from '@phosphor-icons/react'
import { formatCopy, getCopy } from '@agentwolf/assets'
import type { SeatView } from '@agentwolf/contracts'
import { RoleBadge } from '../RoleBadge.js'

export function PlayerRail({
  seats,
  side,
  phaseId,
  compact = false,
}: {
  readonly seats: readonly SeatView[]
  readonly side: 'left' | 'right' | 'mobile'
  readonly phaseId: string
  readonly compact?: boolean
}) {
  return (
    <aside
      className={`aw-player-rail aw-player-rail--${side}`}
      aria-label={getCopy(
        side === 'left'
          ? 'match.leftPlayers'
          : side === 'right'
            ? 'match.rightPlayers'
            : 'match.players',
      )}
    >
      <div className="aw-player-rail__inner">
        {seats.map((seat) => (
          <PlayerCard
            compact={compact}
            key={seat.playerId}
            phaseId={phaseId}
            seat={seat}
            side={side}
          />
        ))}
      </div>
    </aside>
  )
}

function PlayerCard({
  seat,
  side,
  phaseId,
  compact,
}: {
  readonly seat: SeatView
  readonly side: 'left' | 'right' | 'mobile'
  readonly phaseId: string
  readonly compact: boolean
}) {
  const initial = Array.from(seat.name)[0] ?? String(seat.seat)
  const statusLabel = getCopy(
    seat.sessionStatus === 'thinking' && phaseId.includes('vote')
      ? 'match.playerVoting'
      : `sessionStatuses.${seat.sessionStatus}`,
  )
  return (
    <article
      className="aw-player-card"
      data-active={seat.active}
      data-alive={seat.alive}
      data-compact={compact}
      data-player-id={seat.playerId}
      data-session={seat.sessionStatus}
      data-sheriff-candidate={seat.sheriffCandidate}
      data-side={side}
      data-tone={(seat.seat - 1) % 6}
    >
      <div className="aw-player-avatar" aria-hidden>
        <span className="aw-player-avatar__ring" />
        <span className="aw-player-avatar__core">{initial}</span>
        <span className="aw-player-avatar__seat">{seat.seat}</span>
      </div>
      <div className="aw-player-card__copy">
        <div className="aw-player-card__name-row">
          <strong>{seat.name}</strong>
          {seat.sheriff ? (
            <Crown
              className="aw-player-crown"
              data-flip-id="sheriff-crown"
              size={16}
              weight="fill"
              aria-label={getCopy('roles.sheriff')}
            />
          ) : null}
          {seat.sheriffCandidate ? (
            <span className="aw-sheriff-candidate" aria-label={getCopy('match.sheriffCandidate')}>
              <HandPalm size={13} weight="fill" aria-hidden />
              {getCopy('match.sheriffCandidate')}
            </span>
          ) : null}
          {!seat.alive ? <Skull size={15} aria-label={getCopy('match.eliminated')} /> : null}
        </div>
        <RoleBadge
          className="aw-player-card__role"
          label={seat.roleName ?? getCopy('match.roleHidden')}
          roleId={seat.roleId}
        />
        <span className="aw-player-card__status">
          <span className="aw-player-card__status-mark" aria-hidden />
          {statusLabel}
        </span>
      </div>
      <span className="aw-player-card__model" title={seat.model ?? undefined}>
        {formatCopy(getCopy('match.playerModel'), {
          model: seat.model ?? getCopy('match.modelUnavailable'),
        })}
      </span>
    </article>
  )
}
