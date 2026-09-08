import { vi } from 'vitest'
import { getRoleEffectDefinition } from '@agentwolf/assets'
import { PlayerIdSchema, RoleEffectCueSchema, type RoleEffectId } from '@agentwolf/contracts'

export function effectCue(effectId: RoleEffectId, variant: string | null = null) {
  const definition = getRoleEffectDefinition(effectId)
  return RoleEffectCueSchema.parse({
    cueId: `100:${effectId}`,
    sequence: 100,
    effectId,
    roleId: definition.roleId,
    abilityId: definition.abilityId,
    sourcePlayerIds: ['player-1'],
    targetPlayerIds: ['player-2'],
    tier: definition.tier,
    variant,
    occurredAt: '2026-09-08T00:00:00.000Z',
  })
}

export function rectangle(element: Element, x: number, y: number, width: number, height: number) {
  const bounds = new DOMRect(x, y, width, height)
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(bounds)
  return bounds
}

export function effectStage() {
  const root = document.createElement('main')
  root.innerHTML =
    '<header class="aw-match-hud"></header><section class="aw-match-stage"><div class="aw-effect-caption-slot"></div><p class="aw-speech-bubble__message">发言正文</p></section>'
  document.body.append(root)
  rectangle(root, 100, 50, 1000, 700)
  rectangle(root.querySelector('.aw-match-hud')!, 100, 50, 1000, 60)
  const caption = root.querySelector<HTMLElement>('.aw-effect-caption-slot')!
  rectangle(caption, 420, 120, 180, 30)
  const message = root.querySelector<HTMLElement>('.aw-speech-bubble__message')!
  rectangle(message, 390, 220, 350, 150)
  const cards = [0, 1, 2].map((index) => {
    const rail = document.createElement('aside')
    rail.className = 'aw-player-rail__inner'
    const card = document.createElement('article')
    card.className = 'aw-player-card'
    card.dataset['playerId'] = `player-${index + 1}`
    card.innerHTML =
      '<div class="aw-player-avatar"><div class="aw-player-avatar__core"></div><span class="aw-player-card__role" style="opacity: 0.72; clip-path: inset(0px)">身份</span></div>'
    rail.append(card)
    root.append(rail)
    const avatar = card.querySelector<HTMLElement>('.aw-player-avatar')!
    const core = card.querySelector<HTMLElement>('.aw-player-avatar__core')!
    const identity = card.querySelector<HTMLElement>('.aw-player-card__role')!
    const x = index === 1 ? 950 : 120
    const y = index === 2 ? 520 : 220
    rectangle(rail, x, 100, 140, 620)
    rectangle(card, x, y, 140, 130)
    rectangle(avatar, x, y, 90, 90)
    rectangle(core, x + 20, y + 20, 50, 50)
    return {
      rail,
      card,
      avatar,
      core,
      identity,
      playerId: PlayerIdSchema.parse(`player-${index + 1}`),
    }
  })
  return { root, cards, caption, message }
}

export function effectObservers() {
  const resizes: ResizeObserverDouble[] = []
  const mutations: MutationObserverDouble[] = []
  class ResizeObserverDouble {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
    constructor(readonly notify: ResizeObserverCallback) {
      resizes.push(this)
    }
  }
  class MutationObserverDouble {
    observe = vi.fn()
    disconnect = vi.fn()
    takeRecords = vi.fn(() => [])
    constructor(readonly notify: MutationCallback) {
      mutations.push(this)
    }
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverDouble)
  vi.stubGlobal('MutationObserver', MutationObserverDouble)
  return {
    get resize() {
      return resizes.at(-1)!
    },
    get mutation() {
      return mutations.at(-1)!
    },
    resized() {
      const observer = resizes.at(-1)!
      observer.notify([], observer as ResizeObserver)
    },
    mutated() {
      const observer = mutations.at(-1)!
      observer.notify([], observer as MutationObserver)
    },
  }
}
