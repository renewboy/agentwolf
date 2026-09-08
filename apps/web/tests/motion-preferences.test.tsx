import { act, renderHook } from '@testing-library/react'
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoleEffectMode } from '@agentwolf/contracts'
import { useRoleEffectMode } from '../src/hooks/useRoleEffectMode.js'
import { useMotionEnvironment } from '../src/hooks/useMotionEnvironment.js'

const { renderToString } = createRequire(import.meta.url)(
  'react-dom/server',
) as typeof import('react-dom/server')

const storageKey = 'agentwolf.role-effect-mode'
let reduced = false
let media: EventTarget
let removeMedia: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  reduced = false
  media = new EventTarget()
  removeMedia = vi.spyOn(media, 'removeEventListener')
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      get matches() {
        return reduced
      },
      addEventListener: media.addEventListener.bind(media),
      removeEventListener: media.removeEventListener.bind(media),
    })),
  )
})

function changeMedia(next: boolean) {
  act(() => {
    reduced = next
    media.dispatchEvent(new Event('change'))
  })
}

describe('motion preferences', () => {
  it('uses the system default until a valid saved preference is set, and synchronizes hook consumers', () => {
    window.localStorage.setItem(storageKey, 'invalid')
    const first = renderHook(useRoleEffectMode)
    const second = renderHook(useRoleEffectMode)
    expect(first.result.current[0]).toBe('full')
    changeMedia(true)
    expect(first.result.current[0]).toBe('reduced')
    act(() => first.result.current[1]('off'))
    expect(window.localStorage.getItem(storageKey)).toBe('off')
    expect(second.result.current[0]).toBe('off')
    changeMedia(false)
    expect(first.result.current[0]).toBe('off')
  })

  it('reacts only to relevant storage changes and unsubscribes on unmount', () => {
    const removeWindow = vi.spyOn(window, 'removeEventListener')
    const hook = renderHook(useRoleEffectMode)
    act(() => {
      window.localStorage.setItem(storageKey, 'off')
      window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' }))
    })
    expect(hook.result.current[0]).toBe('full')
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: storageKey }))
    })
    expect(hook.result.current[0]).toBe('off')
    act(() => {
      window.localStorage.clear()
      window.dispatchEvent(new StorageEvent('storage', { key: null }))
    })
    expect(hook.result.current[0]).toBe('full')
    hook.unmount()
    expect(removeWindow).toHaveBeenCalledWith('storage', expect.any(Function))
    expect(removeWindow).toHaveBeenCalledWith('agentwolf:role-effect-mode', expect.any(Function))
    expect(removeMedia).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('uses reduced motion for server rendering independently of browser preference', () => {
    window.localStorage.setItem(storageKey, 'full')
    function Probe() {
      const [mode] = useRoleEffectMode()
      const environment = useMotionEnvironment(mode)
      return <span>{`${mode}:${environment.mode}:${environment.hidden}`}</span>
    }
    expect(renderToString(<Probe />)).toContain('reduced:reduced:false')
  })
})

describe('motion environment', () => {
  it('honors reduced-motion, explicit modes, and document suspension while removing listeners', () => {
    let hidden = false
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
    const removeDocument = vi.spyOn(document, 'removeEventListener')
    const hook = renderHook(({ mode }: { mode: RoleEffectMode }) => useMotionEnvironment(mode), {
      initialProps: { mode: 'full' as RoleEffectMode },
    })
    expect(hook.result.current).toEqual({ mode: 'full', hidden: false })
    changeMedia(true)
    expect(hook.result.current).toEqual({ mode: 'reduced', hidden: false })
    hook.rerender({ mode: 'off' })
    expect(hook.result.current.mode).toBe('off')
    changeMedia(false)
    hook.rerender({ mode: 'reduced' })
    expect(hook.result.current.mode).toBe('reduced')
    act(() => {
      hidden = true
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(hook.result.current).toEqual({ mode: 'reduced', hidden: true })
    act(() => {
      hidden = false
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(hook.result.current.hidden).toBe(false)
    hook.unmount()
    expect(removeDocument).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    expect(removeMedia).toHaveBeenCalledWith('change', expect.any(Function))
  })
})
