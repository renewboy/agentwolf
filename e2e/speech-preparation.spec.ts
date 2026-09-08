import { expect, test } from './fixtures/test.js'

test('moves and minimizes the notice while retaining progress and keeping expansion inside the viewport', async ({
  page,
}) => {
  let downloadedBytes = 1_250_000_000
  await page.route('**/api/speech-audio/status', (route) =>
    route.fulfill({
      json: {
        state: 'preparing',
        model: 'qwen3-tts-0.6b',
        voices: 12,
        message: null,
        progress: { stage: 'downloading', downloadedBytes, totalBytes: 2_500_000_000 },
      },
    }),
  )
  await page.goto('/')
  const notice = page.getByRole('complementary', { name: '角色语音状态' })
  const handle = notice.getByRole('button', { name: '移动语音通知，可拖动或使用方向键' })
  await expect(notice).toContainText('50%')
  const original = (await notice.boundingBox())!
  const grip = (await handle.boundingBox())!
  await page.mouse.move(grip.x + 10, grip.y + 10)
  await page.mouse.down()
  await page.mouse.move(150, 170, { steps: 6 })
  await page.mouse.up()
  const moved = (await notice.boundingBox())!
  expect(moved.x).toBeLessThan(original.x - 100)
  expect(moved.y).toBeLessThan(original.y - 100)
  await notice.getByRole('button', { name: '最小化语音通知' }).click()
  const compact = (await notice.boundingBox())!
  expect(compact.height).toBeLessThan(original.height / 2)
  await expect(notice).toContainText('语音下载中')
  downloadedBytes = 1_500_000_000
  await expect(notice).toContainText('60%')
  await page.reload()
  await expect(notice.getByRole('button', { name: '展开语音通知' })).toBeVisible()
  expect((await notice.boundingBox())!.x).toBeCloseTo(compact.x, 0)
  await page.setViewportSize({ width: 390, height: 540 })
  const lastGrip = (await handle.boundingBox())!
  await page.mouse.move(lastGrip.x + 10, lastGrip.y + 10)
  await page.mouse.down()
  await page.mouse.move(388, 535, { steps: 6 })
  await page.mouse.up()
  await notice.getByRole('button', { name: '展开语音通知' }).click()
  const expanded = (await notice.boundingBox())!
  expect(expanded.x).toBeGreaterThanOrEqual(16)
  expect(expanded.y).toBeGreaterThanOrEqual(16)
  expect(expanded.x + expanded.width).toBeLessThanOrEqual(374)
  expect(expanded.y + expanded.height).toBeLessThanOrEqual(524)
})

test('supports touch dragging without scrolling the page', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  try {
    const page = await context.newPage()
    await page.route('**/api/speech-audio/status', (route) =>
      route.fulfill({
        json: {
          state: 'loading',
          model: 'qwen3-tts-0.6b',
          voices: 12,
          message: null,
        },
      }),
    )
    await page.goto(test.info().project.use.baseURL!)
    const notice = page.getByRole('complementary', { name: '角色语音状态' })
    await notice.getByRole('button', { name: '最小化语音通知' }).tap()
    const handle = (await notice
      .getByRole('button', { name: '移动语音通知，可拖动或使用方向键' })
      .boundingBox())!
    const session = await context.newCDPSession(page)
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: handle.x + 10, y: handle.y + 10 }],
    })
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: 120, y: 200 }],
    })
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    expect((await notice.boundingBox())!.y).toBeLessThan(220)
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
  } finally {
    await context.close()
  }
})

test('announces preparation progress and completion across page navigation', async ({ page }) => {
  let state = 'downloading'
  await page.route('**/api/speech-audio/status', (route) =>
    route.fulfill({
      json: {
        state: state === 'ready' ? 'ready' : state === 'loading' ? 'loading' : 'preparing',
        model: 'qwen3-tts-0.6b',
        voices: 12,
        message: null,
        ...(state === 'downloading'
          ? {
              progress: { stage: state, downloadedBytes: 1_250_000_000, totalBytes: 2_500_000_000 },
            }
          : {}),
      },
    }),
  )
  await page.goto('/')
  const notice = page.getByRole('complementary', { name: '角色语音状态' })
  await expect(notice).toContainText('正在下载角色语音模型')
  await expect(notice).toContainText('50%')
  await expect(notice.getByRole('progressbar')).toHaveAttribute('value', '1250000000')
  await page.goto('/settings')
  await expect(notice).toContainText('50%')
  state = 'loading'
  await expect(notice).toContainText('下载已完成，正在加载角色音色')
  state = 'ready'
  await expect(notice).toContainText('角色语音已就绪')
  const readyStatus = page.waitForResponse('**/api/speech-audio/status')
  await page.reload()
  await readyStatus
  await expect(notice).toBeHidden()
})
