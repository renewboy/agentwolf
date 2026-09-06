import type { MatchView } from '@agentwolf/contracts'
import { thinkingMatchFixture } from './fixtures/matches.js'
import { expect, test } from './fixtures/test.js'

test('guides simulation review and approval from the Match row', async ({
  page,
  resources: _resources,
}) => {
  const source = thinkingMatchFixture()
  const paused = {
    ...source,
    id: 'match-simulation-wizard-e2e',
    status: 'paused',
    day: 2,
    phaseId: 'phase-day-speech',
    phaseLabel: '对局已暂停',
    winner: null,
    seats: source.seats.map((seat) => ({
      ...seat,
      active: false,
      sessionStatus: 'closed',
    })),
  } as unknown as MatchView
  const running = {
    ...source,
    id: 'match-simulation-running-e2e',
  } as unknown as MatchView
  const ended = {
    ...paused,
    id: 'match-simulation-ended-e2e',
    status: 'ended',
    phaseLabel: '对局结束',
    winner: 'village',
  } as unknown as MatchView
  await page.route(
    (url) => url.pathname.endsWith('/api/matches'),
    (route) => route.fulfill({ json: [paused, ended, running] }),
  )
  await page.route('**/api/developer/matches/*/simulation/review', async (route) => {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 220))
    await route.fulfill({
      json: {
        simulationId: 'simulation-browser-wizard-e2e',
        relativePath: '.agentwolf/simulations/inbox/simulation-browser-wizard-e2e.sim.json',
        sourceStatus: 'paused',
        turns: 35,
        events: 180,
        deterministic: true,
        replayOk: true,
        orchestrationDeterministic: true,
        orchestrationOk: true,
        runnersAgree: true,
        canApprove: true,
        canAcceptCurrent: true,
        failures: [],
        warnings: ['trajectory-audit:review-required'],
        secretWarnings: [],
      },
    })
  })
  await page.route('**/api/developer/simulations/*/approve', async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      acceptCurrent: false,
      acknowledgeWarnings: true,
    })
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 160))
    await route.fulfill({
      json: {
        simulationId: 'simulation-browser-wizard-e2e',
        relativePath:
          'apps/server/tests/fixtures/simulations/simulation-browser-wizard-e2e.sim.json',
        created: true,
        variants: ['recorded', 'parallel-seat-order', 'parallel-reverse-order'],
      },
    })
  })

  await page.goto('/')
  const pausedRow = page.locator(`[data-match-id="${paused.id}"]`)
  const endedRow = page.locator(`[data-match-id="${ended.id}"]`)
  const runningRow = page.locator(`[data-match-id="${running.id}"]`)
  const trigger = pausedRow.getByRole('button', { name: '添加仿真' })
  await expect(trigger).toBeEnabled()
  await expect(endedRow.getByRole('button', { name: '添加仿真' })).toBeEnabled()
  await expect(runningRow.getByRole('button', { name: '添加仿真' })).toBeDisabled()
  const rowBounds = await pausedRow.boundingBox()
  const actionBounds = await pausedRow.locator('.aw-match-row__actions').boundingBox()
  expect(rowBounds).not.toBeNull()
  expect(actionBounds).not.toBeNull()
  expect((actionBounds?.x ?? 0) + (actionBounds?.width ?? 0)).toBeLessThanOrEqual(
    (rowBounds?.x ?? 0) + (rowBounds?.width ?? 0) + 1,
  )

  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '添加仿真用例' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('准备数据')).toBeVisible()
  await expect(dialog.getByText('校验行为')).toBeVisible()
  await expect(dialog.getByText('写入测试集')).toBeVisible()
  await dialog.getByRole('button', { name: '生成并开始校验' }).click()
  await expect(dialog.getByText('正在校验对局行为')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('规则引擎重放')).toBeVisible()
  await expect(dialog.getByText('服务编排重放')).toBeVisible()
  await expect(dialog.getByText('35', { exact: true })).toBeVisible()
  await expect(dialog.getByText('180', { exact: true })).toBeVisible()
  const approveButton = dialog.getByRole('button', { name: '确认写入测试集' })
  await expect(approveButton).toBeDisabled()
  await dialog.getByRole('checkbox', { name: '我已检查并确认这些审核提示' }).check()
  await expect(approveButton).toBeEnabled()
  await approveButton.click()
  await expect(dialog.getByText('正在写入正式用例')).toBeVisible()
  await expect(dialog.getByText('仿真用例已就绪')).toBeVisible()
  await expect(dialog.locator('code')).toContainText('simulation-browser-wizard-e2e.sim.json')
  await dialog.getByRole('button', { name: '完成' }).click()
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()

  await page.setViewportSize({ width: 390, height: 844 })
  await trigger.click()
  await expect(dialog).toBeVisible()
  const mobileBounds = await dialog.boundingBox()
  expect(mobileBounds).not.toBeNull()
  expect(mobileBounds?.x ?? -1).toBeGreaterThanOrEqual(0)
  expect((mobileBounds?.x ?? 0) + (mobileBounds?.width ?? 0)).toBeLessThanOrEqual(390)
  expect(mobileBounds?.y ?? -1).toBeGreaterThanOrEqual(0)
  expect((mobileBounds?.y ?? 0) + (mobileBounds?.height ?? 0)).toBeLessThanOrEqual(844)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()

  await page.setViewportSize({ width: 1440, height: 520 })
  await trigger.click()
  await dialog.getByRole('button', { name: '生成并开始校验' }).click()
  await expect(dialog.getByRole('checkbox')).toBeVisible()
  const shortLayout = await dialog.evaluate((element) => {
    const body = element.querySelector<HTMLElement>('.aw-simulation-wizard__body')!
    const footer = element.querySelector<HTMLElement>('.aw-simulation-wizard__actions')!
    return {
      bodyBottom: body.getBoundingClientRect().bottom,
      footerTop: footer.getBoundingClientRect().top,
      footerBottom: footer.getBoundingClientRect().bottom,
      bodyScrolls: body.scrollHeight > body.clientHeight,
    }
  })
  expect(shortLayout.bodyBottom).toBeLessThanOrEqual(shortLayout.footerTop + 1)
  expect(shortLayout.footerBottom).toBeLessThanOrEqual(520)
  expect(shortLayout.bodyScrolls).toBe(true)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
