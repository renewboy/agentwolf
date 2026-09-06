import { useEffect } from 'react'
import { gameCursorArt } from '../game-art.js'

export function useGameCursor(): void {
  useEffect(() => {
    for (const source of Object.values(gameCursorArt)) {
      const image = new Image()
      image.src = source
    }
    const root = document.documentElement
    const reset = () => {
      delete root.dataset['awCursor']
    }
    const press = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button === 0) {
        root.dataset['awCursor'] = 'pressed'
      }
    }
    window.addEventListener('pointerdown', press, true)
    window.addEventListener('pointerup', reset, true)
    window.addEventListener('pointercancel', reset, true)
    window.addEventListener('blur', reset)
    window.addEventListener('dragend', reset)
    document.addEventListener('visibilitychange', reset)
    return () => {
      reset()
      window.removeEventListener('pointerdown', press, true)
      window.removeEventListener('pointerup', reset, true)
      window.removeEventListener('pointercancel', reset, true)
      window.removeEventListener('blur', reset)
      window.removeEventListener('dragend', reset)
      document.removeEventListener('visibilitychange', reset)
    }
  }, [])
}
