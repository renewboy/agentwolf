import { CrosshairSimple, ShieldWarning, X } from '@phosphor-icons/react'
import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { formatCopy, getCopy } from '@agentwolf/assets'
import type {
  SeatView,
  TrajectoryAuditIssue,
  TrajectoryAuditReport,
  TrajectoryTurn,
} from '@agentwolf/contracts'
import { ModalDialog } from '../ModalDialog.js'

export function TrajectoryAuditOrb({
  audit,
  turns,
  seats,
  onLocate,
}: {
  readonly audit: TrajectoryAuditReport | null
  readonly turns: readonly TrajectoryTurn[]
  readonly seats: readonly SeatView[]
  readonly onLocate: (issue: TrajectoryAuditIssue) => void
}) {
  const [open, setOpen] = useState(false)
  const orbRef = useRef<HTMLButtonElement>(null)
  const dragRef = useRef<{
    readonly pointerId: number
    readonly startX: number
    readonly startY: number
    readonly originX: number
    readonly originY: number
    moved: boolean
  } | null>(null)
  const suppressClick = useRef(false)

  useLayoutEffect(() => {
    const orb = orbRef.current
    if (!orb) return undefined
    const saved = readOrbPosition()
    if (saved) applyOrbPosition(orb, saved.x, saved.y)
    const onResize = (): void => {
      if (orb.style.left && orb.style.top) {
        const current = orb.getBoundingClientRect()
        const next = clampOrbPosition(current.x, current.y, current.width, current.height)
        applyOrbPosition(orb, next.x, next.y)
        saveOrbPosition(next)
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [audit?.issues.length])

  if (!audit || audit.issues.length === 0) return null
  const badge = audit.issues.length > 99 ? '99+' : String(audit.issues.length)

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) return
    const bounds = event.currentTarget.getBoundingClientRect()
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: bounds.x,
      originY: bounds.y,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const deltaX = event.clientX - drag.startX
    const deltaY = event.clientY - drag.startY
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 4) return
    drag.moved = true
    const bounds = event.currentTarget.getBoundingClientRect()
    const next = clampOrbPosition(
      drag.originX + deltaX,
      drag.originY + deltaY,
      bounds.width,
      bounds.height,
    )
    applyOrbPosition(event.currentTarget, next.x, next.y)
  }

  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragRef.current = null
    if (!drag.moved) return
    suppressClick.current = true
    const bounds = event.currentTarget.getBoundingClientRect()
    const position = clampOrbPosition(bounds.x, bounds.y, bounds.width, bounds.height)
    applyOrbPosition(event.currentTarget, position.x, position.y)
    saveOrbPosition(position)
  }

  return (
    <>
      <button
        ref={orbRef}
        className="aw-trajectory-audit-orb"
        aria-label={formatCopy(getCopy('trajectory.auditOrbLabel'), {
          count: audit.issues.length,
        })}
        type="button"
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false
            return
          }
          setOpen(true)
        }}
        onPointerCancel={finishDrag}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
      >
        <ShieldWarning size={21} weight="fill" aria-hidden />
        <b aria-hidden>{badge}</b>
      </button>
      <ModalDialog
        className="aw-audit-dialog"
        labelledBy="trajectory-audit-dialog-title"
        open={open}
        onClose={() => setOpen(false)}
      >
        <div className="aw-audit-dialog__header">
          <div>
            <h2 id="trajectory-audit-dialog-title">{getCopy('trajectory.auditDialogTitle')}</h2>
            <p>
              {formatCopy(getCopy('trajectory.auditSummary'), {
                turns: audit.auditedTurns,
                issues: audit.issues.length,
              })}
            </p>
          </div>
          <button
            className="aw-button aw-button--square"
            aria-label={getCopy('common.close')}
            data-dialog-action
            type="button"
            onClick={() => setOpen(false)}
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <ol className="aw-audit-dialog__issues">
          {audit.issues.map((issue) => {
            const turn = turns.find((candidate) => candidate.turnId === issue.turnId) ?? null
            const seat = turn
              ? (seats.find((candidate) => candidate.playerId === turn.ownerId) ?? null)
              : null
            return (
              <li key={`${issue.turnId}:${issue.code}:${issue.detail}`}>
                <div className="aw-audit-dialog__issue-heading">
                  <div>
                    <code>{issue.code}</code>
                    <strong>{auditIssueOwner(turn, seat)}</strong>
                    <span>{issue.turnId}</span>
                  </div>
                  {turn ? (
                    <button
                      className="aw-button"
                      data-dialog-action
                      type="button"
                      onClick={() => {
                        setOpen(false)
                        onLocate(issue)
                      }}
                    >
                      <CrosshairSimple size={15} aria-hidden />
                      {getCopy('trajectory.locateAuditIssue')}
                    </button>
                  ) : null}
                </div>
                <pre>{issue.detail}</pre>
              </li>
            )
          })}
        </ol>
      </ModalDialog>
    </>
  )
}

function auditIssueOwner(turn: TrajectoryTurn | null, seat: SeatView | null): string {
  if (!turn) return getCopy('trajectory.auditIssueOwnerUnknown')
  if (!seat) {
    return formatCopy(getCopy('trajectory.auditIssueCall'), { call: turn.ordinal })
  }
  return formatCopy(getCopy('trajectory.auditIssueOwner'), {
    seat: seat.seat,
    player: seat.name,
    call: turn.ordinal,
  })
}

const orbPositionKey = 'agentwolf.trajectory-audit-orb-position'
const orbMargin = 10

function clampOrbPosition(
  x: number,
  y: number,
  width: number,
  height: number,
): { readonly x: number; readonly y: number } {
  return {
    x: Math.min(Math.max(orbMargin, x), Math.max(orbMargin, window.innerWidth - width - orbMargin)),
    y: Math.min(
      Math.max(orbMargin, y),
      Math.max(orbMargin, window.innerHeight - height - orbMargin),
    ),
  }
}

function applyOrbPosition(orb: HTMLButtonElement, x: number, y: number): void {
  const bounds = orb.getBoundingClientRect()
  const next = clampOrbPosition(x, y, bounds.width, bounds.height)
  orb.style.left = `${next.x}px`
  orb.style.top = `${next.y}px`
  orb.style.right = 'auto'
  orb.style.bottom = 'auto'
}

function readOrbPosition(): { readonly x: number; readonly y: number } | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(orbPositionKey) ?? 'null') as unknown
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'x' in parsed &&
      'y' in parsed &&
      typeof parsed.x === 'number' &&
      typeof parsed.y === 'number'
    ) {
      return { x: parsed.x, y: parsed.y }
    }
  } catch {
    return null
  }
  return null
}

function saveOrbPosition(position: { readonly x: number; readonly y: number }): void {
  try {
    window.localStorage.setItem(orbPositionKey, JSON.stringify(position))
  } catch {
    return
  }
}
