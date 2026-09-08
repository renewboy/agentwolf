import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

interface NoticeLayout {
  readonly minimized: boolean
  readonly position: { readonly x: number; readonly y: number } | null
}

const storageKey = 'agentwolf.speech-notice-layout'
const margin = 16

export function useSpeechNoticeLayout(visible: boolean) {
  const [layout, setLayout] = useState(readLayout)
  const [dragging, setDragging] = useState(false)
  const panel = useRef<HTMLElement>(null)
  const latest = useRef(layout)
  const drag = useRef<{ id: number; offsetX: number; offsetY: number } | null>(null)

  const update = (next: NoticeLayout, save: boolean) => {
    latest.current = next
    setLayout(next)
    if (panel.current && next.position) applyPosition(panel.current, next.position)
    if (save) saveLayout(next)
  }
  const move = (x: number, y: number, save: boolean) => {
    const bounds = panel.current?.getBoundingClientRect()
    if (!bounds) return
    const position = {
      x: Math.max(margin, Math.min(x, window.innerWidth - bounds.width - margin)),
      y: Math.max(margin, Math.min(y, window.innerHeight - bounds.height - margin)),
    }
    update({ ...latest.current, position }, save)
  }

  useLayoutEffect(() => {
    const element = panel.current
    if (!element) return undefined
    const contain = () => {
      const position = latest.current.position
      if (!position) return
      const bounds = element.getBoundingClientRect()
      const next = {
        x: Math.max(margin, Math.min(position.x, window.innerWidth - bounds.width - margin)),
        y: Math.max(margin, Math.min(position.y, window.innerHeight - bounds.height - margin)),
      }
      applyPosition(element, next)
      if (next.x === position.x && next.y === position.y) return
      const value = { ...latest.current, position: next }
      latest.current = value
      setLayout(value)
      saveLayout(value)
    }
    contain()
    const observer = new ResizeObserver(contain)
    observer.observe(element)
    window.addEventListener('resize', contain)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', contain)
    }
  }, [visible, layout.minimized])

  const finish = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== event.pointerId) return
    drag.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    saveLayout(latest.current)
  }

  return {
    panel,
    minimized: layout.minimized,
    dragging,
    toggle: () => update({ ...latest.current, minimized: !latest.current.minimized }, true),
    handle: {
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0 || drag.current) return
        const bounds = panel.current!.getBoundingClientRect()
        drag.current = {
          id: event.pointerId,
          offsetX: event.clientX - bounds.x,
          offsetY: event.clientY - bounds.y,
        }
        event.currentTarget.setPointerCapture(event.pointerId)
        setDragging(true)
      },
      onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
        const current = drag.current
        if (current?.id !== event.pointerId) return
        move(event.clientX - current.offsetX, event.clientY - current.offsetY, false)
      },
      onPointerUp: finish,
      onPointerCancel: finish,
      onLostPointerCapture: finish,
      onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
        const directions: Record<string, readonly [number, number]> = {
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
        }
        const direction = directions[event.key]
        if (!direction) return
        event.preventDefault()
        const bounds = panel.current!.getBoundingClientRect()
        const step = event.shiftKey ? 1 : 16
        move(bounds.x + direction[0] * step, bounds.y + direction[1] * step, true)
      },
    },
  }
}

function applyPosition(
  element: HTMLElement,
  position: { readonly x: number; readonly y: number },
): void {
  element.style.left = `${position.x}px`
  element.style.top = `${position.y}px`
  element.style.right = 'auto'
  element.style.bottom = 'auto'
}

function readLayout(): NoticeLayout {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as NoticeLayout | null
    const position = stored?.position
    return {
      minimized: stored?.minimized === true,
      position:
        position && Number.isFinite(position.x) && Number.isFinite(position.y) ? position : null,
    }
  } catch {
    return { minimized: false, position: null }
  }
}

function saveLayout(layout: NoticeLayout): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(layout))
  } catch {
    /* The current page still retains the user's layout. */
  }
}
