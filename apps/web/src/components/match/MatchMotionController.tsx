import { useLayoutEffect, useRef, type RefObject } from 'react'
import type { MatchView } from '@agentwolf/contracts'
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
  presenceState,
  phaseId,
  lastSequence,
  sheriffId,
  sessionStateKey,
}: {
  readonly scope: RefObject<HTMLElement | null>
  readonly presenceState: MatchPresenceState
  readonly phaseId: string
  readonly lastSequence: number
  readonly sheriffId: string | null
  readonly sessionStateKey: string
}) {
  const flipState = useRef<ReturnType<typeof Flip.getState> | null>(null)
  const previousSheriffId = useRef<string | null>(sheriffId)

  useGSAP(() => {
    const root = scope.current ?? document.querySelector<HTMLElement>('.aw-match-shell')
    if (!root) return undefined
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    const select = gsap.utils.selector(root)
    const ambient = gsap.timeline({ repeat: -1, yoyo: true })
    ambient
      .to(select('.aw-lunar-field__glow'), {
        xPercent: 5,
        yPercent: 2,
        scale: 1.08,
        opacity: 0.7,
        duration: 7,
        ease: 'sine.inOut',
      })
      .to(
        select('.aw-lunar-field__haze'),
        { xPercent: -4, opacity: 0.55, duration: 9, ease: 'sine.inOut' },
        0,
      )
    const onVisibility = (): void => {
      if (document.hidden) ambient.pause()
      else ambient.resume()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, {})

  useGSAP(
    () => {
      const root = scope.current ?? document.querySelector<HTMLElement>('.aw-match-shell')
      if (!root) return undefined
      const select = gsap.utils.selector(root)
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const orbs = select('.aw-presence__orb')
      const signals = select('.aw-presence__signal')
      const waveBars = select('.aw-presence__wave > span')
      const playerRings = select('.aw-player-avatar__ring')
      const thinkingRings = select(
        '.aw-player-card[data-session="thinking"] .aw-player-avatar__ring',
      )
      const continuousMotionTargets = [...orbs, ...signals, ...waveBars, ...playerRings]
      gsap.killTweensOf(continuousMotionTargets)
      gsap.set(continuousMotionTargets, { clearProps: 'transform,opacity' })
      if (reduce) {
        return undefined
      }

      if (
        presenceState === 'thinking' ||
        presenceState === 'starting' ||
        presenceState === 'reconnecting' ||
        presenceState === 'recovering-agents'
      ) {
        gsap.to(orbs, {
          rotate: 360,
          duration: presenceState === 'thinking' ? 2.8 : 5.2,
          repeat: -1,
          ease: 'none',
        })
      }
      if (
        presenceState === 'thinking' ||
        presenceState === 'awaiting-actions' ||
        presenceState === 'starting' ||
        presenceState === 'reconnecting' ||
        presenceState === 'recovering-agents'
      ) {
        gsap.to(signals, {
          scaleX: 1,
          opacity: 0.92,
          duration: 1.25,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
        })
      }
      if (presenceState === 'thinking' && thinkingRings.length > 0) {
        gsap.to(thinkingRings, {
          rotate: 360,
          duration: 2.2,
          repeat: -1,
          ease: 'none',
        })
      }
      if (presenceState === 'streaming' || presenceState === 'narrating') {
        gsap.to(waveBars, {
          scaleY: (_index) => gsap.utils.random(0.45, 1.35),
          duration: 0.34,
          stagger: 0.08,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
        })
      }
      return undefined
    },
    { dependencies: [presenceState, sessionStateKey] },
  )

  useGSAP(
    () => {
      const root = scope.current ?? document.querySelector<HTMLElement>('.aw-match-shell')
      if (!root) return
      if (!phaseId || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      const titles = root.querySelectorAll('.aw-phase-title')
      if (titles.length === 0) return
      gsap.fromTo(
        titles,
        { y: -8, opacity: 0.35 },
        { y: 0, opacity: 1, duration: 0.48, ease: 'power3.out' },
      )
    },
    { dependencies: [phaseId] },
  )

  useGSAP(
    () => {
      const root = scope.current ?? document.querySelector<HTMLElement>('.aw-match-shell')
      if (!root) return
      if (!lastSequence || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      const items = root.querySelectorAll(`.aw-feed-item[data-sequence="${lastSequence}"]`)
      if (items.length === 0) return
      gsap.fromTo(
        items,
        { y: 16, opacity: 0.15, scale: 0.985 },
        { y: 0, opacity: 1, scale: 1, duration: 0.42, ease: 'power3.out' },
      )
    },
    { dependencies: [lastSequence] },
  )

  useLayoutEffect(() => {
    const scopeElement = scope.current
    if (
      flipState.current &&
      previousSheriffId.current !== sheriffId &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
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
  }, [scope, sheriffId])

  return null
}
