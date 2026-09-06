import { GameIcon } from '../GameIcon.js'
import { formatCopy, getCopy } from '@agentwolf/assets'
import type { BoardSummary, MatchId } from '@agentwolf/contracts'
import { Link } from 'react-router-dom'
import { gameArt } from '../../game-art.js'
import { RoleBadge } from '../RoleBadge.js'

export function SetupActionBar({
  board,
  step,
  starting,
  pendingMatchId,
  error,
  readyCount,
  onNext,
  onPrevious,
  onStart,
}: {
  readonly board: BoardSummary
  readonly step: 'board' | 'seats'
  readonly starting: boolean
  readonly pendingMatchId: MatchId | null
  readonly error: string | null
  readonly readyCount: number
  readonly onNext: () => void
  readonly onPrevious: () => void
  readonly onStart: () => void
}) {
  const ready = readyCount === board.playerCount
  return (
    <footer className="aw-setup-dock">
      <div className="aw-setup-dock__inner">
        <div className="aw-setup-dock__summary">
          <img src={gameArt.cardBack} alt="" />
          <div>
            <span>{getCopy('tableDesign.setupSummary')}</span>
            <strong>{board.name}</strong>
            <small>
              {formatCopy(getCopy('tableDesign.setupPlayers'), { count: board.playerCount })}
              {board.reserveCount > 0
                ? ` · ${formatCopy(getCopy('tableDesign.setupReserveSummary'), { count: board.reserveCount })}`
                : ''}
            </small>
          </div>
        </div>
        <div className="aw-setup-dock__roles" aria-label={getCopy('tableDesign.setupSelected')}>
          {board.roles.map((role) => (
            <RoleBadge
              key={role.roleId}
              label={formatCopy(getCopy('setup.roleCount'), {
                role: role.name,
                count: role.count,
              })}
              roleId={role.roleId}
            />
          ))}
        </div>
        <div className="aw-setup-dock__actions">
          {step === 'board' ? (
            <button className="aw-button aw-button--primary" type="button" onClick={() => onNext()}>
              {getCopy('tableDesign.setupNext')}
              <GameIcon name="forward" size={19} />
            </button>
          ) : (
            <>
              {pendingMatchId ? (
                <Link className="aw-button aw-button--icon aw-setup-previous" to="/">
                  <GameIcon name="back" size={17} />
                  {getCopy('match.backLobby')}
                </Link>
              ) : (
                <button
                  className="aw-button aw-button--icon aw-setup-previous"
                  disabled={starting}
                  type="button"
                  onClick={() => onPrevious()}
                >
                  <GameIcon name="back" size={17} />
                  {getCopy('tableDesign.setupPrevious')}
                </button>
              )}
              <button
                className="aw-button aw-button--primary aw-start-button"
                disabled={starting || !ready}
                type="button"
                onClick={() => onStart()}
              >
                {starting ? (
                  <GameIcon name="shuffle" className="aw-spin" size={19} />
                ) : (
                  <GameIcon name="play" size={19} />
                )}
                {getCopy(
                  starting
                    ? 'setup.starting'
                    : pendingMatchId
                      ? 'tableDesign.setupRetryStart'
                      : 'setup.start',
                )}
              </button>
            </>
          )}
        </div>
        {error ? (
          <p className="aw-setup-dock__error" role="alert">
            {pendingMatchId ? (
              <span>
                {getCopy('tableDesign.setupCreatedHint')}
                <br />
              </span>
            ) : null}
            {error}
          </p>
        ) : null}
        {step === 'seats' && !ready ? (
          <p className="aw-setup-dock__error" role="status">
            {formatCopy(getCopy('tableDesign.setupMissing'), {
              count: board.playerCount - readyCount,
            })}
          </p>
        ) : null}
      </div>
    </footer>
  )
}
