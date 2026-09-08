import { resolve } from 'node:path'
import type { MatchView } from '@agentwolf/contracts'
import { thinkingMatchFixture } from './fixtures/matches.js'
import { expect, test } from './fixtures/test.js'
import { expectDayCentered } from './fixtures/header.js'

for (const seatCount of [10, 12, 24]) {
  test(`keeps all ${seatCount} seat cards proportional and reachable on desktop and mobile`, async ({
    page,
    resources: _resources,
  }, testInfo) => {
    const base = thinkingMatchFixture()
    const match = {
      ...base,
      id: `match-table-${seatCount}-seats`,
      timeline: base.timeline.map((item, index) =>
        item.kind === 'speech.committed'
          ? {
              ...item,
              playerIds: [
                `player-${(index % (seatCount / 2)) + 1 + (index % 2 === 0 ? 0 : seatCount / 2)}`,
              ],
            }
          : item,
      ),
      seats: Array.from({ length: seatCount }, (_, index) => ({
        ...base.seats[index % base.seats.length]!,
        playerId: `player-${index + 1}`,
        seat: index + 1,
        name: `测试玩家${index + 1}`,
        character:
          index === 0
            ? {
                id: 'character-test-detective',
                name: '侦探人设',
                portraitAssetId: 'portrait-test-detective',
                universe: '测试',
                revision: 1,
                source: 'built-in',
                editable: false,
              }
            : null,
        markers: index === 0 ? ['cupid-lover'] : [],
        sheriffCandidate: index === 1,
      })),
    } as MatchView
    await page.route(`**/api/matches/${match.id}?*`, async (route) =>
      route.fulfill({ json: match }),
    )
    await page.route('**/api/character-assets/portrait-test-detective', async (route) =>
      route.fulfill({ path: resolve('packages/assets/art/default-player.webp') }),
    )
    await page.routeWebSocket('**/live?*', (socket) => {
      socket.send(JSON.stringify({ type: 'snapshot', view: { kind: 'god' }, data: match }))
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/matches/${match.id}`)
    await page.getByRole('button', { name: '上帝视角', exact: true }).click()
    const cards = page.locator('.aw-player-rail .aw-player-card')
    await expect(cards).toHaveCount(seatCount)
    await expectDayCentered(page)
    await expect(page.locator('.aw-speech-bubble[data-side="left"]').first()).toBeAttached()
    await expect(page.locator('.aw-speech-bubble[data-side="right"]').first()).toBeAttached()
    const left = page.getByRole('complementary', { name: '左侧玩家' })
    const right = page.getByRole('complementary', { name: '右侧玩家' })
    await expect(left.locator('article')).toHaveCount(seatCount / 2)
    await expect(right.locator('article')).toHaveCount(seatCount / 2)
    const dimensions = await cards.evaluateAll((items) =>
      items.map((item) => {
        const card = item.getBoundingClientRect()
        const portrait = item.querySelector('.aw-player-avatar')!.getBoundingClientRect()
        const face = item.querySelector('.aw-player-avatar__core')!.getBoundingClientRect()
        const copy = item.querySelector('.aw-player-card__copy')!.getBoundingClientRect()
        const agent = item.querySelector('.aw-player-card__agent')!.getBoundingClientRect()
        return {
          width: card.width,
          portraitRatio: portrait.width / portrait.height,
          portraitWidth: portrait.width,
          faceRatio: face.width / face.height,
          silhouetteAboveFrame:
            portrait.top < card.top + Number.parseFloat(getComputedStyle(item, '::after').top),
          copyBesidePortrait: copy.left >= portrait.right,
          portraitContained:
            portrait.left >= card.left &&
            portrait.right <= card.right &&
            portrait.top >= card.top &&
            portrait.bottom <= card.bottom,
          copyContained:
            copy.left >= card.left &&
            copy.right <= card.right &&
            copy.top >= card.top &&
            copy.bottom <= card.bottom,
          agentContained:
            agent.left >= card.left &&
            agent.right <= card.right &&
            agent.top >= card.top &&
            agent.bottom <= card.bottom,
          labelsContained: [
            ...item.querySelectorAll(
              '.aw-player-card__name-row, .aw-player-card__badges > *, .aw-player-card__status',
            ),
          ].every((label) => {
            const bounds = label.getBoundingClientRect()
            return (
              bounds.left >= card.left &&
              bounds.right <= card.right &&
              bounds.top >= card.top &&
              bounds.bottom <= card.bottom
            )
          }),
        }
      }),
    )
    for (const size of dimensions) {
      expect(size.width).toBeGreaterThanOrEqual(212)
      expect(size.width).toBeLessThanOrEqual(252)
      expect(size.portraitRatio).toBe(1)
      expect(size.portraitWidth).toBeGreaterThanOrEqual(90)
      expect(size.faceRatio).toBeCloseTo(1, 2)
      expect(size.silhouetteAboveFrame).toBe(true)
      expect(size.copyBesidePortrait).toBe(true)
      expect(size.portraitContained).toBe(true)
      expect(size.copyContained).toBe(true)
      expect(size.agentContained).toBe(true)
      expect(size.labelsContained).toBe(true)
    }
    const placement = await page.locator('.aw-stage-grid').evaluate((element) => {
      const leftBounds = element
        .querySelector('[data-side="left"].aw-player-rail')!
        .getBoundingClientRect()
      const rightBounds = element
        .querySelector('[data-side="right"].aw-player-rail')!
        .getBoundingClientRect()
      const stage = element.querySelector('.aw-match-stage')!.getBoundingClientRect()
      return {
        left: leftBounds.right <= stage.left,
        right: rightBounds.left >= stage.right,
        feedWidth: stage.width,
      }
    })
    expect(placement.left).toBe(true)
    expect(placement.right).toBe(true)
    expect(placement.feedWidth).toBeGreaterThan(800)
    if (seatCount <= 12) {
      for (const rail of [left, right]) {
        await expect(rail.locator('article').first()).toBeInViewport()
        await expect(rail.locator('article').last()).toBeInViewport({ ratio: 1 })
        const fill = await rail.evaluate((element) => {
          const railCards = element.querySelectorAll('article')
          const first = railCards[0]!.getBoundingClientRect()
          const last = railCards[railCards.length - 1]!.getBoundingClientRect()
          return (last.bottom - first.top) / element.getBoundingClientRect().height
        })
        expect(fill).toBeGreaterThan(0.95)
      }
    }
    if (seatCount === 12)
      await page.screenshot({ path: testInfo.outputPath('council-desktop.png') })
    if (seatCount === 12) {
      await page.setViewportSize({ width: 1280, height: 720 })
      await expectDayCentered(page)
      for (const rail of [left, right]) {
        await expect(rail.locator('article').first()).toBeInViewport({ ratio: 1 })
        await expect(rail.locator('article').last()).toBeInViewport({ ratio: 1 })
      }
      await page.screenshot({ path: testInfo.outputPath('council-compact-desktop.png') })
    }
    await cards.last().scrollIntoViewIfNeeded()
    await expect(cards.last()).toBeInViewport()
    await page.setViewportSize({ width: 390, height: 844 })
    await expectDayCentered(page)
    await cards.first().scrollIntoViewIfNeeded()
    await expect(cards.first()).toBeInViewport()
    await cards.last().scrollIntoViewIfNeeded()
    await expect(cards.last()).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(844)
    expect(
      await page
        .locator('.aw-match-controls button')
        .evaluateAll((buttons) =>
          buttons.every((button) => button.getBoundingClientRect().right <= window.innerWidth),
        ),
    ).toBe(true)
    await expect(page.getByRole('log')).toBeVisible()
    if (seatCount === 12) await page.screenshot({ path: testInfo.outputPath('council-mobile.png') })
  })
}
