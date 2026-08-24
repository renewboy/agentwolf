import {
  Crosshair,
  ArrowsLeftRight,
  Crown,
  Drop,
  Eye,
  MoonStars,
  Shield,
  Skull,
  Smiley,
  Sparkle,
} from '@phosphor-icons/react'
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { getCopy, getRoleEffectDefinition, roleEffectCatalog } from '@agentwolf/assets'
import type { RoleEffectCue, RoleEffectMode } from '@agentwolf/contracts'
import { gsap, useGSAP } from '../../motion/gsap.js'

export function RoleEffectController({
  scope,
  cues,
  lastSequence,
  projectionKey,
  mode,
}: {
  readonly scope: RefObject<HTMLElement | null>
  readonly cues: readonly RoleEffectCue[]
  readonly lastSequence: number
  readonly projectionKey: string
  readonly mode: RoleEffectMode
}) {
  const baseline = useRef<number | null>(null)
  const previousProjection = useRef<string | null>(null)
  const pending = useRef<RoleEffectCue[]>([])
  const [current, setCurrent] = useState<RoleEffectCue | null>(null)

  useEffect(() => {
    if (previousProjection.current === projectionKey) return
    previousProjection.current = projectionKey
    baseline.current = lastSequence
    pending.current = []
    setCurrent(null)
  }, [lastSequence, projectionKey])

  useEffect(() => {
    if (baseline.current === null) {
      baseline.current = lastSequence
      return
    }
    if (mode === 'off') {
      baseline.current = Math.max(baseline.current, lastSequence)
      pending.current = []
      setCurrent(null)
      return
    }
    const next = cues
      .filter((cue) => cue.sequence > (baseline.current ?? 0))
      .sort((left, right) => left.sequence - right.sequence)
    baseline.current = Math.max(baseline.current, lastSequence)
    if (next.length === 0) return
    const existing = new Set(pending.current.map((cue) => cue.cueId))
    pending.current.push(...next.filter((cue) => !existing.has(cue.cueId)))
    setCurrent((active) => active ?? pending.current.shift() ?? null)
  }, [cues, lastSequence, mode])

  useGSAP(
    () => {
      if (!current || mode === 'off') return undefined
      const root = scope.current
      if (!root) return undefined
      const definition = getRoleEffectDefinition(current.effectId)
      const overlay = root.querySelector('.aw-role-effect-card')
      const particles = root.querySelectorAll('.aw-role-effect-particle')
      const affectedIds = [...current.sourcePlayerIds, ...current.targetPlayerIds]
      const playerCards = affectedIds.flatMap((playerId) => [
        ...root.querySelectorAll<HTMLElement>(`.aw-player-card[data-player-id="${playerId}"]`),
      ])
      for (const card of playerCards) card.dataset['roleEffect'] = current.effectId
      const timeline = gsap.timeline({
        onComplete: () => setCurrent(pending.current.shift() ?? null),
      })
      if (overlay) {
        timeline.fromTo(
          overlay,
          { opacity: 0, scale: 0.82, y: 12 },
          {
            opacity: 1,
            scale: 1,
            y: 0,
            duration: mode === 'reduced' ? 0.18 : 0.28,
            ease: 'back.out(1.35)',
          },
        )
      }
      if (mode === 'full') {
        timeline.fromTo(
          particles,
          { opacity: 0, scale: 0.3, x: 0, y: 0 },
          {
            opacity: 0.9,
            scale: 1,
            x: (index) => seededOffset(current.cueId, index, 42),
            y: (index) => seededOffset(current.cueId, index + 11, 28),
            duration: 0.42,
            stagger: 0.025,
            ease: 'power3.out',
          },
          0.08,
        )
        timeline.fromTo(
          playerCards,
          { scale: 1 },
          { scale: 1.035, duration: 0.12, yoyo: true, repeat: 1, ease: 'power3.out' },
          0.08,
        )
        if (definition.tier === 'large') {
          const stage = root.querySelector('.aw-stage-grid')
          if (stage) {
            timeline.to(
              stage,
              {
                keyframes: { x: [0, -3, 3, -2, 2, 0] },
                duration: 0.24,
                ease: 'power2.out',
              },
              0.12,
            )
          }
        }
      }
      timeline.to(
        overlay,
        {
          opacity: 0,
          scale: mode === 'reduced' ? 1 : 1.04,
          duration: 0.2,
          ease: 'power2.in',
        },
        Math.max(0.34, definition.durationMs / 1000 - 0.2),
      )
      return () => {
        for (const card of playerCards) delete card.dataset['roleEffect']
      }
    },
    { scope, dependencies: [current?.cueId, mode], revertOnUpdate: true },
  )

  if (!current || mode === 'off') return null
  const definition = getRoleEffectDefinition(current.effectId)
  return (
    <div className="aw-role-effect-overlay" data-effect={current.effectId} aria-hidden>
      <div className="aw-role-effect-card">
        <span>{effectIcon(definition.icon)}</span>
        <strong>{getCopy(definition.labelKey)}</strong>
      </div>
      <div className="aw-role-effect-particles">
        {Array.from({ length: 10 }, (_, index) => (
          <i className="aw-role-effect-particle" key={index} />
        ))}
      </div>
    </div>
  )
}

function effectIcon(icon: (typeof roleEffectCatalog)[string]['icon']): ReactNode {
  const icons: Readonly<Record<(typeof roleEffectCatalog)[string]['icon'], ReactNode>> = {
    moon: <MoonStars size={34} weight="fill" />,
    skull: <Skull size={34} weight="fill" />,
    eye: <Eye size={34} weight="fill" />,
    sparkle: <Sparkle size={34} weight="fill" />,
    drop: <Drop size={34} weight="fill" />,
    crosshair: <Crosshair size={34} weight="bold" />,
    smile: <Smiley size={34} weight="fill" />,
    shield: <Shield size={34} weight="fill" />,
    crown: <Crown size={34} weight="fill" />,
    transfer: <ArrowsLeftRight size={34} weight="bold" />,
    mirror: <Eye size={34} weight="duotone" />,
    burst: <Skull size={34} weight="duotone" />,
  }
  return icons[icon]
}

function seededOffset(seed: string, index: number, magnitude: number): number {
  let hash = index + 1
  for (const character of seed) hash = (hash * 33 + character.codePointAt(0)!) >>> 0
  return ((hash % 2001) / 1000 - 1) * magnitude
}
