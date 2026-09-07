import { useLayoutEffect, useRef, type RefObject } from 'react'
import type { MatchView, RoleEffectMode } from '@agentwolf/contracts'
import type { LiveConnectionState } from '../../hooks/useLiveMatch.js'
import { Flip, gsap, useGSAP } from '../../motion/gsap.js'

export type MatchPresenceState =
  | 'initial-loading'
  | 'starting'
  | 'thinking'
  | 'awaiting-actions'
  | 'streaming'
  | 'narrating'
  | 'resolving'
  | 'reconnecting'
  | 'recovering-agents'
  | 'switching-view'
  | 'paused'
  | 'ended'

export function deriveMatchPresenceState(
  match: MatchView | null,
  connectionState: LiveConnectionState,
  viewPending: boolean,
  narrationActive: boolean,
): MatchPresenceState {
  if (!match) return 'initial-loading'
  if (viewPending) return 'switching-view'
  const postgameActive =
    match.postgameReview && !['completed', 'skipped'].includes(match.postgameReview.state)
  if (match.postgameReview?.state === 'paused') return 'paused'
  if (match.status === 'ended' && !postgameActive) return 'ended'
  if (connectionState !== 'live') return 'reconnecting'
  if (match.status === 'starting') return 'starting'
  if (match.status === 'paused') return 'paused'
  if (narrationActive) return 'narrating'
  if (
    match.seats.some(
      (seat) =>
        seat.sessionStatus === 'starting' ||
        seat.sessionStatus === 'syncing' ||
        seat.sessionStatus === 'failed',
    )
  ) {
    return 'recovering-agents'
  }
  if (match.activeSpeech && !match.activeSpeech.final) return 'streaming'
  if (postgameActive && match.seats.some((seat) => seat.sessionStatus === 'thinking')) {
    return 'thinking'
  }
  if (postgameActive) return 'awaiting-actions'
  if (match.phaseId.includes('resolve') || match.phaseId.includes('announcement')) {
    return 'resolving'
  }
  if (match.seats.some((seat) => seat.sessionStatus === 'thinking')) {
    return match.phaseId.includes('vote') ? 'awaiting-actions' : 'thinking'
  }
  return 'awaiting-actions'
}

export function MatchMotionController({
  scope,
  phaseId,
  lastSequence,
  sheriffId,
  mode = 'full',
  suspended = false,
}: {
  readonly scope: RefObject<HTMLElement | null>
  readonly phaseId: string
  readonly lastSequence: number
  readonly sheriffId: string | null
  readonly mode?: RoleEffectMode
  readonly suspended?: boolean
}) {
  const flipState = useRef<ReturnType<typeof Flip.getState> | null>(null)
  const previousSheriffId = useRef<string | null>(sheriffId)
  const seenPhase = useRef<string | null>(null)
  const seenSequence = useRef<number | null>(null)

  useGSAP(
    () => {
      if (seenPhase.current === phaseId) return
      seenPhase.current = phaseId
      const root = scope.current ?? document.querySelector<HTMLElement>('.aw-match-shell')
      if (!root) return
      if (!phaseId || suspended || mode !== 'full') return
      const titles = root.querySelectorAll('.aw-phase-title')
      if (titles.length === 0) return
      gsap.fromTo(
        titles,
        { y: -8, opacity: 0.35 },
        { y: 0, opacity: 1, duration: 0.48, ease: 'power3.out' },
      )
    },
    { dependencies: [phaseId, mode, suspended], revertOnUpdate: true },
  )

  useGSAP(
    () => {
      if (seenSequence.current === lastSequence) return
      seenSequence.current = lastSequence
      const root = scope.current ?? document.querySelector<HTMLElement>('.aw-match-shell')
      if (!root) return
      if (!lastSequence || suspended || mode !== 'full') return
      const items = root.querySelectorAll(`.aw-feed-item[data-sequence="${lastSequence}"]`)
      if (items.length === 0) return
      gsap.fromTo(
        items,
        { y: 16, opacity: 0.15, scale: 0.985 },
        { y: 0, opacity: 1, scale: 1, duration: 0.42, ease: 'power3.out' },
      )
    },
    { dependencies: [lastSequence, mode, suspended], revertOnUpdate: true },
  )

  useLayoutEffect(() => {
    const scopeElement = scope.current ?? document.querySelector<HTMLElement>('.aw-match-shell')
    if (
      flipState.current &&
      previousSheriffId.current !== sheriffId &&
      mode === 'full' &&
      !suspended
    ) {
      Flip.from(flipState.current, {
        duration: 0.58,
        ease: 'power3.inOut',
        absolute: true,
      })
    }
    previousSheriffId.current = sheriffId
    return () => {
      if (scopeElement) {
        flipState.current = Flip.getState(scopeElement.querySelectorAll('.aw-player-crown'))
      }
    }
  }, [scope, sheriffId, mode, suspended])

  return null
}
