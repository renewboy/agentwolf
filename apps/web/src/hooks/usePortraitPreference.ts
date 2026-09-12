import { useCallback, useEffect, useState } from 'react'

export const portraitPreferenceStorageKey = 'agentwolf.portrait-enabled'

export function usePortraitPreference(): readonly [boolean, (enabled: boolean) => void] {
  const [enabled, setEnabled] = useState(() => {
    try {
      return window.localStorage.getItem(portraitPreferenceStorageKey) !== 'false'
    } catch {
      return true
    }
  })

  useEffect(() => {
    const synchronize = (event: StorageEvent): void => {
      if (event.key === portraitPreferenceStorageKey || event.key === null)
        setEnabled(event.newValue !== 'false')
    }
    window.addEventListener('storage', synchronize)
    return () => window.removeEventListener('storage', synchronize)
  }, [])

  const savePreference = useCallback((next: boolean): void => {
    setEnabled(next)
    try {
      window.localStorage.setItem(portraitPreferenceStorageKey, String(next))
    } catch {
      // The current session retains the choice when browser storage is unavailable.
    }
  }, [])

  return [enabled, savePreference]
}
