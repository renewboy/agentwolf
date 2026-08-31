import { Dialog } from '@agent-arena/react'
import type { ReactNode, RefObject } from 'react'

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
  return (
    <Dialog
      actionSelector="[data-dialog-action]:not([disabled])"
      busy={busy}
      labelledBy={labelledBy}
      open={open}
      overlayClassName="aw-dialog-layer"
      panelClassName={className}
      role={role}
      {...(describedBy ? { describedBy } : {})}
      {...(initialFocusRef ? { initialFocusRef } : {})}
      onClose={onClose}
    >
      {children}
    </Dialog>
  )
}
