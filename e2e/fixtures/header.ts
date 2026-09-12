import type { Page } from '@playwright/test'
import { expect } from './test.js'

export async function expectDayCentered(page: Page): Promise<void> {
  const day = page.locator('.aw-day-navigator__trigger')
  await expect(day).toBeVisible()
  await expect
    .poll(() =>
      day.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        return element.isConnected && bounds.width > 0
          ? Math.abs(bounds.left + bounds.width / 2 - window.innerWidth / 2)
          : Number.POSITIVE_INFINITY
      }),
    )
    .toBeLessThanOrEqual(1)
}
