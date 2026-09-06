import { formatCopy, getCopy } from '@agentwolf/assets'
import type {
  AgentProfileId,
  BoardId,
  BoardVictory,
  CharacterCard,
  CharacterId,
  RoleId,
  RoleSummary,
} from '@agentwolf/contracts'
import { FormField } from '../FormField.js'
import { GameSelect, type GameSelectOption } from '../GameSelect.js'
import { GameIcon } from '../GameIcon.js'
import { RoleBadge } from '../RoleBadge.js'
import { characterPortraitUrl } from '../../character-portraits.js'

export interface BoardDraft {
  readonly id: BoardId | null
  readonly name: string
  readonly description: string
  readonly roles: Readonly<Record<string, number>>
  readonly reserveCount: number
  readonly characters: readonly (CharacterId | null)[]
  readonly agentProfiles: readonly (AgentProfileId | null)[]
  readonly sheriff: boolean
  readonly victory: BoardVictory
  readonly editable: boolean
}

const boardSeats = Array.from({ length: 24 }, (_, index) => index + 1)

export function BoardEditor({
  draft,
  roles,
  characters,
  profileOptions,
  characterOptions,
  cardCount,
  playerCount,
  busy,
  error,
  notice,
  onChange,
  onRoleChange,
  onReserveChange,
  onCancel,
  onSave,
  onDelete,
}: {
  readonly draft: BoardDraft
  readonly roles: readonly RoleSummary[]
  readonly characters: readonly CharacterCard[]
  readonly profileOptions: readonly GameSelectOption<AgentProfileId | 'none'>[]
  readonly characterOptions: readonly GameSelectOption<CharacterId | 'none'>[]
  readonly cardCount: number
  readonly playerCount: number
  readonly busy: boolean
  readonly error: string | null
  readonly notice: string | null
  readonly onChange: (draft: BoardDraft) => void
  readonly onRoleChange: (roleId: RoleId, delta: number) => void
  readonly onReserveChange: (delta: number) => void
  readonly onCancel: () => void
  readonly onSave: () => void
  readonly onDelete: () => void
}) {
  return (
    <div className="aw-catalog-editor aw-board-editor">
      <div className="aw-catalog-scroll">
        <header className="aw-catalog-editor__heading">
          <h2>{getCopy(draft.id ? 'configDesign.catalog.editBoard' : 'boardManagement.create')}</h2>
          <p>{getCopy('configDesign.catalog.editHint')}</p>
        </header>
        <div className="aw-editor-grid">
          <FormField label={getCopy('boardManagement.name')}>
            <input
              className="aw-input"
              disabled={!draft.editable}
              value={draft.name}
              onChange={(event) => onChange({ ...draft, name: event.target.value })}
            />
          </FormField>
          <FormField label={getCopy('boardManagement.description')} wide>
            <textarea
              className="aw-textarea"
              disabled={!draft.editable}
              value={draft.description}
              onChange={(event) => onChange({ ...draft, description: event.target.value })}
            />
          </FormField>
        </div>

        <div className="aw-board-role-editor">
          <div className="aw-panel-heading">
            <h3>{getCopy('boardManagement.roles')}</h3>
            <strong>
              {formatCopy(getCopy('boardManagement.cardAndPlayerCount'), {
                cards: cardCount,
                players: playerCount,
              })}
            </strong>
          </div>
          <div className="aw-board-role-grid">
            {roles.map((role) => (
              <div className="aw-board-role-row aw-panel aw-panel--compact" key={role.id}>
                <span>
                  <RoleBadge label={role.name} roleId={role.id} />
                  <small>
                    {getCopy(
                      role.faction === 'werewolf'
                        ? 'boardManagement.werewolfFaction'
                        : 'boardManagement.goodFaction',
                    )}
                  </small>
                </span>
                <div className="aw-counter">
                  <button
                    className="aw-button aw-button--square"
                    aria-label={formatCopy(getCopy('boardManagement.decrease'), {
                      role: role.name,
                    })}
                    disabled={!draft.editable || (draft.roles[role.id] ?? 0) === 0}
                    type="button"
                    onClick={() => onRoleChange(role.id, -1)}
                  >
                    <GameIcon name="minus" size={16} />
                  </button>
                  <output>{draft.roles[role.id] ?? 0}</output>
                  <button
                    className="aw-button aw-button--square"
                    aria-label={formatCopy(getCopy('boardManagement.increase'), {
                      role: role.name,
                    })}
                    disabled={!draft.editable || playerCount >= 24 || cardCount >= 26}
                    type="button"
                    onClick={() => onRoleChange(role.id, 1)}
                  >
                    <GameIcon name="plus" size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="aw-board-reserve-counter">
            <span>
              <strong>{getCopy('boardManagement.reserveCards')}</strong>
              <small>{getCopy('boardManagement.reserveCardsHint')}</small>
            </span>
            <div className="aw-counter">
              <button
                className="aw-button aw-button--square"
                aria-label={getCopy('boardManagement.decreaseReserve')}
                disabled={!draft.editable || draft.reserveCount === 0}
                type="button"
                onClick={() => onReserveChange(-1)}
              >
                <GameIcon name="minus" size={16} />
              </button>
              <output>{draft.reserveCount}</output>
              <button
                className="aw-button aw-button--square"
                aria-label={getCopy('boardManagement.increaseReserve')}
                disabled={!draft.editable || draft.reserveCount === 2 || playerCount <= 6}
                type="button"
                onClick={() => onReserveChange(1)}
              >
                <GameIcon name="plus" size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="aw-board-character-editor">
          <div className="aw-panel-heading">
            <span>
              <h3>{getCopy('boardManagement.characters')}</h3>
              <small>{getCopy('boardManagement.charactersHint')}</small>
            </span>
          </div>
          <div className="aw-board-character-grid">
            {boardSeats.slice(0, draft.characters.length).map((seat) => {
              const characterId = draft.characters[seat - 1] ?? null
              const profileId = draft.agentProfiles[seat - 1] ?? null
              const character = characters.find((entry) => entry.id === characterId) ?? null
              return (
                <div className="aw-board-character-slot aw-panel aw-panel--compact" key={seat}>
                  {character ? (
                    <img src={characterPortraitUrl(character.portraitAssetId)} alt="" />
                  ) : (
                    <span className="aw-board-character-slot__empty" aria-hidden />
                  )}
                  <div className="aw-board-seat-defaults">
                    <GameSelect
                      density="compact"
                      ariaLabel={formatCopy(getCopy('boardManagement.agentSeat'), { seat })}
                      disabled={!draft.editable}
                      options={profileOptions}
                      value={profileId ?? 'none'}
                      onChange={(value) =>
                        onChange({
                          ...draft,
                          agentProfiles: draft.agentProfiles.map((entry, seatIndex) =>
                            seatIndex === seat - 1 ? (value === 'none' ? null : value) : entry,
                          ),
                        })
                      }
                    />
                    <GameSelect
                      density="compact"
                      ariaLabel={formatCopy(getCopy('boardManagement.characterSeat'), {
                        seat,
                      })}
                      disabled={!draft.editable}
                      options={characterOptions}
                      value={characterId ?? 'none'}
                      onChange={(value) =>
                        onChange({
                          ...draft,
                          characters: draft.characters.map((entry, seatIndex) =>
                            seatIndex === seat - 1 ? (value === 'none' ? null : value) : entry,
                          ),
                        })
                      }
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="aw-board-rules">
          <button
            className="aw-rule-toggle"
            aria-checked={draft.sheriff}
            disabled={!draft.editable}
            role="switch"
            type="button"
            onClick={() => onChange({ ...draft, sheriff: !draft.sheriff })}
          >
            <span>
              <strong>{getCopy('boardManagement.sheriff')}</strong>
              <small>{getCopy('boardManagement.sheriffHint')}</small>
            </span>
            <i aria-hidden />
          </button>
          <div>
            <strong>{getCopy('boardManagement.victory')}</strong>
            <div className="aw-segmented aw-board-victory">
              {(['slaughter-all', 'slaughter-edge'] as const).map((victory) => (
                <button
                  className="aw-segmented__item aw-choice"
                  aria-pressed={draft.victory === victory}
                  disabled={!draft.editable}
                  key={victory}
                  type="button"
                  onClick={() => onChange({ ...draft, victory })}
                >
                  {getCopy(
                    victory === 'slaughter-all'
                      ? 'boardManagement.slaughterAll'
                      : 'boardManagement.slaughterEdge',
                  )}
                </button>
              ))}
            </div>
            <small>
              {getCopy(
                draft.victory === 'slaughter-all'
                  ? 'boardManagement.slaughterAllHint'
                  : 'boardManagement.slaughterEdgeHint',
              )}
            </small>
          </div>
        </div>
      </div>
      <footer className="aw-editor-actions aw-panel__footer">
        {error ? <p className="aw-form-message aw-form-message--error">{error}</p> : null}
        {notice ? <p className="aw-form-message aw-form-message--success">{notice}</p> : null}

        <button className="aw-button" disabled={busy} type="button" onClick={onCancel}>
          {getCopy('configDesign.catalog.cancelEdit')}
        </button>
        <button
          className="aw-button aw-button--primary"
          disabled={busy || !draft.name.trim() || playerCount < 6 || playerCount > 24}
          type="button"
          onClick={onSave}
        >
          {getCopy('boardManagement.save')}
        </button>
        <button
          className="aw-button aw-button--danger"
          disabled={busy || !draft.editable || !draft.id}
          type="button"
          onClick={onDelete}
        >
          <GameIcon name="trash" size={18} />
          {getCopy('boardManagement.delete')}
        </button>
      </footer>
    </div>
  )
}
