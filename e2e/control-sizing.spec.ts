import { expect, test } from './fixtures/test.js'

test('keeps portrait placeholders, action buttons and form icons aligned', async ({
  page,
  resources: _resources,
}) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/collection/characters')
    await page.getByRole('button', { name: '新建角色', exact: true }).click()
    const preview = page.locator('.aw-character-portrait-preview')
    const icon = preview.locator('.aw-icon')
    const box = (await preview.boundingBox())!
    const glyph = (await icon.boundingBox())!
    expect(glyph.width).toBe(glyph.height)
    expect(Math.abs(glyph.x + glyph.width / 2 - box.x - box.width / 2)).toBeLessThan(1)
    expect(Math.abs(glyph.y + glyph.height / 2 - box.y - box.height / 2)).toBeLessThan(1)
    await expect(icon).toHaveCSS('object-fit', 'contain')
    const actions = page.locator('.aw-form-actions .aw-button')
    const geometry = await actions.evaluateAll((buttons) =>
      buttons.map((button) => {
        const style = getComputedStyle(button)
        return {
          height: button.getBoundingClientRect().height,
          font: style.font,
          padding: style.padding,
        }
      }),
    )
    expect(geometry).toHaveLength(2)
    expect(geometry[0]).toEqual(geometry[1])
    await expect(page.getByRole('button', { name: '取消编辑', exact: true })).toBeVisible()
  }

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/boards')
  await page.getByRole('button', { name: '新建板型', exact: true }).click()
  await page.getByRole('button', { name: '增加平民', exact: true }).click()
  await expect(page.locator('.aw-board-character-slot')).toHaveCount(1)
  const arrows = page.locator('.aw-board-character-slot .aw-game-select__trigger .aw-icon')
  for (const size of await arrows.evaluateAll((icons) =>
    icons.map((icon) => {
      const rect = icon.getBoundingClientRect()
      return { width: rect.width, height: rect.height }
    }),
  )) {
    expect(size.width).toBe(size.height)
    expect(size.height).toBeGreaterThan(0)
    expect(size.height).toBeLessThan(24)
  }

  await page.goto('/matches/new')
  await page.locator('.aw-step-choice').nth(1).click()
  const placeholders = page.locator('.aw-seat-config__portrait > img')
  await expect(placeholders).not.toHaveCount(0)
  for (const size of await placeholders.evaluateAll((icons) =>
    icons.map((icon) => {
      const rect = icon.getBoundingClientRect()
      return [rect.width, rect.height]
    }),
  )) {
    expect(size[0]).toBe(size[1])
    expect(size[0]).toBeGreaterThan(0)
  }
  await expect(placeholders.first()).toHaveAttribute('src', /default-player/u)
  await expect(placeholders.first()).toHaveCSS('border-radius', '50%')
  await expect(page.locator('.aw-seat-config__portrait .aw-icon')).toHaveCount(0)
})
