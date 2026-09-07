import { useSyncExternalStore } from 'react'
import { RoleEffectModeSchema, type RoleEffectMode } from '@agentwolf/contracts'

const storageKey = 'agentwolf.role-effect-mode'
const changeEvent = 'agentwolf:role-effect-mode'

function subscribe(notify: () => void): () => void {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)')
  const onStorage = (event: StorageEvent): void => {
    if (event.key === storageKey || event.key === null) notify()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(changeEvent, notify)
  media.addEventListener('change', notify)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(changeEvent, notify)
    media.removeEventListener('change', notify)
  }
}

function snapshot(): RoleEffectMode {
  const parsed = RoleEffectModeSchema.safeParse(window.localStorage.getItem(storageKey))
  if (parsed.success) return parsed.data
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full'
}

function setMode(mode: RoleEffectMode): void {
  window.localStorage.setItem(storageKey, mode)
  window.dispatchEvent(new Event(changeEvent))
}

export function useRoleEffectMode(): readonly [RoleEffectMode, (mode: RoleEffectMode) => void] {
  const mode = useSyncExternalStore(subscribe, snapshot, () => 'reduced' as const)
  return [mode, setMode]
}
