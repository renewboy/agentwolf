import { WarningCircle } from '@phosphor-icons/react'
import { useId, useRef } from 'react'
import { getCopy } from '@agentwolf/assets'
import { ModalDialog } from './ModalDialog.js'

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
  const cancelRef = useRef<HTMLButtonElement>(null)

  return (
    <ModalDialog
      busy={busy}
      className="aw-confirm-dialog"
      describedBy={descriptionId}
      initialFocusRef={cancelRef}
      labelledBy={titleId}
      open={open}
      role="alertdialog"
      onClose={onCancel}
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
    </ModalDialog>
  )
}
