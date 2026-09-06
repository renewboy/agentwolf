import type { Page } from '@playwright/test'
import { expect } from './test.js'

export async function expectDayCentered(page: Page): Promise<void> {
  const day = page.locator('.aw-day-navigator__trigger')
  await expect(day).toBeVisible()
  const offset = await day.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    return Math.abs(bounds.left + bounds.width / 2 - window.innerWidth / 2)
  })
  expect(offset).toBeLessThanOrEqual(1)
}
