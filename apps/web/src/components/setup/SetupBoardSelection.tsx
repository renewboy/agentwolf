import { GameIcon } from '../GameIcon.js'
import type { RefObject } from 'react'
import { Link } from 'react-router-dom'
import { formatCopy, getCopy } from '@agentwolf/assets'
import type { BoardSummary } from '@agentwolf/contracts'
import { gameArt } from '../../game-art.js'
import { RoleBadge } from '../RoleBadge.js'

export function SetupBoardSelection({
  board,
  boards,
  playerCount,
  playerCounts,
  headingRef,
  onPlayerCount,
  onBoardChange,
}: {
  readonly board: BoardSummary
  readonly boards: readonly BoardSummary[]
  readonly playerCount: number
  readonly playerCounts: readonly number[]
  readonly headingRef: RefObject<HTMLHeadingElement | null>
  readonly onPlayerCount: (count: number) => void
  readonly onBoardChange: (id: string) => void
}) {
  return (
    <section className="aw-setup-board-stage" aria-labelledby="setup-board-heading">
      <div className="aw-setup-section-heading">
        <div>
          <h2 id="setup-board-heading" ref={headingRef} tabIndex={-1}>
            {getCopy('tableDesign.selectBoard')}
          </h2>
          <p>{getCopy('setup.playerCount')}</p>
        </div>
        <Link className="aw-button aw-button--icon" to="/boards">
          {getCopy('setup.manageBoards')}
          <GameIcon name="forward" size={16} />
        </Link>
      </div>
      <div className="aw-setup-counts" role="group" aria-label={getCopy('setup.playerCount')}>
        {playerCounts.map((count) => (
          <button
            className="aw-choice aw-choice--count"
            aria-label={formatCopy(getCopy('setup.playerCountOption'), { count })}
            aria-pressed={count === playerCount}
            key={count}
            type="button"
            onClick={() => onPlayerCount(count)}
          >
            <span className="aw-choice__number" aria-hidden>
              {count}
            </span>
            <span className="aw-choice__unit" aria-hidden>
              {getCopy('tableDesign.seatUnit')}
            </span>
          </button>
        ))}
      </div>
      <div className="aw-setup-board-grid">
        {boards.map((entry) => (
          <button
            className="aw-board-option aw-panel aw-panel--compact aw-choice aw-choice--board"
            data-selected={entry.id === board.id}
            aria-pressed={entry.id === board.id}
            key={entry.id}
            type="button"
            onClick={() => onBoardChange(entry.id)}
          >
            <span className="aw-board-option__art" aria-hidden>
              <img src={gameArt.cardBack} alt="" />
              <span>{String(entry.playerCount).padStart(2, '0')}</span>
            </span>
            <span className="aw-board-option__body">
              <span className="aw-board-option__title">
                <strong className="aw-choice__label">{entry.name}</strong>
                {entry.source === 'custom' ? <em>{getCopy('setup.customBoard')}</em> : null}
              </span>
              <span className="aw-board-option__description aw-choice__description">
                {entry.description}
              </span>
              <small className="aw-choice__meta">
                {formatCopy(getCopy('setup.boardCardSummary'), {
                  players: entry.playerCount,
                  cards: entry.cardCount,
                  reserves: entry.reserveCount,
                })}
              </small>
              <span className="aw-board-option__roles">
                {entry.roles.map((role) => (
                  <RoleBadge
                    key={role.roleId}
                    label={formatCopy(getCopy('setup.roleCount'), {
                      role: role.name,
                      count: role.count,
                    })}
                    roleId={role.roleId}
                  />
                ))}
              </span>
            </span>
            <span className="aw-board-option__check aw-choice__indicator" aria-hidden>
              {entry.id === board.id ? <GameIcon name="check" size={16} /> : null}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
