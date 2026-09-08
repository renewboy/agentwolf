import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleEffectScene } from '../src/motion/role-effects/RoleEffectScene.js'
import { gsap } from '../src/motion/gsap.js'
import { effectCue, effectObservers, effectStage, rectangle } from './fixtures/effect-stage.js'

const createTimeline = gsap.timeline.bind(gsap)
let timelines: gsap.core.Timeline[] = []
const svgMethods = {
  getBBox: () => ({ x: -90, y: -90, width: 180, height: 180 }),
  getTotalLength: () => 200,
  getPointAtLength: (length: number) => ({ x: length, y: length / 2 }),
}

beforeEach(() => {
  vi.useFakeTimers()
  timelines = []
  vi.spyOn(gsap, 'timeline').mockImplementation((options) => {
    const timeline = createTimeline({ ...options, paused: true })
    timelines.push(timeline)
    return timeline
  })
  for (const [method, value] of Object.entries(svgMethods)) {
    Object.defineProperty(SVGElement.prototype, method, { configurable: true, value })
  }
})

afterEach(() => {
  for (const timeline of timelines) timeline.revert()
  gsap.ticker.sleep()
  vi.useRealTimers()
  for (const method of Object.keys(svgMethods)) Reflect.deleteProperty(SVGElement.prototype, method)
  document.body.replaceChildren()
})

describe('role effect scenes', () => {
  it.each([
    ['werewolf-attack', null, 'default', 'claw'],
    ['werewolf-self-destruct', null, 'default', 'burst'],
    ['seer-inspect', 'village', 'default', 'inspect'],
    ['witch-antidote', null, 'antidote', 'medicine'],
    ['witch-poison', null, 'poison', 'medicine'],
    ['guard-protect', null, 'default', 'ward'],
    ['hunter-shot', null, 'default', 'shot'],
    ['idiot-reveal', null, 'default', 'reveal'],
    ['thief-choose-card', 'role-seer', 'default', 'cards'],
    ['cupid-link', null, 'default', 'bond'],
    ['cupid-linked-death', 'night', 'break', 'bond'],
    ['sheriff-transferred', null, 'default', 'crown'],
    ['sheriff-elected', null, 'default', 'crown'],
    ['awakened-hidden-wolf-double-attack', 'double', 'double', 'claw'],
  ] as const)(
    'presents %s with a readable hold and restores card state after removal',
    (effectId, variant, presentation, family) => {
      const stage = effectStage()
      effectObservers()
      const cue = effectCue(effectId, variant)
      const complete = vi.fn()
      const originalIdentity = stage.cards[0]!.identity.style.cssText
      const { container, unmount } = render(
        <RoleEffectScene
          cue={cue}
          mode="full"
          scope={{ current: stage.root }}
          onComplete={complete}
        />,
      )
      const overlay = container.querySelector('.aw-role-effect-overlay')!
      expect(overlay).toHaveAttribute('data-family', family)
      expect(overlay).toHaveAttribute('data-variant', presentation)
      expect(stage.root.querySelectorAll('.aw-role-effect-anchor')).toHaveLength(2)
      expect(stage.cards[0]!.card).toHaveAttribute('data-role-effect', effectId)
      expect(stage.caption.querySelector('.aw-role-effect-caption')).toHaveAttribute(
        'data-floating',
        'false',
      )
      const timeline = timelines.at(-1)!
      const duration = Number(overlay.getAttribute('data-duration')) / 1000
      expect(timeline.duration()).toBeCloseTo(duration)
      act(() => {
        timeline.time(1.2)
      })
      expect(
        Number(stage.root.querySelector<HTMLElement>('.aw-role-effect-anchor')!.style.opacity),
      ).toBeCloseTo(1)
      expect(complete).not.toHaveBeenCalled()
      if (effectId === 'seer-inspect') expect(screen.getByText('好人阵营')).toBeVisible()
      if (effectId === 'thief-choose-card') expect(screen.getByText('预言家')).toBeVisible()
      act(() => {
        timeline.time(duration)
        vi.advanceTimersByTime(duration * 1000 + 600)
      })
      expect(complete).toHaveBeenCalledOnce()
      unmount()
      expect(stage.root.querySelector('.aw-role-effect-anchor')).toBeNull()
      expect(stage.root.querySelector('[data-role-effect]')).toBeNull()
      expect(stage.cards[0]!.identity.style.cssText).toBe(originalIdentity)
    },
  )

  it('keeps reduced effects for the full duration without a traveling link or identity transform', () => {
    const stage = effectStage()
    effectObservers()
    const complete = vi.fn()
    const originalIdentity = stage.cards[0]!.identity.style.cssText
    const { container, unmount } = render(
      <RoleEffectScene
        cue={effectCue('cupid-link')}
        mode="reduced"
        scope={{ current: stage.root }}
        onComplete={complete}
      />,
    )
    expect(container.querySelector('.aw-role-effect-link')).toBeNull()
    expect(timelines.at(-1)!.duration()).toBe(3)
    act(() => {
      timelines.at(-1)!.time(2.5)
    })
    expect(complete).not.toHaveBeenCalled()
    expect(stage.cards[0]!.identity.style.cssText).toBe(originalIdentity)
    unmount()
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(complete).not.toHaveBeenCalled()
  })

  it('rebinds replaced portraits without restarting the hold, and releases removed anchors', () => {
    const stage = effectStage()
    const observers = effectObservers()
    const complete = vi.fn()
    const cue = effectCue('thief-choose-card', 'role-seer')
    const { unmount } = render(
      <RoleEffectScene
        cue={{ ...cue, targetPlayerIds: [] }}
        mode="full"
        scope={{ current: stage.root }}
        onComplete={complete}
      />,
    )
    expect(stage.cards[0]!.avatar.querySelector('.aw-role-effect-anchor')).toHaveAttribute(
      'data-part',
      'target',
    )
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    const replacement = document.createElement('div')
    replacement.className = 'aw-player-avatar'
    rectangle(replacement, 120, 220, 90, 90)
    act(() => {
      stage.cards[0]!.avatar.replaceWith(replacement)
      observers.mutated()
      vi.advanceTimersByTime(20)
    })
    expect(replacement.querySelector('.aw-role-effect-anchor')).not.toBeNull()
    expect(timelines.at(-1)!.duration()).toBeLessThan(2)
    expect(complete).not.toHaveBeenCalled()
    act(() => {
      stage.cards[0]!.card.remove()
      observers.mutated()
      vi.advanceTimersByTime(20)
    })
    expect(stage.cards[0]!.card).not.toHaveAttribute('data-role-effect')
    unmount()
    expect(observers.resize.disconnect).toHaveBeenCalledOnce()
  })

  it('updates protected regions and hides a traveler when its endpoint scrolls out of view', () => {
    const stage = effectStage()
    const observers = effectObservers()
    const { container, unmount } = render(
      <RoleEffectScene
        cue={effectCue('sheriff-transferred')}
        mode="full"
        scope={{ current: stage.root }}
        onComplete={vi.fn()}
      />,
    )
    const traveler = container.querySelector<SVGGElement>('.aw-role-effect-traveler')!
    const path = container.querySelector('.aw-role-effect-link__path')!
    const mask = container.querySelector('mask > g')!
    expect(traveler.querySelector('image')).not.toBeNull()
    expect(mask.querySelectorAll('rect')).toHaveLength(3)
    const firstMask = mask.firstChild
    const count = timelines.length
    act(() => {
      observers.resized()
      vi.advanceTimersByTime(20)
      timelines.at(-1)!.time(0.9)
    })
    expect(timelines).toHaveLength(count)
    expect(mask.firstChild).toBe(firstMask)
    expect(traveler.style.opacity).toBe('1')
    act(() => {
      rectangle(stage.message, 390, 240, 350, 180)
      rectangle(stage.cards[1]!.avatar, 950, 900, 90, 90)
      observers.resized()
      vi.advanceTimersByTime(20)
      timelines.at(-1)!.time(1.1)
    })
    expect(path).toHaveAttribute('d', '')
    expect(traveler.style.opacity).toBe('0')
    expect(mask.lastElementChild).toHaveAttribute('height', '186')
    unmount()
  })

  it.each(['absent-root', 'absent-caption', 'stage-caption'] as const)(
    'completes safely with %s',
    (kind) => {
      const stage = effectStage()
      effectObservers()
      stage.caption.remove()
      if (kind === 'absent-caption') stage.root.querySelector('.aw-match-stage')!.remove()
      const complete = vi.fn()
      const { container, unmount } = render(
        <RoleEffectScene
          cue={effectCue('werewolf-attack')}
          mode="reduced"
          scope={{ current: kind === 'absent-root' ? null : stage.root }}
          onComplete={complete}
        />,
      )
      if (kind === 'stage-caption') {
        expect(stage.root.querySelector('.aw-role-effect-caption')).toHaveAttribute(
          'data-floating',
          'true',
        )
      } else {
        expect(container.querySelector('.aw-visually-hidden')).toHaveTextContent('狼人夜袭')
      }
      act(() => {
        vi.advanceTimersByTime(3100)
      })
      expect(complete).toHaveBeenCalledOnce()
      unmount()
    },
  )
})
