import { GameIcon } from '../components/GameIcon.js'
import { useCallback, useEffect, useState } from 'react'
import { getCopy } from '@agentwolf/assets'
import {
  CharacterCardInputSchema,
  type CharacterCard,
  type CharacterId,
  type CharacterPortraitAssetId,
} from '@agentwolf/contracts'
import { api } from '../api.js'
import { characterPortraitUrl, normalizeCharacterPortrait } from '../character-portraits.js'
import { ErrorState, LoadingState } from '../components/AsyncState.js'
import { ConfirmDialog } from '../components/ConfirmDialog.js'
import { FormField } from '../components/FormField.js'
import { CharacterOverview } from '../components/catalog/CharacterOverview.js'

interface CharacterDraft {
  readonly id: CharacterId | null
  readonly editable: boolean
  readonly name: string
  readonly universe: string
  readonly summary: string
  readonly personality: string
  readonly socialStyle: string
  readonly reasoningPresentation: string
  readonly speechStyle: string
  readonly boundaries: string
  readonly portraitAssetId: CharacterPortraitAssetId | ''
}

export function CollectionPage() {
  const [characters, setCharacters] = useState<CharacterCard[] | null>(null)
  const [draft, setDraft] = useState<CharacterDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editing, setEditing] = useState(false)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setError(null)
    try {
      const next = await api.listCharacters()
      setCharacters(next)
      setDraft((current) => {
        const selected = current?.id ? next.find((entry) => entry.id === current.id) : null
        return selected ? cardToDraft(selected) : (current ?? cardToDraft(next[0]!))
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  useEffect(() => void load(), [load])

  const save = async (): Promise<void> => {
    if (!draft?.portraitAssetId) {
      setError(getCopy('characterLibrary.portraitRequired'))
      return
    }
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const input = CharacterCardInputSchema.parse({
        name: draft.name,
        universe: draft.universe,
        summary: draft.summary,
        personality: lines(draft.personality),
        socialStyle: draft.socialStyle,
        reasoningPresentation: draft.reasoningPresentation,
        speechStyle: draft.speechStyle,
        boundaries: lines(draft.boundaries),
        portraitAssetId: draft.portraitAssetId,
      })
      const saved = draft.id
        ? await api.updateCharacter(draft.id, input)
        : await api.createCharacter(input)
      const next = await api.listCharacters()
      setCharacters(next)
      setDraft(cardToDraft(saved))
      setEditing(false)
      setNotice(getCopy('characterLibrary.saved'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  const copyCharacter = async (): Promise<void> => {
    if (!draft?.id) return
    setSaving(true)
    setError(null)
    try {
      const copied = await api.copyCharacter(draft.id)
      setCharacters(await api.listCharacters())
      setDraft(cardToDraft(copied))
      setEditing(true)
      setNotice(getCopy('characterLibrary.copied'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  const deleteCharacter = async (): Promise<void> => {
    if (!draft?.id) return
    setSaving(true)
    setError(null)
    try {
      await api.deleteCharacter(draft.id)
      const next = await api.listCharacters()
      setCharacters(next)
      setDraft(cardToDraft(next[0]!))
      setEditing(false)
      setConfirmDelete(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  const uploadPortrait = async (file: File): Promise<void> => {
    setUploading(true)
    setError(null)
    try {
      const asset = await api.uploadCharacterPortrait({
        dataUrl: await normalizeCharacterPortrait(file),
      })
      setDraft((current) => (current ? { ...current, portraitAssetId: asset.id } : current))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setUploading(false)
    }
  }

  if (error && !characters) return <ErrorState message={error} retry={() => void load()} />
  if (!characters || !draft) return <LoadingState />

  const disabled = !draft.editable || saving || uploading
  const selectedCharacter = characters.find((character) => character.id === draft.id)
  const visibleCharacters = characters.filter((character) =>
    `${character.name} ${character.universe}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  )
  const cancelEdit = (): void => {
    setDraft(cardToDraft(selectedCharacter ?? characters[0]!))
    setEditing(false)
    setError(null)
  }
  return (
    <main className="aw-page aw-collection-page">
      <div className="aw-page-heading">
        <h1>{getCopy('characterLibrary.title')}</h1>
        <p>{getCopy('characterLibrary.subtitle')}</p>
      </div>
      <div className="aw-character-library">
        <aside className="aw-character-gallery">
          <div className="aw-panel-heading">
            <h2>{getCopy('configDesign.catalog.characters')}</h2>
            <button
              className="aw-button aw-button--icon"
              type="button"
              onClick={() => {
                setDraft(emptyDraft())
                setEditing(true)
                setNotice(null)
                setError(null)
              }}
            >
              <GameIcon name="plus" size={18} />
              {getCopy('characterLibrary.create')}
            </button>
          </div>
          <input
            className="aw-input aw-character-search"
            aria-label={getCopy('configDesign.characters.search')}
            placeholder={getCopy('configDesign.characters.search')}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="aw-character-grid">
            {visibleCharacters.map((character) => (
              <button
                className="aw-character-card aw-choice aw-choice--portrait"
                data-selected={draft.id === character.id}
                aria-pressed={draft.id === character.id}
                key={character.id}
                type="button"
                onClick={() => {
                  setDraft(cardToDraft(character))
                  setEditing(false)
                  setNotice(null)
                  setError(null)
                }}
              >
                <img
                  className="aw-choice__art"
                  src={characterPortraitUrl(character.portraitAssetId)}
                  alt=""
                />
                <span>
                  <strong className="aw-choice__label">{character.name}</strong>
                  <small className="aw-choice__meta">{character.universe}</small>
                </span>
              </button>
            ))}
          </div>
          {visibleCharacters.length === 0 ? (
            <p className="aw-catalog-note">{getCopy('configDesign.characters.noResults')}</p>
          ) : null}
        </aside>

        <section className="aw-catalog-detail aw-character-detail">
          {!editing && selectedCharacter ? (
            <>
              <CharacterOverview
                character={selectedCharacter}
                busy={saving}
                onEdit={() => setEditing(true)}
                onCopy={() => void copyCharacter()}
                onDelete={() => setConfirmDelete(true)}
              />
              {notice ? <p className="aw-form-message aw-form-message--success">{notice}</p> : null}
              {error ? <p className="aw-form-message aw-form-message--error">{error}</p> : null}
            </>
          ) : (
            <div className="aw-catalog-editor">
              <header className="aw-catalog-editor__heading">
                <h2>
                  {getCopy(draft.id ? 'configDesign.characters.edit' : 'characterLibrary.create')}
                </h2>
                <p>{getCopy('configDesign.characters.editHint')}</p>
              </header>
              <p className="aw-character-ability-note">{getCopy('characterLibrary.fullAbility')}</p>
              <div className="aw-character-editor__portrait">
                <div className="aw-character-portrait-preview">
                  {draft.portraitAssetId ? (
                    <img
                      className="aw-character-portrait-preview__image"
                      src={characterPortraitUrl(draft.portraitAssetId)}
                      alt={draft.name || getCopy('characterLibrary.portrait')}
                    />
                  ) : (
                    <GameIcon name="pawn" size={78} />
                  )}
                </div>
                {draft.editable ? (
                  <label className="aw-button aw-button--icon aw-character-upload">
                    <GameIcon name="upload" size={18} />
                    {getCopy(
                      uploading ? 'characterLibrary.uploading' : 'characterLibrary.portraitUpload',
                    )}
                    <input
                      accept="image/png,image/jpeg,image/webp"
                      disabled={uploading}
                      type="file"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (file) void uploadPortrait(file)
                        event.target.value = ''
                      }}
                    />
                  </label>
                ) : null}
                <small>{getCopy('characterLibrary.portraitHint')}</small>
              </div>
              <div className="aw-editor-grid">
                <FormField label={getCopy('characterLibrary.name')}>
                  <input
                    className="aw-input"
                    disabled={disabled}
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  />
                </FormField>
                <FormField label={getCopy('characterLibrary.universe')}>
                  <input
                    className="aw-input"
                    disabled={disabled}
                    value={draft.universe}
                    onChange={(event) => setDraft({ ...draft, universe: event.target.value })}
                  />
                </FormField>
                <FormField label={getCopy('characterLibrary.summary')} wide>
                  <textarea
                    className="aw-textarea"
                    disabled={disabled}
                    value={draft.summary}
                    onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
                  />
                </FormField>
                <FormField
                  label={getCopy('characterLibrary.personality')}
                  hint={getCopy('characterLibrary.personalityHint')}
                >
                  <textarea
                    className="aw-textarea"
                    disabled={disabled}
                    value={draft.personality}
                    onChange={(event) => setDraft({ ...draft, personality: event.target.value })}
                  />
                </FormField>
                <FormField label={getCopy('characterLibrary.socialStyle')}>
                  <textarea
                    className="aw-textarea"
                    disabled={disabled}
                    value={draft.socialStyle}
                    onChange={(event) => setDraft({ ...draft, socialStyle: event.target.value })}
                  />
                </FormField>
                <FormField
                  label={getCopy('characterLibrary.reasoningPresentation')}
                  hint={getCopy('characterLibrary.reasoningHint')}
                >
                  <textarea
                    className="aw-textarea"
                    disabled={disabled}
                    value={draft.reasoningPresentation}
                    onChange={(event) =>
                      setDraft({ ...draft, reasoningPresentation: event.target.value })
                    }
                  />
                </FormField>
                <FormField label={getCopy('characterLibrary.speechStyle')}>
                  <textarea
                    className="aw-textarea"
                    disabled={disabled}
                    value={draft.speechStyle}
                    onChange={(event) => setDraft({ ...draft, speechStyle: event.target.value })}
                  />
                </FormField>
                <FormField
                  label={getCopy('characterLibrary.boundaries')}
                  hint={getCopy('characterLibrary.boundariesHint')}
                >
                  <textarea
                    className="aw-textarea"
                    disabled={disabled}
                    value={draft.boundaries}
                    onChange={(event) => setDraft({ ...draft, boundaries: event.target.value })}
                  />
                </FormField>
              </div>
              {notice ? <p className="aw-form-message aw-form-message--success">{notice}</p> : null}
              {error ? <p className="aw-form-message aw-form-message--error">{error}</p> : null}
              <div className="aw-form-actions aw-panel__footer">
                <button
                  className="aw-button"
                  disabled={disabled}
                  type="button"
                  onClick={cancelEdit}
                >
                  {getCopy('configDesign.catalog.cancelEdit')}
                </button>
                <button
                  className="aw-button aw-button--primary"
                  disabled={disabled}
                  type="button"
                  onClick={() => void save()}
                >
                  {getCopy('characterLibrary.save')}
                </button>
                {draft.editable && draft.id ? (
                  <button
                    className="aw-button aw-button--danger"
                    disabled={saving}
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <GameIcon name="trash" size={18} />
                    {getCopy('characterLibrary.delete')}
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </section>
      </div>
      <ConfirmDialog
        busy={saving}
        confirmLabel={getCopy('characterLibrary.delete')}
        description={getCopy('characterLibrary.deleteConfirm')}
        open={confirmDelete}
        title={getCopy('characterLibrary.deleteTitle')}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void deleteCharacter()}
      />
    </main>
  )
}

function lines(value: string): string[] {
  return value
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function cardToDraft(character: CharacterCard): CharacterDraft {
  return {
    id: character.id,
    editable: character.editable,
    name: character.name,
    universe: character.universe,
    summary: character.summary,
    personality: character.personality.join('\n'),
    socialStyle: character.socialStyle,
    reasoningPresentation: character.reasoningPresentation,
    speechStyle: character.speechStyle,
    boundaries: character.boundaries.join('\n'),
    portraitAssetId: character.portraitAssetId,
  }
}

function emptyDraft(): CharacterDraft {
  return {
    id: null,
    editable: true,
    name: '',
    universe: '',
    summary: getCopy('characterLibrary.emptySummary'),
    personality: '',
    socialStyle: '',
    reasoningPresentation: '',
    speechStyle: '',
    boundaries: getCopy('characterLibrary.fullAbility'),
    portraitAssetId: '',
  }
}
