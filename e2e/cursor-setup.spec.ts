import { expect, test } from './fixtures/test.js'

test('uses the supplied cursor pair and shared identity materials in player configuration', async ({
  page,
  resources: _resources,
}, testInfo) => {
  await page.goto('/matches/new')
  const board = page.locator('.aw-board-option').first()
  await expect(board).toBeVisible()
  await board.hover()
  await expect(board).toHaveCSS('cursor', /cursors\/idle-.*1 1/u)
  await page.mouse.down()
  await expect(page.locator('html')).toHaveAttribute('data-aw-cursor', 'pressed')
  await expect(board).toHaveCSS('cursor', /cursors\/pressed-.*1 1/u)
  await page.mouse.up()
  await expect(page.locator('html')).not.toHaveAttribute('data-aw-cursor')
  const badges = board.locator('.aw-role-badge')
  expect(
    await badges.evaluateAll((elements) =>
      elements.every((element) => {
        const style = getComputedStyle(element)
        return (
          style.borderImageSource.includes(
            `${element.getAttribute('data-role-id')}/tag-horizontal-`,
          ) && style.writingMode === 'horizontal-tb'
        )
      }),
    ),
  ).toBe(true)
  await board.evaluate((element) => element.scrollIntoView({ block: 'start' }))
  await board.screenshot({ path: testInfo.outputPath('horizontal-identity-tags.png') })
  await page.locator('.aw-step-choice').nth(1).click()
  const cards = page.locator('.aw-seat-config')
  await expect(cards).not.toHaveCount(0)
  for (const card of await cards.all()) {
    await expect(card).toHaveCSS('border-width', '0px')
    await expect(card).toHaveCSS('border-image-source', 'none')
    await expect(card).toHaveCSS('background-color', 'rgb(8, 9, 7)')
    await expect(card.locator('.aw-seat-config__portrait img')).toHaveAttribute(
      'src',
      /default-player/u,
    )
    await expect(card.locator('.aw-seat-config__heading')).toHaveCSS(
      'border-image-source',
      /engraved-frame/u,
    )
  }
  await cards.first().evaluate((element) => element.scrollIntoView({ block: 'start' }))
  await cards.first().screenshot({ path: testInfo.outputPath('player-config-card.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await cards.first().evaluate((element) => element.scrollIntoView({ block: 'start' }))
  await cards.first().screenshot({ path: testInfo.outputPath('player-config-mobile.png') })
})
