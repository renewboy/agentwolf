import { useSyncExternalStore } from 'react'
import type { RoleEffectMode } from '@agentwolf/contracts'

const query = '(prefers-reduced-motion: reduce)'

function subscribe(notify: () => void): () => void {
  const media = window.matchMedia(query)
  media.addEventListener('change', notify)
  document.addEventListener('visibilitychange', notify)
  return () => {
    media.removeEventListener('change', notify)
    document.removeEventListener('visibilitychange', notify)
  }
}

function snapshot(): 'hidden' | 'reduced' | 'full' {
  if (document.hidden) return 'hidden'
  return window.matchMedia(query).matches ? 'reduced' : 'full'
}

export function useMotionEnvironment(mode: RoleEffectMode): {
  readonly mode: RoleEffectMode
  readonly hidden: boolean
} {
  const environment = useSyncExternalStore(subscribe, snapshot, () => 'reduced' as const)
  return {
    mode: mode === 'full' && environment === 'reduced' ? 'reduced' : mode,
    hidden: environment === 'hidden',
  }
}
