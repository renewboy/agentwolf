import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

export function ModalDialog({
  open,
  busy = false,
  role = 'dialog',
  className,
  labelledBy,
  describedBy,
  initialFocusRef,
  children,
  onClose,
}: {
  readonly open: boolean
  readonly busy?: boolean
  readonly role?: 'dialog' | 'alertdialog'
  readonly className: string
  readonly labelledBy: string
  readonly describedBy?: string
  readonly initialFocusRef?: RefObject<HTMLElement | null>
  readonly children: ReactNode
  readonly onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return undefined
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const root = document.getElementById('root')
    if (root) root.inert = true
    const frame = window.requestAnimationFrame(() => {
      const fallback = panelRef.current?.querySelector<HTMLElement>(
        '[data-dialog-action]:not([disabled])',
      )
      ;(initialFocusRef?.current ?? fallback ?? panelRef.current)?.focus()
    })
    return () => {
      window.cancelAnimationFrame(frame)
      if (root) root.inert = false
      previousFocus?.focus()
    }
  }, [initialFocusRef, open])

  if (!open) return null

  return createPortal(
    <div
      className="aw-dialog-layer"
      onPointerDown={(event) => {
        if (!busy && event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        className={className}
        aria-describedby={describedBy}
        aria-labelledby={labelledBy}
        aria-modal="true"
        role={role}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !busy) {
            event.preventDefault()
            onClose()
            return
          }
          if (event.key !== 'Tab') return
          const controls = panelRef.current?.querySelectorAll<HTMLElement>(
            '[data-dialog-action]:not([disabled])',
          )
          if (!controls || controls.length === 0) return
          const first = controls[0]!
          const last = controls[controls.length - 1]!
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first.focus()
          }
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
