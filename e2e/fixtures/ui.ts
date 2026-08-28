import { expect, type Locator } from '@playwright/test'

export async function expectTooltip(locator: Locator, label: string): Promise<void> {
  await locator.hover()
  await expect
    .poll(async () =>
      locator.evaluate((element) => {
        const style = getComputedStyle(element, '::after')
        return style.content.replace(/^"(.*)"$/u, '$1')
      }),
    )
    .toBe(label)
  await expect
    .poll(async () =>
      locator.evaluate((element) => Number(getComputedStyle(element, '::after').opacity)),
    )
    .toBeGreaterThan(0.95)
}
