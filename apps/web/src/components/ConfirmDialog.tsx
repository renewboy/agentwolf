import { WarningCircle } from '@phosphor-icons/react'
import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { getCopy } from '@agentwolf/assets'

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  readonly open: boolean
  readonly title: string
  readonly description: string
  readonly confirmLabel: string
  readonly busy?: boolean
  readonly onConfirm: () => void
  readonly onCancel: () => void
}) {
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return undefined
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const root = document.getElementById('root')
    if (root) root.inert = true
    const frame = window.requestAnimationFrame(() => cancelRef.current?.focus())
    return () => {
      window.cancelAnimationFrame(frame)
      if (root) root.inert = false
      previousFocus?.focus()
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      className="aw-dialog-layer"
      onPointerDown={(event) => {
        if (!busy && event.target === event.currentTarget) onCancel()
      }}
    >
      <div
        ref={panelRef}
        className="aw-confirm-dialog"
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        role="alertdialog"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !busy) {
            event.preventDefault()
            onCancel()
            return
          }
          if (event.key !== 'Tab') return
          const controls = panelRef.current?.querySelectorAll<HTMLElement>('[data-dialog-action]')
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
        <div className="aw-confirm-dialog__icon" aria-hidden>
          <WarningCircle size={28} weight="duotone" />
        </div>
        <div className="aw-confirm-dialog__copy">
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId}>{description}</p>
        </div>
        <div className="aw-confirm-dialog__actions">
          <button
            ref={cancelRef}
            className="aw-button"
            data-dialog-action
            disabled={busy}
            type="button"
            onClick={onCancel}
          >
            {getCopy('common.cancel')}
          </button>
          <button
            className="aw-button aw-button--danger aw-button--danger-solid"
            data-dialog-action
            disabled={busy}
            type="button"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
