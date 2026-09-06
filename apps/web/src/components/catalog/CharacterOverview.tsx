import { GameIcon } from '../GameIcon.js'
import { getCopy } from '@agentwolf/assets'
import type { CharacterCard } from '@agentwolf/contracts'
import { characterPortraitUrl } from '../../character-portraits.js'

export function CharacterOverview({
  character,
  busy,
  onEdit,
  onCopy,
  onDelete,
}: {
  readonly character: CharacterCard
  readonly busy: boolean
  readonly onEdit: () => void
  readonly onCopy: () => void
  readonly onDelete: () => void
}) {
  return (
    <article className="aw-character-overview">
      <header className="aw-character-overview__heading">
        <img
          className="aw-character-overview__portrait"
          src={characterPortraitUrl(character.portraitAssetId)}
          alt={character.name}
        />
        <div>
          <span className="aw-catalog-origin">{character.universe}</span>
          <h2>{character.name}</h2>
          <p>{character.summary}</p>
        </div>
      </header>
      <section
        className="aw-character-notes"
        aria-label={getCopy('configDesign.characters.profile')}
      >
        <h3>{getCopy('configDesign.characters.profile')}</h3>
        <div className="aw-character-traits">
          {character.personality.map((trait) => (
            <span key={trait}>{trait}</span>
          ))}
        </div>
        <dl>
          <div>
            <dt>{getCopy('characterLibrary.socialStyle')}</dt>
            <dd>{character.socialStyle}</dd>
          </div>
          <div>
            <dt>{getCopy('characterLibrary.reasoningPresentation')}</dt>
            <dd>{character.reasoningPresentation}</dd>
          </div>
          <div>
            <dt>{getCopy('characterLibrary.speechStyle')}</dt>
            <dd>{character.speechStyle}</dd>
          </div>
          <div>
            <dt>{getCopy('characterLibrary.boundaries')}</dt>
            <dd>{character.boundaries.join('；')}</dd>
          </div>
        </dl>
      </section>
      <p className="aw-catalog-note">{getCopy('characterLibrary.fullAbility')}</p>
      {!character.editable ? (
        <p className="aw-catalog-note">{getCopy('characterLibrary.readOnly')}</p>
      ) : null}
      <footer className="aw-catalog-actions aw-panel__footer">
        <button
          className="aw-button aw-button--primary"
          disabled={busy}
          type="button"
          onClick={character.editable ? onEdit : onCopy}
        >
          {getCopy(character.editable ? 'configDesign.characters.edit' : 'characterLibrary.copy')}
        </button>
        {character.editable ? (
          <button
            className="aw-button aw-button--danger"
            disabled={busy}
            type="button"
            onClick={onDelete}
          >
            <GameIcon name="trash" size={17} />
            {getCopy('characterLibrary.delete')}
          </button>
        ) : null}
      </footer>
    </article>
  )
}
