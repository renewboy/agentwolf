import { useCallback, useEffect, useState } from 'react'

export const voicePreferenceStorageKey = 'agentwolf.voice-enabled'

export function useVoicePreference(): readonly [boolean, (enabled: boolean) => void] {
  const [enabled, setEnabledState] = useState(readVoicePreference)

  useEffect(() => {
    const synchronize = (event: StorageEvent): void => {
      if (event.key === voicePreferenceStorageKey)
        setEnabledState(parseStoredPreference(event.newValue))
    }
    window.addEventListener('storage', synchronize)
    return () => window.removeEventListener('storage', synchronize)
  }, [])

  const setEnabled = useCallback((next: boolean): void => {
    setEnabledState(next)
    try {
      window.localStorage.setItem(voicePreferenceStorageKey, String(next))
    } catch {
      // The in-memory preference still applies when browser storage is unavailable.
    }
  }, [])

  return [enabled, setEnabled]
}

function readVoicePreference(): boolean {
  try {
    return parseStoredPreference(window.localStorage.getItem(voicePreferenceStorageKey))
  } catch {
    return false
  }
}

function parseStoredPreference(value: string | null): boolean {
  return value === 'true'
}
