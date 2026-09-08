import { useEffect, useState } from 'react'
import { getCopy } from '@agentwolf/assets'

const storageKey = 'agentwolf.hide-speech-fallback-notice'

export function SpeechAudioNotice({
  title,
  message,
  kind,
}: {
  readonly title: string
  readonly message: string | null
  readonly kind: 'fallback' | 'error'
}) {
  const [hidden, setHidden] = useState(() => {
    try {
      return window.localStorage.getItem(storageKey) === 'true'
    } catch {
      return false
    }
  })
  useEffect(() => {
    const update = (event: StorageEvent) => {
      if (event.key === storageKey) setHidden(event.newValue === 'true')
    }
    window.addEventListener('storage', update)
    return () => window.removeEventListener('storage', update)
  }, [])
  if (!message || (kind === 'fallback' && hidden)) return null
  const dismiss = () => {
    setHidden(true)
    try {
      window.localStorage.setItem(storageKey, 'true')
    } catch {
      /* The current page keeps the preference. */
    }
  }
  return (
    <div
      className="aw-audio-notice"
      data-kind={kind}
      role="status"
      aria-label={title}
      aria-live="polite"
    >
      <span>{message}</span>
      {kind === 'fallback' ? (
        <button type="button" className="aw-audio-notice__dismiss" onClick={dismiss}>
          {getCopy('match.audioNoticeDismiss')}
        </button>
      ) : null}
    </div>
  )
}
