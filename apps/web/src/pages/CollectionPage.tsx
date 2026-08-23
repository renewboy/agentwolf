import { Copy, Plus, Trash, UploadSimple, UserCircle } from '@phosphor-icons/react'
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
  return (
    <main className="aw-page">
      <div className="aw-page-heading">
        <h1>{getCopy('characterLibrary.title')}</h1>
        <p>{getCopy('characterLibrary.subtitle')}</p>
      </div>
      <div className="aw-settings-layout aw-character-library">
        <aside className="aw-agent-list aw-panel">
          <div className="aw-panel-heading">
            <h2>{getCopy('characterLibrary.title')}</h2>
            <button
              className="aw-button aw-button--icon"
              type="button"
              onClick={() => {
                setDraft(emptyDraft())
                setNotice(null)
                setError(null)
              }}
            >
              <Plus size={18} aria-hidden />
              {getCopy('characterLibrary.create')}
            </button>
          </div>
          <div className="aw-character-grid">
            {characters.map((character) => (
              <button
                className="aw-character-card"
                data-selected={draft.id === character.id}
                key={character.id}
                type="button"
                onClick={() => {
                  setDraft(cardToDraft(character))
                  setNotice(null)
                  setError(null)
                }}
              >
                <img src={characterPortraitUrl(character.portraitAssetId)} alt="" />
                <span>
                  <strong>{character.name}</strong>
                  <small>{character.universe}</small>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="aw-agent-editor aw-panel">
          {!draft.editable ? (
            <p className="aw-form-message">{getCopy('characterLibrary.readOnly')}</p>
          ) : null}
          <p className="aw-character-ability-note">{getCopy('characterLibrary.fullAbility')}</p>
          <div className="aw-character-editor__portrait">
            {draft.portraitAssetId ? (
              <img
                src={characterPortraitUrl(draft.portraitAssetId)}
                alt={draft.name || getCopy('characterLibrary.portrait')}
              />
            ) : (
              <UserCircle size={78} aria-hidden />
            )}
            {draft.editable ? (
              <label className="aw-button aw-button--icon aw-character-upload">
                <UploadSimple size={18} aria-hidden />
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
          <div className="aw-form-actions">
            {draft.editable ? (
              <button
                className="aw-button aw-button--primary"
                disabled={disabled}
                type="button"
                onClick={() => void save()}
              >
                {getCopy('characterLibrary.save')}
              </button>
            ) : (
              <button
                className="aw-button aw-button--primary"
                disabled={saving}
                type="button"
                onClick={() => void copyCharacter()}
              >
                <Copy size={18} aria-hidden />
                {getCopy('characterLibrary.copy')}
              </button>
            )}
            {draft.editable && draft.id ? (
              <button
                className="aw-button aw-button--danger"
                disabled={saving}
                type="button"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash size={18} aria-hidden />
                {getCopy('characterLibrary.delete')}
              </button>
            ) : null}
          </div>
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
