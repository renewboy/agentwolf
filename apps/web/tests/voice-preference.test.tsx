import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useVoicePreference, voicePreferenceStorageKey } from '../src/hooks/useVoicePreference.js'

beforeEach(() => window.localStorage.clear())

describe('useVoicePreference', () => {
  it('defaults missing and invalid values to disabled and persists explicit choices', () => {
    window.localStorage.setItem(voicePreferenceStorageKey, 'invalid')
    const { result } = renderHook(() => useVoicePreference())
    expect(result.current[0]).toBe(false)
    act(() => result.current[1](true))
    expect(result.current[0]).toBe(true)
    expect(window.localStorage.getItem(voicePreferenceStorageKey)).toBe('true')
  })

  it('loads the browser preference and follows changes from another tab', () => {
    window.localStorage.setItem(voicePreferenceStorageKey, 'true')
    const { result } = renderHook(() => useVoicePreference())
    expect(result.current[0]).toBe(true)
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'unrelated',
          newValue: 'false',
        }),
      )
    })
    expect(result.current[0]).toBe(true)
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: voicePreferenceStorageKey,
          newValue: 'false',
        }),
      )
    })
    expect(result.current[0]).toBe(false)
  })

  it('keeps an in-memory preference when browser storage is unavailable', () => {
    const getItem = vi.spyOn(window.localStorage, 'getItem').mockImplementationOnce(() => {
      throw new Error('storage read failed')
    })
    const setItem = vi.spyOn(window.localStorage, 'setItem').mockImplementationOnce(() => {
      throw new Error('storage write failed')
    })
    const { result } = renderHook(() => useVoicePreference())
    expect(result.current[0]).toBe(false)
    expect(() => act(() => result.current[1](true))).not.toThrow()
    expect(result.current[0]).toBe(true)
    getItem.mockRestore()
    setItem.mockRestore()
  })
})
