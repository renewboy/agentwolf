import { FloppyDisk, TextAa } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { getCopy } from '@agentwolf/assets'
import { GlobalSettingsSchema, type GlobalSettings } from '@agentwolf/contracts'
import { api } from '../api.js'
import { ErrorState, LoadingState } from '../components/AsyncState.js'

export function SettingsPage() {
  const [settings, setSettings] = useState<GlobalSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async (): Promise<void> => {
    setError(null)
    try {
      setSettings(await api.globalSettings())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const save = async (): Promise<void> => {
    if (!settings) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const parsed = GlobalSettingsSchema.parse(settings)
      setSettings(await api.updateGlobalSettings(parsed))
      setNotice(getCopy('settings.saved'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  if (error && !settings) return <ErrorState message={error} retry={() => void load()} />
  if (!settings) return <LoadingState />

  return (
    <main className="aw-page">
      <div className="aw-page-heading">
        <h1>{getCopy('settings.title')}</h1>
        <p>{getCopy('settings.description')}</p>
      </div>
      <section className="aw-global-settings aw-panel">
        <div className="aw-panel-heading">
          <div>
            <h2>{getCopy('settings.speechTitle')}</h2>
            <p>{getCopy('settings.speechDescription')}</p>
          </div>
          <TextAa size={28} aria-hidden />
        </div>
        <label className="aw-field">
          <span className="aw-field__label">{getCopy('settings.speechCharacterLimit')}</span>
          <input
            className="aw-input"
            min={50}
            max={2_000}
            step={10}
            type="number"
            value={settings.speechCharacterLimit}
            onChange={(event) =>
              setSettings({ ...settings, speechCharacterLimit: Number(event.target.value) })
            }
          />
          <span className="aw-field__hint">{getCopy('settings.speechCharacterLimitHint')}</span>
        </label>
        {error ? <p className="aw-form-message aw-form-message--error">{error}</p> : null}
        {notice ? <p className="aw-form-message aw-form-message--success">{notice}</p> : null}
        <div className="aw-editor-actions">
          <button
            className="aw-button aw-button--primary"
            disabled={busy}
            type="button"
            onClick={() => void save()}
          >
            <FloppyDisk size={18} aria-hidden />
            {getCopy(busy ? 'settings.saving' : 'settings.save')}
          </button>
        </div>
      </section>
    </main>
  )
}
