import { useState } from 'react'
import { RoleEffectModeSchema, type RoleEffectMode } from '@agentwolf/contracts'

const storageKey = 'agentwolf.role-effect-mode'

export function useRoleEffectMode(): readonly [RoleEffectMode, (mode: RoleEffectMode) => void] {
  const [mode, setModeState] = useState<RoleEffectMode>(() => {
    const stored = window.localStorage.getItem(storageKey)
    const parsed = RoleEffectModeSchema.safeParse(stored)
    if (parsed.success) return parsed.data
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full'
  })
  const setMode = (next: RoleEffectMode): void => {
    setModeState(next)
    window.localStorage.setItem(storageKey, next)
  }
  return [mode, setMode]
}
