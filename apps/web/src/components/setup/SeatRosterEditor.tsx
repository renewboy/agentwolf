import { GameIcon } from '../GameIcon.js'
import { useMemo, useState } from 'react'
import { formatCopy, getCopy } from '@agentwolf/assets'
import type { AgentProfile, CharacterCard, CharacterId, RoleId } from '@agentwolf/contracts'
import { characterPortraitUrl } from '../../character-portraits.js'
import { gameArt } from '../../game-art.js'
import { GameSelect, type GameSelectOption } from '../GameSelect.js'

export interface SeatDraft {
  readonly seat: number
  readonly name: string
  readonly profileId: AgentProfile['id'] | ''
  readonly roleId: RoleId
  readonly characterId: CharacterId | null
}

export function SeatRosterEditor({
  seats,
  profiles,
  characters,
  roleOptions,
  manualRoles,
  duplicatedNames,
  onChange,
  onCharacterChange,
  onRoleChange,
  onReroll,
  onRerollAll,
  onApplyProfile,
}: {
  readonly seats: readonly SeatDraft[]
  readonly profiles: readonly AgentProfile[]
  readonly characters: readonly CharacterCard[]
  readonly roleOptions: readonly GameSelectOption<RoleId>[]
  readonly manualRoles: boolean
  readonly duplicatedNames: ReadonlySet<string>
  readonly onChange: (seat: number, update: Partial<Pick<SeatDraft, 'name' | 'profileId'>>) => void
  readonly onCharacterChange: (seat: number, characterId: CharacterId | null) => void
  readonly onRoleChange: (seat: number, roleId: RoleId) => void
  readonly onReroll: (seat: number) => void
  readonly onRerollAll: () => void
  readonly onApplyProfile: (profileId: AgentProfile['id']) => void
}) {
  const [batchProfile, setBatchProfile] = useState<AgentProfile['id'] | ''>(profiles[0]?.id ?? '')
  const [applied, setApplied] = useState(false)
  const profileOptions = useMemo(
    () =>
      profiles.map((profile) => ({
        value: profile.id,
        label: `${profile.name} · ${profile.model}`,
      })),
    [profiles],
  )
  const characterOptions = useMemo(
    () => [
      { value: 'none', label: getCopy('setup.noCharacter') },
      ...characters.map((character) => ({
        value: character.id,
        label: `${character.name} · ${character.universe}`,
      })),
    ],
    [characters],
  )

  return (
    <div className="aw-setup-roster">
      <div className="aw-setup-roster__tools">
        <div className="aw-setup-batch">
          <label className="aw-field">
            <span className="aw-field__label">{getCopy('tableDesign.batchProfile')}</span>
            <GameSelect
              ariaLabel={getCopy('tableDesign.batchProfile')}
              value={batchProfile}
              options={profileOptions}
              onChange={(value) => {
                setBatchProfile(value)
                setApplied(false)
              }}
            />
          </label>
          <button
            className="aw-button"
            type="button"
            disabled={!batchProfile}
            onClick={() => {
              if (!batchProfile) return
              onApplyProfile(batchProfile)
              setApplied(true)
            }}
          >
            {applied ? <GameIcon name="check" size={17} /> : null}
            {getCopy('tableDesign.batchApply')}
          </button>
          <span className="aw-setup-batch__status" role="status">
            {applied ? getCopy('tableDesign.batchApplied') : ''}
          </span>
        </div>
        <button className="aw-button aw-button--icon" type="button" onClick={onRerollAll}>
          <GameIcon name="shuffle" size={18} />
          {getCopy('setup.rerollAll')}
        </button>
      </div>
      <div className="aw-seat-config-list">
        {seats.map((seat) => {
          const character = characters.find((entry) => entry.id === seat.characterId)
          const duplicated = duplicatedNames.has(seat.name.trim())
          return (
            <article
              className="aw-panel aw-panel--unframed aw-seat-config"
              data-duplicate-name={duplicated}
              key={seat.seat}
            >
              <header className="aw-seat-config__heading aw-panel aw-panel--rule">
                <span className="aw-seat-config__number" aria-hidden>
                  {String(seat.seat).padStart(2, '0')}
                </span>
                <h3>{formatCopy(getCopy('setup.seat'), { seat: seat.seat })}</h3>
                <span className="aw-portrait-frame aw-seat-config__portrait">
                  {character ? (
                    <img src={characterPortraitUrl(character.portraitAssetId)} alt="" />
                  ) : (
                    <img src={gameArt.defaultPlayer} alt="" />
                  )}
                </span>
              </header>
              <label className="aw-field">
                <span className="aw-field__label">{getCopy('setup.playerName')}</span>
                <div className="aw-inline-field">
                  <input
                    className="aw-input"
                    value={seat.name}
                    aria-invalid={duplicated || !seat.name.trim()}
                    onChange={(event) => onChange(seat.seat, { name: event.target.value })}
                  />
                  <button
                    className="aw-button aw-button--square"
                    aria-label={getCopy('setup.reroll')}
                    type="button"
                    onClick={() => onReroll(seat.seat)}
                  >
                    <GameIcon name="shuffle" size={18} />
                  </button>
                </div>
                {duplicated ? (
                  <small className="aw-field__hint aw-field__hint--error">
                    {getCopy('setup.duplicateName')}
                  </small>
                ) : null}
              </label>
              <label className="aw-field">
                <span className="aw-field__label">{getCopy('setup.agentProfile')}</span>
                <GameSelect
                  ariaLabel={getCopy('setup.agentProfile')}
                  value={seat.profileId}
                  options={profileOptions}
                  onChange={(profileId) => {
                    onChange(seat.seat, { profileId })
                    setApplied(false)
                  }}
                />
              </label>
              <label className="aw-field">
                <span className="aw-field__label">{getCopy('setup.character')}</span>
                <GameSelect
                  ariaLabel={getCopy('setup.character')}
                  options={characterOptions}
                  value={seat.characterId ?? 'none'}
                  onChange={(value) =>
                    onCharacterChange(
                      seat.seat,
                      characters.find((entry) => entry.id === value)?.id ?? null,
                    )
                  }
                />
              </label>
              {manualRoles ? (
                <label className="aw-field aw-seat-config__role aw-panel aw-panel--rule-top">
                  <span className="aw-field__label">{getCopy('setup.role')}</span>
                  <GameSelect
                    ariaLabel={getCopy('setup.role')}
                    value={seat.roleId}
                    options={roleOptions}
                    onChange={(roleId) => onRoleChange(seat.seat, roleId)}
                  />
                </label>
              ) : null}
            </article>
          )
        })}
      </div>
    </div>
  )
}
