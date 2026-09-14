import { expect, test } from './fixtures/test.js'

test('keeps confirmation controls in the shared thin engraved material', async ({
  page,
  resources,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/agents')
  await page
    .locator('.aw-profile-item')
    .filter({ hasText: resources.sharedProfileName })
    .locator('.aw-profile-item__select')
    .click()
  await page.getByRole('button', { name: '删除配置', exact: true }).click()
  const dialog = page.getByRole('alertdialog', { name: '确认删除配置' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveCSS('border-top-width', '1px')
  await expect(dialog).toHaveCSS('border-image-source', /engraved-frame/u)
  await expect(dialog).toHaveCSS('background-image', /charcoal-wood/u)
  await expect(dialog.getByRole('heading')).toHaveCSS('font-family', /Songti/u)
  await dialog.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished))
  })
  const remove = dialog.getByRole('button', { name: '删除配置' })
  const background = await remove.evaluate((element) => getComputedStyle(element).backgroundImage)
  const before = await remove.boundingBox()
  await remove.hover()
  await expect(remove).toHaveCSS('background-image', background)
  await expect(remove).toHaveCSS('filter', 'brightness(1.18)')
  await expect(remove).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  expect(await remove.boundingBox()).toEqual(before)
  await page.screenshot({ path: testInfo.outputPath('agentwolf-confirm-restored.png') })
  await dialog.getByRole('button', { name: '取消' }).click()
})
