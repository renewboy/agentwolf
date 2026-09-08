import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { observeEffectAnchors } from '../src/motion/role-effects/anchors.js'
import { effectCue, effectObservers, effectStage, rectangle } from './fixtures/effect-stage.js'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  document.body.replaceChildren()
})

describe('effect anchor geometry', () => {
  it('connects avatar cores in stage coordinates and protects text while deduplicating players', () => {
    const stage = effectStage()
    const observers = effectObservers()
    const bound = vi.fn()
    const geometry = vi.fn()
    const cue = effectCue('sheriff-transferred')
    const dispose = observeEffectAnchors(
      stage.root,
      { ...cue, sourcePlayerIds: [stage.cards[0]!.playerId, stage.cards[0]!.playerId] },
      bound,
      geometry,
    )
    expect(bound.mock.lastCall?.[0].map((anchor: { playerId: string }) => anchor.playerId)).toEqual(
      ['player-1', 'player-2'],
    )
    expect(bound.mock.lastCall?.[1]).toBe(stage.caption)
    expect(geometry.mock.lastCall?.[0]).toEqual({
      path: 'M65,215 C65,135 895,135 895,215',
      protectedRects: [
        { x: -3, y: -3, width: 1006, height: 66 },
        { x: 317, y: 67, width: 186, height: 36 },
        { x: 287, y: 167, width: 356, height: 156 },
      ],
    })
    const calls = geometry.mock.calls.length
    rectangle(stage.cards[1]!.core, 800, 300, 50, 50)
    observers.resized()
    observers.resized()
    stage.root.dispatchEvent(new Event('scroll'))
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(20)
    expect(geometry).toHaveBeenCalledTimes(calls + 1)
    expect(geometry.mock.lastCall?.[0].path).toBe('M65,215 C65,135 725,135 725,275')
    dispose()
  })

  it('links Cupid targets instead of its source, and falls back to avatar bounds and the stage caption', () => {
    const stage = effectStage()
    effectObservers()
    stage.caption.remove()
    stage.cards[0]!.core.remove()
    stage.cards[0]!.identity.remove()
    // A card outside a rail is still an eligible visible anchor.
    stage.root.append(stage.cards[0]!.card)
    const bound = vi.fn()
    const geometry = vi.fn()
    const dispose = observeEffectAnchors(
      stage.root,
      {
        ...effectCue('cupid-link'),
        sourcePlayerIds: [stage.cards[2]!.playerId],
        targetPlayerIds: [stage.cards[0]!.playerId, stage.cards[1]!.playerId],
      },
      bound,
      geometry,
    )
    expect(geometry.mock.lastCall?.[0].path).toBe('M65,215 C65,135 895,135 895,215')
    expect(
      bound.mock.lastCall?.[0].find(
        (anchor: { playerId: string }) => anchor.playerId === 'player-1',
      ).identity,
    ).toBeNull()
    expect(bound.mock.lastCall?.[1]).toBe(stage.root.querySelector('.aw-match-stage'))
    dispose()
  })

  it.each([
    [950, 220, 0, 90],
    [950, -100, 90, 90],
    [950, 800, 90, 90],
    [950, 0, 90, 90],
    [950, 730, 90, 90],
  ])('omits links to invisible or rail-clipped avatars at %s,%s', (x, y, width, height) => {
    const stage = effectStage()
    effectObservers()
    rectangle(stage.cards[1]!.avatar, x, y, width, height)
    const geometry = vi.fn()
    const dispose = observeEffectAnchors(
      stage.root,
      effectCue('sheriff-transferred'),
      vi.fn(),
      geometry,
    )
    expect(geometry.mock.lastCall?.[0].path).toBe('')
    dispose()
  })

  it('rebinds removed cards and cancels queued measurements and browser listeners on disposal', () => {
    const stage = effectStage()
    const observers = effectObservers()
    const bound = vi.fn()
    const geometry = vi.fn()
    const dispose = observeEffectAnchors(
      stage.root,
      effectCue('sheriff-transferred'),
      bound,
      geometry,
    )
    stage.cards[1]!.card.remove()
    stage.cards[0]!.avatar.remove()
    stage.root.querySelector('.aw-match-stage')!.remove()
    observers.mutated()
    vi.advanceTimersByTime(20)
    expect(bound.mock.lastCall).toEqual([[], null])
    expect(geometry.mock.lastCall?.[0].path).toBe('')
    expect(observers.resize.unobserve).toHaveBeenCalledWith(stage.cards[1]!.card)
    const measured = geometry.mock.calls.length
    observers.resized()
    dispose()
    expect(observers.resize.disconnect).toHaveBeenCalledOnce()
    expect(observers.mutation.disconnect).toHaveBeenCalledOnce()
    observers.resized()
    observers.mutated()
    stage.root.dispatchEvent(new Event('scroll'))
    vi.advanceTimersByTime(40)
    expect(geometry).toHaveBeenCalledTimes(measured)
    expect(vi.getTimerCount()).toBe(0)
  })
})
