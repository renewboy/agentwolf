import type { RoleEffectCue } from '@agentwolf/contracts'

export interface EffectAnchor {
  readonly playerId: string
  readonly card: HTMLElement
  readonly avatar: HTMLElement
  readonly identity: HTMLElement | null
}

export interface EffectGeometry {
  readonly path: string
  readonly protectedRects: readonly { x: number; y: number; width: number; height: number }[]
}

export function observeEffectAnchors(
  root: HTMLElement,
  cue: RoleEffectCue,
  onBind: (anchors: EffectAnchor[], captionHost: HTMLElement | null) => void,
  onGeometry: (geometry: EffectGeometry) => void,
): () => void {
  let pendingFrame: number | null = null
  let disposed = false
  const observed = new Set<Element>()
  const schedule = (): void => {
    if (disposed || pendingFrame !== null) return
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = null
      measure()
    })
  }
  const resize = new ResizeObserver(schedule)
  const measure = (): void => {
    if (disposed) return
    const ids = [...new Set([...cue.sourcePlayerIds, ...cue.targetPlayerIds])]
    const cards = [...root.querySelectorAll<HTMLElement>('.aw-player-card[data-player-id]')]
    const anchors = ids.flatMap((playerId): EffectAnchor[] => {
      const card = cards.find((element) => element.dataset['playerId'] === playerId)
      const avatar = card?.querySelector<HTMLElement>('.aw-player-avatar')
      return card && avatar
        ? [{ playerId, card, avatar, identity: card.querySelector('.aw-player-card__role') }]
        : []
    })
    onBind(
      anchors,
      root.querySelector('.aw-effect-caption-slot') ?? root.querySelector('.aw-match-stage'),
    )
    const protectedNodes = [
      ...root.querySelectorAll<HTMLElement>(
        '.aw-match-hud, .aw-presence__copy, .aw-effect-caption-slot, .aw-speech-bubble__message, .aw-speech-bubble__body > header, .aw-player-card__copy, .aw-player-card__agent',
      ),
    ]
    const watchNodes = [root, ...anchors.map((anchor) => anchor.card), ...protectedNodes]
    for (const element of watchNodes) {
      if (!observed.has(element)) {
        observed.add(element)
        resize.observe(element)
      }
    }
    for (const element of observed) {
      if (!element.isConnected) {
        resize.unobserve(element)
        observed.delete(element)
      }
    }
    const origin = root.getBoundingClientRect()
    const linkAnchors =
      cue.effectId === 'cupid-link' && cue.targetPlayerIds.length >= 2
        ? anchors.filter((anchor) => cue.targetPlayerIds.some((id) => id === anchor.playerId))
        : anchors
    const points = linkAnchors
      .filter(({ avatar }) => {
        const box = avatar.getBoundingClientRect()
        const rail = avatar.closest('.aw-player-rail__inner')?.getBoundingClientRect()
        return (
          box.width > 0 &&
          box.bottom > origin.top &&
          box.top < origin.bottom &&
          (!rail || (box.bottom > rail.top && box.top < rail.bottom))
        )
      })
      .map(({ avatar }) => {
        const box = (
          avatar.querySelector('.aw-player-avatar__core') ?? avatar
        ).getBoundingClientRect()
        return {
          x: box.left + box.width / 2 - origin.left,
          y: box.top + box.height / 2 - origin.top,
        }
      })
    const first = points[0]
    const last = points.at(-1)
    const lift = first && last ? Math.max(65, Math.min(first.y, last.y) - 80) : 0
    const path =
      points.length >= 2 && first && last
        ? `M${first.x},${first.y} C${first.x},${lift} ${last.x},${lift} ${last.x},${last.y}`
        : ''
    const protectedRects = protectedNodes.map((element) => {
      const box = element.getBoundingClientRect()
      return {
        x: box.left - origin.left - 3,
        y: box.top - origin.top - 3,
        width: box.width + 6,
        height: box.height + 6,
      }
    })
    onGeometry({ path, protectedRects })
  }
  const mutation = new MutationObserver(schedule)
  mutation.observe(root, { childList: true, subtree: true })
  root.addEventListener('scroll', schedule, true)
  measure()
  return () => {
    disposed = true
    if (pendingFrame !== null) cancelAnimationFrame(pendingFrame)
    resize.disconnect()
    mutation.disconnect()
    root.removeEventListener('scroll', schedule, true)
  }
}
