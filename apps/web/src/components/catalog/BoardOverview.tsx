import { GameIcon } from '../GameIcon.js'
import { Link } from 'react-router-dom'
import { formatCopy, getCopy } from '@agentwolf/assets'
import type { AgentProfile, BoardSummary, CharacterCard } from '@agentwolf/contracts'
import { RoleBadge } from '../RoleBadge.js'
import { characterPortraitUrl } from '../../character-portraits.js'
import { gameArt } from '../../game-art.js'

export function BoardOverview({
  board,
  characters,
  profiles,
  busy,
  onEdit,
  onClone,
  onDelete,
}: {
  readonly board: BoardSummary
  readonly characters: readonly CharacterCard[]
  readonly profiles: readonly AgentProfile[]
  readonly busy: boolean
  readonly onEdit: () => void
  readonly onClone: () => void
  readonly onDelete: () => void
}) {
  const configuredSeats = board.characters.filter(
    (seat) =>
      seat.characterId ||
      board.agentProfiles.some((agent) => agent.seat === seat.seat && agent.profileId),
  )
  return (
    <article className="aw-board-overview">
      <div className="aw-catalog-scroll" key={board.id}>
        <header className="aw-board-overview__heading">
          <div>
            <span className="aw-catalog-origin">
              {getCopy(
                board.editable ? 'configDesign.catalog.custom' : 'configDesign.catalog.builtIn',
              )}
            </span>
            <h2>{board.name}</h2>
            <p>{board.description}</p>
          </div>
          <img className="aw-board-overview__art" src={gameArt.cardBack} alt="" />
        </header>
        <dl className="aw-board-facts">
          <div>
            <dt>{getCopy('configDesign.catalog.players')}</dt>
            <dd>{board.playerCount}</dd>
          </div>
          <div>
            <dt>{getCopy('configDesign.catalog.cards')}</dt>
            <dd>{board.cardCount}</dd>
          </div>
          <div>
            <dt>{getCopy('configDesign.catalog.reserves')}</dt>
            <dd>{board.reserveCount}</dd>
          </div>
        </dl>
        <section
          className="aw-board-composition"
          aria-label={getCopy('configDesign.catalog.composition')}
        >
          <h3>{getCopy('configDesign.catalog.composition')}</h3>
          <div className="aw-board-composition__cards">
            {board.roles.map((role) => (
              <div className="aw-board-role-card aw-panel aw-panel--compact" key={role.roleId}>
                <RoleBadge label={role.name} roleId={role.roleId} />
                <span
                  className="aw-board-role-card__count"
                  aria-label={formatCopy(getCopy('setup.roleCount'), {
                    role: role.name,
                    count: role.count,
                  })}
                >
                  × <strong>{role.count}</strong>
                </span>
              </div>
            ))}
          </div>
        </section>
        <section
          className="aw-board-rule-summary"
          aria-label={getCopy('configDesign.catalog.rules')}
        >
          <h3>{getCopy('configDesign.catalog.rules')}</h3>
          <div>
            <span>
              {getCopy(
                board.sheriff
                  ? 'configDesign.catalog.sheriffOn'
                  : 'configDesign.catalog.sheriffOff',
              )}
            </span>
            <span>
              {getCopy(
                board.victory === 'slaughter-all'
                  ? 'boardManagement.slaughterAll'
                  : 'boardManagement.slaughterEdge',
              )}
            </span>
          </div>
          <p>
            {getCopy(
              board.victory === 'slaughter-all'
                ? 'boardManagement.slaughterAllHint'
                : 'boardManagement.slaughterEdgeHint',
            )}
          </p>
        </section>
        {configuredSeats.length > 0 ? (
          <section className="aw-board-defaults">
            <h3>{getCopy('configDesign.catalog.defaults')}</h3>
            <div className="aw-board-defaults__list">
              {configuredSeats.map((seat) => {
                const character = characters.find((entry) => entry.id === seat.characterId)
                const profileId = board.agentProfiles.find(
                  (entry) => entry.seat === seat.seat,
                )?.profileId
                const profile = profiles.find((entry) => entry.id === profileId)
                return (
                  <div className="aw-board-default-player" key={seat.seat}>
                    <b>{String(seat.seat).padStart(2, '0')}</b>
                    {character ? (
                      <img src={characterPortraitUrl(character.portraitAssetId)} alt="" />
                    ) : null}
                    <span>
                      <strong>{character?.name ?? getCopy('setup.noCharacter')}</strong>
                      <small>{profile?.name ?? getCopy('boardManagement.noDefaultAgent')}</small>
                    </span>
                  </div>
                )
              })}
            </div>
          </section>
        ) : null}
        {!board.editable ? (
          <p className="aw-catalog-note">{getCopy('boardManagement.readOnly')}</p>
        ) : null}
      </div>
      <footer className="aw-catalog-actions aw-panel__footer">
        <Link className="aw-button aw-button--primary" to={`/matches/new?board=${board.id}`}>
          {getCopy('configDesign.catalog.useBoard')}
        </Link>
        <button
          className="aw-button"
          disabled={busy}
          type="button"
          onClick={board.editable ? onEdit : onClone}
        >
          {board.editable ? <GameIcon name="edit" size={17} /> : <GameIcon name="copy" size={17} />}
          {getCopy(board.editable ? 'configDesign.catalog.editBoard' : 'boardManagement.clone')}
        </button>
        {board.editable ? (
          <button
            className="aw-button aw-button--danger"
            disabled={busy}
            type="button"
            onClick={onDelete}
          >
            <GameIcon name="trash" size={17} />
            {getCopy('boardManagement.delete')}
          </button>
        ) : null}
      </footer>
    </article>
  )
}
