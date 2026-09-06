import type { MatchView } from '@agentwolf/contracts'
import { postgameMatchFixture, postgameResult, thinkingMatchFixture } from './fixtures/matches.js'
import { expect, test } from './fixtures/test.js'

const viewports = [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 981, height: 900 },
  { width: 390, height: 844 },
] as const

test('keeps three desktop Match rows, inline actions, and a bounded footer', async ({
  page,
}, testInfo) => {
  const base = thinkingMatchFixture()
  const ended = postgameMatchFixture(base, 'match-lobby-layout-ended', 'collecting')
  const matches: MatchView[] = Array.from({ length: 6 }, (_, index) => ({
    ...ended,
    id: `match-lobby-layout-${index + 1}` as MatchView['id'],
    boardName: ['6 人快速场', '10 人镜隐迷踪局', '12 人标准场'][index % 3]!,
    day: index + 1,
    postgameReview: {
      ...ended.postgameReview!,
      state: 'completed',
      submittedCount: base.seats.length,
      result: postgameResult(),
    },
  }))
  matches[3] = { ...base, id: 'match-lobby-layout-4' as MatchView['id'], status: 'paused' }
  matches[4] = { ...base, id: 'match-lobby-layout-5' as MatchView['id'] }
  await page.route('**/api/runtime-config', (route) =>
    route.fulfill({ json: { developerMode: true } }),
  )
  await page.route(
    (url) => url.pathname === '/api/matches',
    (route) => route.fulfill({ json: matches }),
  )

  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await expect(page.locator('.aw-match-row')).toHaveCount(6)
    await expect(page.locator('.aw-lobby-hero h1')).toHaveCSS(
      'background-image',
      /headline-pigment/u,
    )
    await expect(page.locator('.aw-topbar')).toHaveCSS('background-image', /charcoal-pigment/u)
    if (viewport.width === 1440) {
      await expect
        .poll(() =>
          page
            .locator('.aw-topbar img')
            .evaluateAll((images) =>
              images.every(
                (image) =>
                  (image as HTMLImageElement).complete &&
                  (image as HTMLImageElement).naturalWidth > 0,
              ),
            ),
        )
        .toBe(true)
      await page.screenshot({
        path: testInfo.outputPath('lobby-reference-aligned.png'),
        fullPage: true,
      })
    }
    const geometry = await page.locator('.aw-lobby-page').evaluate((main) => {
      const hero = main.querySelector<HTMLElement>('.aw-lobby-hero')!.getBoundingClientRect()
      const content = main
        .querySelector<HTMLElement>('.aw-lobby-hero__content')!
        .getBoundingClientRect()
      const heroButton = main
        .querySelector<HTMLElement>('.aw-lobby-hero__start')!
        .getBoundingClientRect()
      const heroBrowse = main
        .querySelector<HTMLElement>('.aw-lobby-hero__browse')!
        .getBoundingClientRect()
      const edgeImage = getComputedStyle(
        main.querySelector<HTMLElement>('.aw-lobby-hero')!,
        '::after',
      ).backgroundImage
      const list = main.querySelector<HTMLElement>('.aw-match-list')!
      const listRect = list.getBoundingClientRect()
      const footer = main.querySelector<HTMLElement>('.aw-lobby-footer')!.getBoundingClientRect()
      const emblem = main
        .querySelector<HTMLImageElement>('.aw-lobby-footer img')!
        .getBoundingClientRect()
      const rows = [...main.querySelectorAll<HTMLElement>('.aw-match-row')].map((row) => {
        const box = row.getBoundingClientRect()
        const controls = [
          ...row.querySelectorAll<HTMLElement>('.aw-match-row__actions .aw-button'),
        ].map((button) => button.getBoundingClientRect())
        const status = row.querySelector<HTMLElement>('.aw-status')!
        const review = row.querySelector<HTMLElement>('.aw-postgame-state')
        return {
          top: box.top,
          bottom: box.bottom,
          controlsInside: controls.every(
            (control) => control.left >= box.left && control.right <= box.right,
          ),
          actionHeight:
            Math.max(...controls.map((control) => control.bottom)) -
            Math.min(...controls.map((control) => control.top)),
          statusBorder: getComputedStyle(status).borderWidth,
          statusGap: review
            ? review.getBoundingClientRect().top - status.getBoundingClientRect().bottom
            : null,
        }
      })
      const selectedFilter = main.querySelector<HTMLElement>(
        '.aw-lobby-filters [aria-pressed="true"]',
      )!
      const selectedNavigation = document.querySelector<HTMLElement>(
        '.aw-nav__link[aria-current="page"]',
      )!
      const line = getComputedStyle(selectedFilter, '::after')
      const stripe = getComputedStyle(selectedNavigation, '::before')
      return {
        pageWidth: document.documentElement.scrollWidth,
        heroHeight: hero.height,
        heroButtonWidth: heroButton.width,
        heroBottomGap: hero.bottom - heroButton.bottom,
        heroActionCenterGap: Math.abs(
          heroButton.top + heroButton.height / 2 - (heroBrowse.top + heroBrowse.height / 2),
        ),
        edgeImage,
        contentInsideHero: content.top >= hero.top && content.bottom <= hero.bottom,
        footerBottom: footer.bottom,
        emblem: { width: emblem.width, height: emblem.height },
        rows,
        listScrolls: list.scrollHeight > list.clientHeight,
        fullyVisibleRows: rows.filter(
          (row) => row.top >= listRect.top && row.bottom <= listRect.bottom + 1,
        ).length,
        lineColor: line.backgroundColor,
        stripeColor: stripe.backgroundColor,
        lineTexture: line.backgroundImage,
        stripeTexture: stripe.backgroundImage,
      }
    })
    expect(geometry.pageWidth).toBe(viewport.width)
    expect(geometry.contentInsideHero).toBe(true)
    expect(geometry.heroBottomGap).toBeGreaterThanOrEqual(40)
    expect(geometry.heroBottomGap).toBeLessThanOrEqual(52)
    expect(geometry.heroActionCenterGap).toBeLessThanOrEqual(1)
    expect(geometry.edgeImage).toContain('hero-printed-edge.webp')
    if (viewport.width >= 1440) expect(geometry.heroButtonWidth).toBeGreaterThanOrEqual(250)
    expect(geometry.emblem).toEqual({ width: 24, height: 24 })
    expect(geometry.rows.every((row) => row.controlsInside)).toBe(true)
    expect(
      geometry.rows.every(
        (row) => row.statusBorder === '0px' && (row.statusGap === null || row.statusGap >= 3),
      ),
    ).toBe(true)
    expect(geometry.lineColor).toBe(geometry.stripeColor)
    expect(geometry.lineTexture).toBe(geometry.stripeTexture)
    if (viewport.width > 760) {
      expect(geometry.listScrolls).toBe(true)
      expect(geometry.heroHeight).toBeGreaterThan(350)
      expect(geometry.footerBottom).toBeLessThanOrEqual(viewport.height)
      expect(geometry.fullyVisibleRows).toBe(3)
      expect(geometry.rows.every((row) => row.actionHeight <= 45)).toBe(true)
    } else {
      expect(geometry.listScrolls).toBe(false)
      expect(geometry.footerBottom).toBeGreaterThan(geometry.rows.at(-1)!.bottom)
    }
  }
  await page.getByRole('button', { name: /^进行中/u }).click()
  await expect(page.locator('.aw-match-row')).toHaveCount(2)
  const stateColors = await page
    .locator('.aw-match-row .aw-status')
    .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).color))
  expect(new Set(stateColors).size).toBe(2)
})
