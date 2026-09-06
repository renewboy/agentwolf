import { thinkingMatchFixture } from './fixtures/matches.js'
import { expect, test } from './fixtures/test.js'

test('keeps page information unobscured on hover and preserves spectator selection', async ({
  page,
  resources: _resources,
}) => {
  const match = thinkingMatchFixture()
  await page.route('**/api/matches', (route) => route.fulfill({ json: [match] }))
  await page.route(`**/api/matches/${match.id}?*`, (route) => route.fulfill({ json: match }))
  await page.routeWebSocket('**/live?*', (socket) => {
    socket.send(JSON.stringify({ type: 'snapshot', view: { kind: 'god' }, data: match }))
  })

  await page.goto('/')
  const name = page.locator('.aw-match-row h3').first()
  await expect(name).toHaveText(match.boardName)
  await name.hover()
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await expect(page.locator('[title]')).toHaveCount(0)

  const navigation = page.getByRole('link', { name: '开始对局', exact: true })
  const beforeHover = await navigation.boundingBox()
  const samples = navigation.evaluate(async (element) => {
    const frames: { background: string; opacity: number }[] = []
    for (let frame = 0; frame < 18; frame++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      frames.push({
        background: getComputedStyle(element).backgroundColor,
        opacity: Number(getComputedStyle(element, '::after').opacity),
      })
    }
    return frames
  })
  await navigation.hover()
  const frames = await samples
  expect(new Set(frames.map((frame) => frame.background))).toEqual(new Set(['rgba(0, 0, 0, 0)']))
  await expect
    .poll(() => navigation.evaluate((element) => getComputedStyle(element, '::after').opacity))
    .toBe('1')
  for (let index = 1; index < frames.length; index++) {
    expect(frames[index]!.opacity).toBeGreaterThanOrEqual(frames[index - 1]!.opacity)
  }
  expect(await navigation.boundingBox()).toEqual(beforeHover)

  const watch = page.getByRole('link', { name: '继续观战', exact: true })
  await watch.hover()
  await expect(watch).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)')
  await expect(watch).toHaveCSS('filter', 'brightness(1.18)')
  await watch.click()
  const configuration = page.locator('.aw-player-card__agent').first()
  await expect(configuration).toContainText('mock-model')
  const view = page.getByRole('button', { name: '闭眼视角', exact: true })
  const back = page.getByRole('link', { name: '返回大厅', exact: true })
  for (const target of [configuration, view, back]) {
    await target.hover()
    await expect(page.getByRole('tooltip')).toHaveCount(0)
  }
  await expect(back).toHaveCSS('filter', 'brightness(1.2)')
  await view.click()
  await expect(view).toHaveAttribute('aria-pressed', 'true')
  await back.focus()
  await expect(back).toBeFocused()
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await expect(page.locator('[title], [data-tooltip]')).toHaveCount(0)
})
