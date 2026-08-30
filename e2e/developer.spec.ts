import type { MatchView } from '@agentwolf/contracts'
import { thinkingMatchFixture } from './fixtures/matches.js'
import { expect, test } from './fixtures/test.js'
import { expectTooltip } from './fixtures/ui.js'

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
  await page.route(
    (url) => url.pathname.endsWith('/api/matches'),
    (route) => route.fulfill({ json: [paused, running] }),
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
  const runningRow = page.locator(`[data-match-id="${running.id}"]`)
  const trigger = pausedRow.getByRole('button', { name: '添加仿真' })
  await expect(trigger).toBeEnabled()
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
})

test('streams a normalized developer trajectory with prompt, reasoning, tool, and usage details', async ({
  page,
  request,
  resources,
}) => {
  test.setTimeout(60_000)
  const createdResponse = await request.post('/api/matches', {
    data: {
      boardId: 'board-quick-6',
      roleAssignment: 'random',
      seats: Array.from({ length: 6 }, (_, index) => ({
        seat: index + 1,
        name: `${resources.runId}-trajectory-${index + 1}`,
        profileId: resources.sharedProfileId,
      })),
    },
  })
  expect(createdResponse.ok()).toBe(true)
  const match = (await createdResponse.json()) as { id: string }
  expect((await request.post(`/api/matches/${match.id}/start`)).ok()).toBe(true)
  await expect
    .poll(
      async () => {
        const response = await request.get(`/api/developer/matches/${match.id}/trajectory/summary`)
        if (!response.ok()) return 0
        const summary = (await response.json()) as {
          owners: Array<{ ownerId: string; turnCount: number }>
        }
        return summary.owners.find((owner) => owner.ownerId === 'player-1')?.turnCount ?? 0
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0)
  await expect
    .poll(
      async () => {
        const response = await request.get(`/api/matches/${match.id}?view=god`)
        return ((await response.json()) as MatchView).status
      },
      { timeout: 20_000 },
    )
    .toBe('paused')

  const matchSnapshot = (await (
    await request.get(`/api/matches/${match.id}?view=god`)
  ).json()) as MatchView
  const firstSeat = matchSnapshot.seats.find((seat) => seat.seat === 1)!
  await page.goto(`/matches/${match.id}`)
  const matchRole = page
    .locator('.aw-stage-grid .aw-player-card[data-player-id="player-1"] .aw-role-badge')
    .first()
  await expect(matchRole).toHaveAttribute('data-role-id', firstSeat.roleId!)
  const matchRoleColor = await matchRole.evaluate((element) => getComputedStyle(element).color)
  await expect(page.getByRole('heading', { name: '对局已暂停' })).toBeVisible()
  await expect(page.getByRole('link', { name: '切换到玩家行动轨迹' })).toHaveCount(0)

  await page.goto('/')
  const matchRow = page.locator(`[data-match-id="${match.id}"]`)
  await expect(matchRow).toBeVisible()
  const auditSummary = (await (
    await request.get(`/api/developer/matches/${match.id}/trajectory/summary`)
  ).json()) as {
    turns: Array<{
      turnId: string
      ownerId: string
      ordinal: number
      usage: { used: number } | null
    }>
  }
  const auditTurn = auditSummary.turns.findLast(
    (turn) => turn.ownerId === 'player-1' && turn.usage !== null,
  )!
  await page.route(`**/api/developer/matches/${match.id}/trajectory/audit`, async (route) =>
    route.fulfill({
      json: {
        matchId: match.id,
        ok: false,
        auditedTurns: auditSummary.turns.length,
        issues: [
          {
            turnId: auditTurn.turnId,
            code: 'context-budget-exceeded',
            detail: 'Bootstrap context used 13925 tokens; budget is 12000',
          },
        ],
      },
    }),
  )
  await matchRow.getByRole('link', { name: '查看轨迹' }).click()
  await expect(page).toHaveURL(new RegExp(`/matches/${match.id}/trajectory$`))
  const trajectoryNavigation = page.locator('.aw-developer-navigation')
  const trajectoryBack = trajectoryNavigation.getByRole('link', { name: '返回大厅' })
  await expect(trajectoryBack).toBeVisible()
  await expectTooltip(trajectoryBack, '返回大厅')
  const matchSwitch = page.getByRole('link', { name: '切换到游戏主界面' })
  await expect(matchSwitch).toBeVisible()
  await expect(matchSwitch).toHaveCSS(
    'color',
    await trajectoryBack.evaluate((element) => getComputedStyle(element).color),
  )
  await expectTooltip(matchSwitch, '切换到游戏主界面')
  await expect(page.getByRole('combobox', { name: '选择对局' })).toHaveCount(0)
  const firstOwner = page.locator('.aw-trajectory-owner').filter({ hasText: '1号玩家' })
  const auditOrb = page.getByRole('button', { name: '审计：1 个问题' })
  await expect(auditOrb).toBeVisible()
  await expect(auditOrb.locator('span')).toHaveCount(0)
  const auditOrbBounds = await auditOrb.boundingBox()
  expect(auditOrbBounds).not.toBeNull()
  await page.mouse.move(
    (auditOrbBounds?.x ?? 0) + (auditOrbBounds?.width ?? 0) / 2,
    (auditOrbBounds?.y ?? 0) + (auditOrbBounds?.height ?? 0) / 2,
  )
  await page.mouse.down()
  await page.mouse.move(280, (auditOrbBounds?.y ?? 0) + 24, { steps: 8 })
  await page.mouse.up()
  await expect(page.getByRole('dialog', { name: '上下文审计' })).toHaveCount(0)
  await expect
    .poll(async () => (await auditOrb.boundingBox())?.x ?? Number.POSITIVE_INFINITY)
    .toBeGreaterThan(240)
  await expect
    .poll(async () => (await auditOrb.boundingBox())?.x ?? Number.NEGATIVE_INFINITY)
    .toBeLessThan(260)
  await page.reload()
  await expect(auditOrb).toBeVisible()
  await expect
    .poll(async () => (await auditOrb.boundingBox())?.x ?? Number.POSITIVE_INFINITY)
    .toBeGreaterThan(240)
  await expect
    .poll(async () => (await auditOrb.boundingBox())?.x ?? Number.NEGATIVE_INFINITY)
    .toBeLessThan(260)
  await auditOrb.click()
  const auditDialog = page.getByRole('dialog', { name: '上下文审计' })
  await expect(auditDialog).toBeVisible()
  await expect(auditDialog).toContainText('context-budget-exceeded')
  await expect(auditDialog).toContainText('Bootstrap context used 13925 tokens; budget is 12000')
  await expect(auditDialog).toContainText(auditTurn.turnId)
  await expect(auditDialog).toContainText(
    `1号玩家 · ${resources.runId}-trajectory-1 · 模型调用 #${auditTurn.ordinal}`,
  )
  await page.keyboard.press('Escape')
  await expect(auditDialog).toBeHidden()
  await expect(auditOrb).toBeFocused()
  await auditOrb.click()
  await auditDialog.getByRole('button', { name: '定位轨迹' }).click()
  await expect(auditDialog).toBeHidden()
  await expect(firstOwner).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('tab', { name: '记录详情' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.aw-trajectory-record[data-selected="true"]')).toContainText(
    '上下文用量',
  )
  await expect(page.getByRole('button', { name: '添加仿真' })).toHaveCount(0)
  await expect(firstOwner).toContainText(`${resources.runId}-trajectory-1`)
  await expect(firstOwner).toContainText(
    `${resources.sharedToolName} · mock-model · 跟随 Agent 默认`,
  )
  await expect(firstOwner.locator('.aw-trajectory-owner__avatar')).toHaveCount(0)
  const trajectoryRole = firstOwner.locator('.aw-role-badge')
  await expect(trajectoryRole).toHaveAttribute('data-role-id', firstSeat.roleId!)
  await expect(trajectoryRole).toContainText(firstSeat.roleName!)
  const ownerHeadingAlignment = await firstOwner.evaluate((element) => {
    const heading = element.querySelector<HTMLElement>('.aw-trajectory-owner__heading')!
    const label = heading.querySelector<HTMLElement>(':scope > span')!
    const role = heading.querySelector<HTMLElement>('.aw-role-badge')!
    const headingBox = heading.getBoundingClientRect()
    const labelBox = label.getBoundingClientRect()
    const roleBox = role.getBoundingClientRect()
    return {
      roleRightGap: Math.abs(headingBox.right - roleBox.right),
      rowCenterGap: Math.abs(
        labelBox.top + labelBox.height / 2 - (roleBox.top + roleBox.height / 2),
      ),
    }
  })
  expect(ownerHeadingAlignment.roleRightGap).toBeLessThanOrEqual(1)
  expect(ownerHeadingAlignment.rowCenterGap).toBeLessThanOrEqual(1)
  expect(await trajectoryRole.evaluate((element) => getComputedStyle(element).color)).toBe(
    matchRoleColor,
  )
  await expect(firstOwner).not.toContainText('回合')
  await firstOwner.click()
  const playerTab = page.getByRole('tab', { name: '玩家配置' })
  const recordTab = page.getByRole('tab', { name: '记录详情' })
  await expect(playerTab).toHaveAttribute('aria-selected', 'true')
  const firstDebug = (await (
    await request.get(`/api/developer/matches/${match.id}/trajectory/players/player-1`)
  ).json()) as {
    session: { id: string }
    launch: { command: string }
    context: { peakUsed: number }
  }
  await expect(page.getByRole('tabpanel', { name: '玩家配置' })).toContainText(
    firstDebug.session.id,
  )
  await expect(page.getByRole('tabpanel', { name: '玩家配置' })).toContainText(
    firstDebug.launch.command,
  )
  await playerTab.press('ArrowRight')
  await expect(recordTab).toHaveAttribute('aria-selected', 'true')
  await recordTab.press('ArrowLeft')
  await expect(playerTab).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('button', { name: /提示词/ }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /思考/ }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /工具调用/ }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /上下文用量/ }).first()).toBeVisible()
  const firstRecordTime = page.locator('.aw-trajectory-record time').first()
  await expect(firstRecordTime).toHaveAttribute(
    'datetime',
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u,
  )
  await expect(firstRecordTime).toHaveText(/^\d{2}:\d{2}:\d{2}\.\d{3}$/u)
  const trajectoryColumnWidths = await page.locator('.aw-trajectory-layout').evaluate((layout) => {
    const ledger = layout.querySelector<HTMLElement>('.aw-trajectory-ledger')!
    const inspector = layout.querySelector<HTMLElement>('.aw-trajectory-inspector')!
    return {
      ledger: ledger.getBoundingClientRect().width,
      inspector: inspector.getBoundingClientRect().width,
    }
  })
  expect(trajectoryColumnWidths.inspector).toBeGreaterThan(320)
  expect(trajectoryColumnWidths.inspector).toBeLessThan(340)
  expect(trajectoryColumnWidths.ledger).toBeGreaterThan(trajectoryColumnWidths.inspector * 1.9)
  await page.setViewportSize({ width: 2048, height: 1080 })
  const wideTrajectoryColumnWidths = await page
    .locator('.aw-trajectory-layout')
    .evaluate((layout) => {
      const ledger = layout.querySelector<HTMLElement>('.aw-trajectory-ledger')!
      const inspector = layout.querySelector<HTMLElement>('.aw-trajectory-inspector')!
      return {
        ledger: ledger.getBoundingClientRect().width,
        inspector: inspector.getBoundingClientRect().width,
      }
    })
  expect(wideTrajectoryColumnWidths.inspector).toBeGreaterThan(530)
  expect(wideTrajectoryColumnWidths.inspector).toBeLessThan(535)
  expect(wideTrajectoryColumnWidths.ledger).toBeGreaterThan(
    wideTrajectoryColumnWidths.inspector * 2,
  )
  await expect(page.locator('.aw-trajectory-kind-tag[data-kind="prompt"]').first()).toHaveCSS(
    'background-color',
    'rgb(121, 169, 220)',
  )
  const firstPromptNode = page.locator('.aw-trajectory-minimap__node[data-kind="prompt"]').first()
  await firstPromptNode.click()
  await expect(recordTab).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.aw-trajectory-record[data-selected="true"]')).toContainText(
    '注入提示词',
  )
  await expect(page.getByRole('tabpanel', { name: '记录详情' })).toContainText('时间')
  const viewportMetrics = await page.evaluate(() => ({
    bodyHeight: document.body.scrollHeight,
    viewportHeight: window.innerHeight,
    scrollY: window.scrollY,
  }))
  expect(viewportMetrics.scrollY).toBe(0)
  expect(viewportMetrics.bodyHeight).toBeLessThanOrEqual(viewportMetrics.viewportHeight + 1)

  await page.route(
    `**/api/developer/matches/${match.id}/trajectory?ownerId=player-2`,
    async (route) => {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 300))
      await route.continue()
    },
  )
  const secondOwner = page.locator('.aw-trajectory-owner').filter({ hasText: '2号玩家' })
  await secondOwner.click()
  await expect(playerTab).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.aw-trajectory-layout')).toBeVisible()
  await expect(page.locator('.aw-trajectory-ledger')).toHaveAttribute('aria-busy', 'true')
  await expect(page.locator('.aw-trajectory-ledger')).toHaveAttribute('aria-busy', 'false')
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  await firstOwner.click()
  await expect(firstOwner).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: /第 1 回合/ })).toHaveCount(0)
  const setupGroup = page.getByRole('button', { name: /开局/ }).first()
  await expect(setupGroup).toHaveAttribute('aria-expanded', 'true')
  await setupGroup.click()
  await expect(setupGroup).toHaveAttribute('aria-expanded', 'false')
  await setupGroup.click()
  await page.getByRole('textbox', { name: '搜索当前轨迹' }).fill('Player ID')
  await page
    .getByRole('button', { name: /提示词/ })
    .first()
    .click()
  await expect(page.locator('.aw-trajectory-detail-block pre')).toContainText('当前身份')
  await expect(page.locator('.aw-trajectory-detail-block pre')).toContainText('Player ID')
  await page.setViewportSize({ width: 390, height: 844 })
  await auditOrb.click()
  await expect(auditDialog).toBeVisible()
  const auditDialogBounds = await auditDialog.boundingBox()
  expect(auditDialogBounds).not.toBeNull()
  expect(auditDialogBounds?.x ?? -1).toBeGreaterThanOrEqual(0)
  expect((auditDialogBounds?.x ?? 0) + (auditDialogBounds?.width ?? 0)).toBeLessThanOrEqual(390)
  expect(auditDialogBounds?.y ?? -1).toBeGreaterThanOrEqual(0)
  expect((auditDialogBounds?.y ?? 0) + (auditDialogBounds?.height ?? 0)).toBeLessThanOrEqual(844)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.keyboard.press('Escape')
  await expect(auditDialog).toBeHidden()
  await page.getByRole('link', { name: '切换到游戏主界面' }).click()
  await expect(page).toHaveURL(new RegExp(`/matches/${match.id}$`))
  await expect(page.getByRole('heading', { name: '对局已暂停' })).toBeVisible()
  await expect(page.getByRole('link', { name: '切换到玩家行动轨迹' })).toHaveCount(0)
})
