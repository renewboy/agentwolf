import { useCallback, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { getCopy, getRoleEffectDefinition, getRoleEffectOutcome } from '@agentwolf/assets'
import type { RoleEffectCue, RoleEffectMode } from '@agentwolf/contracts'
import { gsap, useGSAP } from '../gsap.js'
import { InkEffectGlyph } from '../../components/match/InkEffectGlyph.js'
import { effectArt } from '../effect-art.js'
import { observeEffectAnchors, type EffectAnchor } from './anchors.js'
export function RoleEffectScene({
  cue,
  mode,
  scope,
  onComplete,
}: {
  readonly cue: RoleEffectCue
  readonly mode: RoleEffectMode
  readonly scope: RefObject<HTMLElement | null>
  readonly onComplete: () => void
}) {
  const definition = getRoleEffectDefinition(cue.effectId)
  const scene = useRef<HTMLDivElement>(null)
  const caption = useRef<HTMLSpanElement>(null)
  const stamps = useRef(new Map<string, HTMLDivElement>())
  const [placement, setPlacement] = useState<{
    anchors: EffectAnchor[]
    captionHost: HTMLElement | null
  } | null>(null)
  const linked = definition.family === 'bond' || cue.effectId === 'sheriff-transferred'

  const protectedMask = useRef<SVGGElement>(null)
  const maskId = useId().replaceAll(':', '')
  const startedAt = useRef<number | null>(null)
  const completed = useRef(false)
  const finish = useCallback(() => {
    if (!completed.current) {
      completed.current = true
      onComplete()
    }
  }, [onComplete])
  const outcome = getRoleEffectOutcome(cue.effectId, cue.variant)
  const variant =
    cue.effectId === 'cupid-linked-death'
      ? 'break'
      : cue.effectId.includes('poison')
        ? 'poison'
        : definition.family === 'medicine'
          ? 'antidote'
          : cue.effectId === 'awakened-hidden-wolf-double-attack'
            ? 'double'
            : 'default'

  useLayoutEffect(() => {
    const root = scope.current
    if (!root) {
      setPlacement({ anchors: [], captionHost: null })
      return undefined
    }
    let marked: EffectAnchor[] = []
    let geometryKey = ''
    const dispose = observeEffectAnchors(
      root,
      cue,
      (anchors, captionHost) => {
        for (const anchor of marked)
          if (!anchors.some((next) => next.card === anchor.card))
            delete anchor.card.dataset['roleEffect']
        for (const anchor of anchors) anchor.card.dataset['roleEffect'] = cue.effectId
        marked = anchors
        setPlacement((previous) =>
          previous &&
          previous.captionHost === captionHost &&
          previous.anchors.length === anchors.length &&
          previous.anchors.every(
            (anchor, index) =>
              anchor.avatar === anchors[index]?.avatar &&
              anchor.identity === anchors[index]?.identity,
          )
            ? previous
            : { anchors, captionHost },
        )
      },
      ({ path, protectedRects }) => {
        scene.current?.querySelector('.aw-role-effect-link__path')?.setAttribute('d', path)
        const nextKey = JSON.stringify(protectedRects)
        const mask = protectedMask.current
        if (mask && nextKey !== geometryKey) {
          geometryKey = nextKey
          mask.replaceChildren(
            ...protectedRects.map((bounds) => {
              const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
              for (const [name, value] of Object.entries(bounds))
                rect.setAttribute(name, String(value))
              rect.setAttribute('fill', 'black')
              return rect
            }),
          )
        }
      },
    )
    return () => {
      dispose()
      for (const anchor of marked) delete anchor.card.dataset['roleEffect']
    }
  }, [cue, scope])

  useGSAP(
    () => {
      if (!placement) return undefined
      startedAt.current ??= performance.now()
      const elapsed = (performance.now() - startedAt.current) / 1000
      const duration = Math.max(0.1, definition.durationMs / 1000 - elapsed)
      const fadeDuration = Math.min(0.5, duration)
      const targets = [...stamps.current.values()]
      const glyphs = targets.flatMap((target) => [
        ...target.querySelectorAll('.aw-role-effect-imprint'),
      ])
      const dust = targets.flatMap((target) => [
        ...target.querySelectorAll('.aw-role-effect-particle'),
      ])
      const grounds = targets.flatMap((target) => [
        ...target.querySelectorAll('.aw-role-effect-ground'),
      ])
      const halos = targets.flatMap((target) => [
        ...target.querySelectorAll('.aw-role-effect-halo'),
      ])
      const timeline = gsap.timeline({ onComplete: finish })
      const visibleTargets = [...targets, ...(caption.current ? [caption.current] : [])]
      timeline.fromTo(
        visibleTargets,
        { opacity: elapsed < 0.3 ? 0 : 1 },
        { opacity: 1, duration: Math.min(0.3, duration), ease: 'power2.out' },
        0,
      )
      if (mode === 'full' && elapsed < 0.4) {
        timeline.fromTo(
          grounds,
          { opacity: 0, scale: 0.7 },
          { opacity: 1, scale: 1, duration: 0.65, ease: 'sine.out' },
          0,
        )
        timeline.fromTo(
          halos,
          { rotate: -24, opacity: 0, transformOrigin: '50% 50%' },
          { rotate: 0, opacity: 1, duration: 0.85, ease: 'power2.out' },
          0.06,
        )
        timeline.fromTo(
          glyphs,
          { scale: 1.12, rotate: -3, opacity: 0, transformOrigin: '50% 50%' },
          { scale: 1, rotate: 0, opacity: 1, duration: 0.6, ease: 'power3.out' },
          0.22,
        )
        if (definition.family === 'claw') {
          timeline.fromTo(
            targets.flatMap((target) => [
              ...target.querySelectorAll('.aw-role-effect-claws > path'),
            ]),
            { clipPath: 'inset(0 0 100% 0)' },
            { clipPath: 'inset(0 0 0% 0)', duration: 0.32, stagger: 0.09, ease: 'power2.in' },
            0.24,
          )
        }
        if (definition.family === 'medicine') {
          const spreads = targets.flatMap((target) => [
            ...target.querySelectorAll('.aw-role-effect-spread'),
          ])
          timeline.fromTo(
            spreads,
            { scale: 0.1, opacity: 0, transformOrigin: '50% 70%' },
            { scale: 1, opacity: 0.5, duration: 1.1, ease: 'power2.out' },
            0.4,
          )
          const drops = targets.flatMap((target) => [
            ...target.querySelectorAll('.aw-role-effect-drop'),
          ])
          const ripples = targets.flatMap((target) => [
            ...target.querySelectorAll('.aw-role-effect-ripples'),
          ])
          timeline.fromTo(
            drops,
            { y: -28, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.45, ease: 'power2.in' },
            0.05,
          )
          timeline.fromTo(
            ripples,
            { scale: 0.3, opacity: 0, transformOrigin: '50% 50%' },
            { scale: 1, opacity: 1, duration: 1.0, ease: 'sine.out' },
            0.42,
          )
        }
        if (definition.family === 'inspect') {
          const eclipses = targets.flatMap((target) => [
            ...target.querySelectorAll('.aw-role-effect-eclipse'),
          ])
          timeline.fromTo(
            eclipses,
            { attr: { cx: -10 } },
            { attr: { cx: 190 }, duration: 0.6, ease: 'power2.out' },
            0.12,
          )
        }
        if (definition.family === 'ward') {
          const halves = targets.flatMap((target) => [
            ...target.querySelectorAll('.aw-role-effect-ward-left, .aw-role-effect-ward-right'),
          ])
          timeline.fromTo(
            halves,
            { x: (index) => (index % 2 ? 16 : -16) },
            { x: 0, duration: 0.5, ease: 'power2.out' },
            0.18,
          )
        }
        if (definition.family === 'shot') {
          const lines = targets.flatMap((target) => [
            ...target.querySelectorAll('.aw-role-effect-shot-line'),
          ])
          timeline.fromTo(
            lines,
            { scaleX: 0, transformOrigin: '50% 50%' },
            { scaleX: 1, duration: 0.12 },
            0.3,
          )
        }
        if (variant === 'break') {
          const halves = targets.flatMap((target) => [
            ...target.querySelectorAll('.aw-role-effect-heart-left, .aw-role-effect-heart-right'),
          ])
          timeline.fromTo(
            halves,
            { x: 0 },
            { x: (index) => (index % 2 ? 12 : -12), duration: 0.75, ease: 'power2.out' },
            0.4,
          )
          const thread = scene.current?.querySelector('.aw-role-effect-link__path')
          if (thread)
            timeline.to(thread, { strokeDasharray: '3 24', opacity: 0, duration: 0.8 }, 0.45)
        }
        if (definition.family === 'reveal' || definition.family === 'cards') {
          const identities = placement.anchors.flatMap((anchor) =>
            anchor.identity ? [anchor.identity] : [],
          )
          timeline.fromTo(
            identities,
            { opacity: 0.2, clipPath: 'inset(0 0 95% 0)' },
            { opacity: 1, clipPath: 'inset(0 0 0% 0)', duration: 0.7, ease: 'power2.out' },
            0.4,
          )
          const backs = targets.flatMap((target) => [
            ...target.querySelectorAll('.aw-role-effect-card-back'),
          ])
          if (backs.length)
            timeline.fromTo(
              backs,
              { x: (index) => (index % 2 ? 12 : -12), rotate: (index) => (index % 2 ? 8 : -8) },
              { x: 0, rotate: 0, duration: 0.7, ease: 'power2.inOut' },
              0.15,
            )
        }
        timeline.fromTo(
          dust,
          { opacity: 0, scale: 0.4, x: 0, y: 0 },
          {
            opacity: 0.65,
            scale: 0.8,
            x: (index) => seededOffset(cue.cueId, index, 66),
            y: (index) => seededOffset(cue.cueId, index + 13, 62),
            duration: 1.15,
            stagger: 0.025,
            ease: 'power2.out',
          },
          0.4,
        )
        timeline.to(
          dust,
          { opacity: 0, duration: 0.7, stagger: 0.015, ease: 'sine.in' },
          Math.max(1.2, duration - 1),
        )
        const traveler = scene.current?.querySelector('.aw-role-effect-traveler')
        const path = scene.current?.querySelector<SVGPathElement>('.aw-role-effect-link__path')
        if (traveler && path && path.getAttribute('d') && variant !== 'break') {
          const progress = { value: 0 }
          timeline.to(
            progress,
            {
              value: 1,
              duration: 1.2,
              ease: 'power2.inOut',
              onUpdate: () => {
                if (!path.getAttribute('d')) {
                  gsap.set(traveler, { opacity: 0 })
                  return
                }
                const point = path.getPointAtLength(path.getTotalLength() * progress.value)
                gsap.set(traveler, { x: point.x, y: point.y, opacity: 1 })
              },
            },
            0.25,
          )
        }
      }
      timeline.to(
        visibleTargets,
        { opacity: 0, duration: fadeDuration, ease: 'sine.in' },
        Math.max(0, duration - fadeDuration),
      )
      if (scene.current)
        timeline.to(
          scene.current,
          { opacity: 0, duration: fadeDuration },
          Math.max(0, duration - fadeDuration),
        )
      const timeout = window.setTimeout(finish, duration * 1000 + 500)
      return () => window.clearTimeout(timeout)
    },
    { dependencies: [placement, mode, definition, cue.cueId, finish], revertOnUpdate: true },
  )

  return (
    <div
      className="aw-role-effect-overlay"
      data-effect={cue.effectId}
      data-family={definition.family}
      data-duration={definition.durationMs}
      data-mode={mode}
      data-variant={variant}
      ref={scene}
      aria-hidden
    >
      {placement?.anchors.map((anchor) =>
        createPortal(
          <div
            className="aw-role-effect-anchor"
            aria-hidden
            data-effect={cue.effectId}
            data-family={definition.family}
            data-variant={variant}
            data-part={
              cue.targetPlayerIds.length === 0 ||
              cue.targetPlayerIds.some((id) => id === anchor.playerId)
                ? 'target'
                : 'source'
            }
            ref={(element) => {
              if (element) stamps.current.set(anchor.playerId, element)
              else stamps.current.delete(anchor.playerId)
            }}
          >
            <span className="aw-role-effect-ground" />
            <InkEffectGlyph family={definition.family} />
          </div>,
          anchor.avatar,
          anchor.playerId,
        ),
      )}
      {placement?.captionHost ? (
        createPortal(
          <span
            ref={caption}
            className="aw-role-effect-caption"
            data-floating={!placement.captionHost.classList.contains('aw-effect-caption-slot')}
            data-effect={cue.effectId}
          >
            <span className="aw-role-effect-caption__seal" />
            <span className="aw-role-effect-caption__title">{getCopy(definition.labelKey)}</span>
            {outcome ? (
              <span className="aw-role-effect-caption__outcome">{outcome.label}</span>
            ) : null}
          </span>,
          placement.captionHost,
        )
      ) : (
        <span ref={caption} className="aw-visually-hidden">
          {getCopy(definition.labelKey)}
        </span>
      )}
      {linked && mode === 'full' ? (
        <svg className="aw-role-effect-link" width="100%" height="100%">
          <defs>
            <mask id={maskId} maskUnits="userSpaceOnUse">
              <rect width="100%" height="100%" fill="white" />
              <g ref={protectedMask} />
            </mask>
          </defs>
          <g mask={`url(#${maskId})`}>
            <path className="aw-role-effect-link__path" />
            <g className="aw-role-effect-traveler">
              {definition.family === 'crown' ? (
                <image href={effectArt.crown} x="-17" y="-17" width="34" height="34" />
              ) : (
                <path d="M0-3C-12-20-28 0 0 19C28 0 12-20 0-3Z" />
              )}
            </g>
          </g>
        </svg>
      ) : null}
    </div>
  )
}

function seededOffset(seed: string, index: number, magnitude: number): number {
  let hash = index + 1
  for (const character of seed) hash = (hash * 33 + character.codePointAt(0)!) >>> 0
  return ((hash % 2001) / 1000 - 1) * magnitude
}
