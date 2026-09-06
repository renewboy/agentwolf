import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useGameCursor } from '../src/hooks/useGameCursor.js'

function pointer(type: string, pointerType = 'mouse', button = 0): void {
  const event = new Event(type)
  Object.defineProperties(event, {
    pointerType: { value: pointerType },
    button: { value: button },
  })
  window.dispatchEvent(event)
}

describe('game cursor states', () => {
  it('uses the pressed artwork only during a primary mouse press', () => {
    renderHook(() => useGameCursor())
    pointer('pointerdown', 'touch')
    expect(document.documentElement).not.toHaveAttribute('data-aw-cursor')
    pointer('pointerdown', 'mouse', 2)
    expect(document.documentElement).not.toHaveAttribute('data-aw-cursor')
    pointer('pointerdown')
    expect(document.documentElement).toHaveAttribute('data-aw-cursor', 'pressed')
    pointer('pointerup')
    expect(document.documentElement).not.toHaveAttribute('data-aw-cursor')
  })

  it('restores the idle cursor after interruption and removes listeners on unmount', () => {
    const { unmount } = renderHook(() => useGameCursor())
    for (const interruption of ['pointercancel', 'blur', 'dragend']) {
      pointer('pointerdown')
      window.dispatchEvent(new Event(interruption))
      expect(document.documentElement).not.toHaveAttribute('data-aw-cursor')
    }
    pointer('pointerdown')
    unmount()
    expect(document.documentElement).not.toHaveAttribute('data-aw-cursor')
    pointer('pointerdown')
    expect(document.documentElement).not.toHaveAttribute('data-aw-cursor')
  })
})
