import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  portraitPreferenceStorageKey,
  usePortraitPreference,
} from '../src/hooks/usePortraitPreference.js'

describe('portrait visibility preference', () => {
  it('defaults to visible and restores both explicit choices after remounting', () => {
    window.localStorage.setItem(portraitPreferenceStorageKey, 'invalid')
    const first = renderHook(usePortraitPreference)
    expect(first.result.current[0]).toBe(true)
    act(() => first.result.current[1](false))
    expect(first.result.current[0]).toBe(false)
    expect(window.localStorage.getItem(portraitPreferenceStorageKey)).toBe('false')
    first.unmount()
    const second = renderHook(usePortraitPreference)
    expect(second.result.current[0]).toBe(false)
    act(() => second.result.current[1](true))
    expect(window.localStorage.getItem(portraitPreferenceStorageKey)).toBe('true')
    second.unmount()
    const third = renderHook(usePortraitPreference)
    expect(third.result.current[0]).toBe(true)
  })

  it('follows cross-tab changes and resets when browser preferences are cleared', () => {
    const { result } = renderHook(usePortraitPreference)
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated', newValue: 'false' }))
    })
    expect(result.current[0]).toBe(true)
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: portraitPreferenceStorageKey, newValue: 'false' }),
      )
    })
    expect(result.current[0]).toBe(false)
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: null, newValue: null }))
    })
    expect(result.current[0]).toBe(true)
  })

  it('keeps the current choice usable when local storage is unavailable', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementationOnce(() => {
      throw new Error('unavailable')
    })
    vi.spyOn(window.localStorage, 'setItem').mockImplementationOnce(() => {
      throw new Error('unavailable')
    })
    const { result } = renderHook(usePortraitPreference)
    expect(result.current[0]).toBe(true)
    expect(() => act(() => result.current[1](false))).not.toThrow()
    expect(result.current[0]).toBe(false)
  })
})
