import { resolve } from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
import type { MatchView } from '@agentwolf/contracts'

test.describe.configure({ mode: 'serial' })

const testRunId = `e2e-${Date.now().toString(36).slice(-6)}`
const sharedToolName = `E2E Mock ${testRunId}`
const sharedProfileName = `E2E Shared ${testRunId}`
let sharedToolId = ''
let sharedProfileId = ''

test.beforeAll(async ({ request }) => {
  const toolResponse = await request.post('/api/agent-tools', {
    data: {
      name: sharedToolName,
      kind: 'custom',
      command: process.execPath,
      args: [resolve('packages/acp/tests/fixtures/mock-agent.mjs')],
      environment: {},
      initialMode: 'read-only',
      modelConfigKey: 'model',
    },
  })
  expect(toolResponse.ok()).toBe(true)
  sharedToolId = ((await toolResponse.json()) as { id: string }).id
  const profileResponse = await request.post('/api/agent-profiles', {
    data: {
      name: sharedProfileName,
      toolId: sharedToolId,
      model: 'mock-model',
      promptTimeoutMs: 5000,
      connection: {},
    },
  })
  expect(profileResponse.ok()).toBe(true)
  sharedProfileId = ((await profileResponse.json()) as { id: string }).id
})

test.afterAll(async ({ request }) => {
  const matches = (await (await request.get('/api/matches')).json()) as MatchView[]
  for (const match of matches.filter((entry) =>
    entry.seats.some((seat) => seat.name.includes(testRunId)),
  )) {
    await request.delete(`/api/matches/${match.id}`)
  }
  const boards = (await (await request.get('/api/boards')).json()) as Array<{
    id: string
    name: string
    source: string
  }>
  for (const board of boards.filter(
    (entry) => entry.source === 'custom' && entry.name.includes(testRunId),
  )) {
    await request.delete(`/api/boards/${board.id}`)
  }
  const characters = (await (await request.get('/api/characters')).json()) as Array<{
    id: string
    name: string
    source: string
  }>
  for (const character of characters.filter(
    (entry) => entry.source === 'custom' && entry.name.includes(testRunId),
  )) {
    await request.delete(`/api/characters/${character.id}`)
  }
  const profiles = (await (await request.get('/api/agent-profiles')).json()) as Array<{
    id: string
    name: string
  }>
  for (const profile of profiles.filter((entry) => entry.name.includes(testRunId))) {
    await request.delete(`/api/agent-profiles/${profile.id}`)
  }
  const tools = (await (await request.get('/api/agent-tools')).json()) as Array<{
    id: string
    name: string
    builtIn: boolean
  }>
  for (const tool of tools.filter((entry) => !entry.builtIn && entry.name.includes(testRunId))) {
    await request.delete(`/api/agent-tools/${tool.id}`)
  }
})

test('creates, edits, selects, and deletes a custom six-player board', async ({ page }) => {
  const boardName = `E2E Board ${testRunId}`
  await page.goto('/boards')
  const roleBadges = page.locator('.aw-board-role-row .aw-role-badge')
  await expect(roleBadges).toHaveCount(10)
  expect(
    new Set(
      await roleBadges.evaluateAll((elements) =>
        elements.map((element) => getComputedStyle(element).color),
      ),
    ).size,
  ).toBe(10)
  await expect(roleBadges.filter({ hasText: '女巫' })).toHaveCSS('color', 'rgb(189, 134, 223)')
  await expect(roleBadges.filter({ hasText: '猎人' })).toHaveCSS('color', 'rgb(114, 198, 154)')
  await expect(roleBadges.filter({ hasText: '魔镜少女' })).toHaveCSS('color', 'rgb(233, 159, 208)')
  await expect(roleBadges.filter({ hasText: '白狼王' })).toHaveCSS('color', 'rgb(232, 237, 243)')
  await expect(roleBadges.filter({ hasText: '觉醒隐狼' })).toHaveCSS('color', 'rgb(207, 143, 115)')
  await page.getByRole('button', { name: /10 人镜隐迷踪局/ }).click()
  await expect(
    page.locator('.aw-board-role-row').filter({ hasText: '魔镜少女' }).locator('output'),
  ).toHaveText('1')
  await expect(
    page.locator('.aw-board-role-row').filter({ hasText: '觉醒隐狼' }).locator('output'),
  ).toHaveText('1')
  await page.getByRole('button', { name: /12 人白狼王场/ }).click()
  await expect(
    page.locator('.aw-board-role-row').filter({ hasText: '白狼王' }).locator('output'),
  ).toHaveText('1')
  await page.getByRole('button', { name: '新建板子' }).click()
  await page.getByLabel('板子名称').fill(boardName)
  await page.getByLabel('板子说明').fill('E2E six-player Seer and Witch board')
  for (const role of ['狼人', '狼人', '平民', '平民', '预言家', '女巫']) {
    await page.getByRole('button', { name: `增加${role}` }).click()
  }
  await expect(page.getByText('共 6 人', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '保存板子' }).click()
  await expect(page.getByText('板子已保存')).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(boardName) })).toBeVisible()

  const sheriff = page.getByRole('switch', { name: /开启警长竞选/ })
  await sheriff.click()
  await expect(sheriff).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('button', { name: '屠边' }).click()
  await page.getByRole('button', { name: '保存板子' }).click()
  await expect(page.getByText('板子已保存')).toBeVisible()

  await page.goto('/matches/new')
  await page.getByRole('button', { name: '6 人', exact: true }).click()
  const boardOption = page.getByRole('button', { name: new RegExp(boardName) })
  await expect(boardOption).toBeVisible()
  await boardOption.click()
  await expect(page.getByLabel('玩家昵称')).toHaveCount(6)

  await page.goto('/boards')
  await page.getByRole('button', { name: new RegExp(boardName) }).click()
  await page.getByRole('button', { name: '删除板子' }).click()
  const dialog = page.getByRole('alertdialog', { name: '确认删除板子' })
  await dialog.getByRole('button', { name: '删除板子' }).click()
  await expect(page.getByRole('button', { name: new RegExp(boardName) })).toBeHidden()
})

test('shows the concise Mirror Hidden preset without clipping its composition', async ({
  page,
}) => {
  await page.goto('/matches/new')
  await page.getByRole('button', { name: '10 人', exact: true }).click()
  const board = page.getByRole('button', { name: /10 人镜隐迷踪局/ })
  await expect(board).toBeVisible()
  await expect(
    board.getByText(
      '阵容：4 名平民、魔镜少女、女巫、守卫，对阵 2 名狼人和 1 名觉醒隐狼；上警屠边。',
    ),
  ).toBeVisible()
  for (const label of ['狼人×2', '觉醒隐狼×1', '平民×4', '魔镜少女×1', '女巫×1', '守卫×1']) {
    await expect(board.getByText(label, { exact: true })).toBeVisible()
  }
  expect(await board.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(board).toBeVisible()
  expect(await board.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
})

test('copies a Character, saves board defaults, and blocks duplicate Match nicknames', async ({
  page,
}) => {
  const characterName = `E2E Character ${testRunId}`
  const boardName = `E2E Character Board ${testRunId}`
  await page.goto('/collection/characters')
  await expect(page.locator('.aw-character-card')).toHaveCount(12)
  await page.getByRole('button', { name: /江户川柯南 名侦探柯南/ }).click()
  await page.getByRole('button', { name: '复制为自定义角色' }).click()
  await page.getByLabel('角色姓名', { exact: true }).fill(characterName)
  await page
    .locator('.aw-character-upload input[type="file"]')
    .setInputFiles(resolve('packages/assets/characters/portraits/mouri-ran.png'))
  await expect(page.locator('.aw-character-editor__portrait > img')).toHaveAttribute(
    'src',
    /portrait-[a-f0-9]{64}$/,
  )
  await page.getByRole('button', { name: '保存角色' }).click()
  await expect(page.getByText('角色卡已保存')).toBeVisible()

  await page.goto('/boards')
  await page.getByRole('button', { name: /6 人快速场/ }).click()
  await page.getByRole('button', { name: '基于此创建' }).click()
  await page.getByLabel('板子名称').fill(boardName)
  const characterSelectors = page.getByRole('combobox', { name: /号座位扮演角色/ })
  await characterSelectors.nth(0).click()
  await page.getByRole('option', { name: `${characterName} · 名侦探柯南`, exact: true }).click()
  await characterSelectors.nth(1).click()
  await page.getByRole('option', { name: `${characterName} · 名侦探柯南`, exact: true }).click()
  await page.getByRole('button', { name: '保存板子' }).click()
  await expect(page.getByText('板子已保存')).toBeVisible()

  await page.goto('/matches/new')
  await page.getByRole('button', { name: '6 人', exact: true }).click()
  await page.getByRole('button', { name: new RegExp(boardName) }).click()
  const seats = page.locator('.aw-seat-config')
  await expect(seats.nth(0).getByRole('textbox')).toHaveValue(characterName)
  await expect(seats.nth(1).getByRole('textbox')).toHaveValue(characterName)
  await expect(page.getByRole('button', { name: '开始对局' })).toBeDisabled()
  await expect(seats.nth(0)).toHaveAttribute('data-duplicate-name', 'true')
  await seats.nth(1).getByRole('textbox').fill(`${characterName} B`)
  await expect(page.getByRole('button', { name: '开始对局' })).toBeEnabled()
  await expect(page.locator('select')).toHaveCount(0)
})

test('creates, reorders, defaults, edits, and deletes an Agent Profile', async ({
  page,
  request,
}) => {
  const profileName = `E2E UI ${testRunId}`
  const updatedName = `E2E UI Updated ${testRunId}`
  await page.goto('/agents')
  const tool = page.getByRole('combobox', { name: 'Agent 工具', exact: true })
  await tool.click()
  const toolList = page.getByRole('listbox', { name: 'Agent 工具' })
  await expect(toolList).toBeVisible()
  await toolList.getByRole('option', { name: sharedToolName, exact: true }).click()
  await expect(tool).toHaveAttribute('data-value', sharedToolId)
  await page.getByLabel('配置名称', { exact: true }).fill(profileName)
  const model = page.getByRole('combobox', { name: /^模型/ })
  await expect(model).toBeEnabled()
  await model.click()
  await page.getByRole('option', { name: 'mock-model', exact: true }).click()
  await page.getByRole('button', { name: '保存配置' }).click()
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  await expect(page.locator('.aw-profile-item').filter({ hasText: profileName })).toBeVisible()

  await page.getByLabel('配置名称', { exact: true }).fill(updatedName)
  await page.getByRole('button', { name: '保存配置' }).click()
  const updatedProfileRow = page.locator('.aw-profile-item').filter({ hasText: updatedName })
  const sharedProfileRow = page.locator('.aw-profile-item').filter({ hasText: sharedProfileName })
  await expect(updatedProfileRow).toBeVisible()
  const nameBox = await updatedProfileRow.locator('strong').boundingBox()
  const modelBox = await updatedProfileRow.locator('small').boundingBox()
  expect(nameBox).not.toBeNull()
  expect(modelBox).not.toBeNull()
  expect(modelBox!.y).toBeGreaterThan(nameBox!.y)

  const reorderHandle = updatedProfileRow.getByRole('button', {
    name: `调整 ${updatedName} 的顺序`,
  })
  const sourceBox = await updatedProfileRow.boundingBox()
  const targetBox = await sharedProfileRow.boundingBox()
  expect(sourceBox).not.toBeNull()
  expect(targetBox).not.toBeNull()
  const pointerOrderSaved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/agent-profiles/order') && response.request().method() === 'PUT',
  )
  const dragStartX = sourceBox!.x + sourceBox!.width * 0.8
  const dragStartY = sourceBox!.y + sourceBox!.height / 2
  await page.mouse.move(dragStartX, dragStartY)
  await page.mouse.down()
  await page.mouse.move(dragStartX, dragStartY - 14, { steps: 4 })
  await expect(updatedProfileRow).toHaveAttribute('data-dragging', 'true')
  await expect(updatedProfileRow).toHaveCSS('opacity', '0.38')
  await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 4, {
    steps: 8,
  })
  await expect(sharedProfileRow).toHaveAttribute('data-drop-position', 'before')
  await page.mouse.up()
  await pointerOrderSaved
  const profileList = page.locator('.aw-profile-list')
  await expect(profileList).toHaveAttribute('data-reordering', 'false')
  await expect(page.locator('.aw-profile-item').first()).toContainText(updatedName)

  await reorderHandle.focus()
  const arrowOrderSaved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/agent-profiles/order') && response.request().method() === 'PUT',
  )
  await page.keyboard.press('ArrowDown')
  await arrowOrderSaved
  await expect(profileList).toHaveAttribute('data-reordering', 'false')
  await expect(page.locator('.aw-profile-item').first()).toContainText(sharedProfileName)
  const homeOrderSaved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/agent-profiles/order') && response.request().method() === 'PUT',
  )
  await page.keyboard.press('Home')
  await homeOrderSaved
  await expect(profileList).toHaveAttribute('data-reordering', 'false')
  await expect(page.locator('.aw-profile-item').first()).toContainText(updatedName)

  await page.reload()
  await expect(page.locator('.aw-profile-item').first()).toContainText(updatedName)
  const orderedProfiles = (await (await request.get('/api/agent-profiles')).json()) as Array<{
    id: string
    name: string
  }>
  expect(orderedProfiles[0]?.name).toBe(updatedName)

  await page.goto('/matches/new')
  const seatProfiles = page.getByRole('combobox', { name: 'Agent 配置' })
  await expect(seatProfiles).toHaveCount(12)
  expect(
    await seatProfiles.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-value')),
    ),
  ).toEqual(Array.from({ length: 12 }, () => orderedProfiles[0]!.id))
  await expect(page.getByRole('link', { name: '开发者' })).toHaveCount(0)
  await expect(page.locator('select')).toHaveCount(0)

  await page.goto('/agents')
  await page
    .locator('.aw-profile-item')
    .filter({ hasText: updatedName })
    .locator('button')
    .last()
    .click()
  const deleteButton = page.getByRole('button', { name: '删除配置' })
  await deleteButton.click()
  const dialog = page.getByRole('alertdialog', { name: '确认删除配置' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(deleteButton).toBeFocused()
  await deleteButton.click()
  await dialog.getByRole('button', { name: '删除配置' }).click()
  await expect(page.locator('.aw-profile-item').filter({ hasText: updatedName })).toBeHidden()
})

test('edits the shared speech preference from global settings', async ({ page, request }) => {
  const original = (await (await request.get('/api/settings')).json()) as {
    speechCharacterLimit: number
  }
  try {
    await page.goto('/settings')
    const input = page.getByLabel('建议发言字数')
    await expect(input).toHaveValue(String(original.speechCharacterLimit))
    await input.fill('360')
    await page.getByRole('button', { name: '保存设置' }).click()
    await expect(page.getByText('全局设置已保存。')).toBeVisible()
    expect((await (await request.get('/api/settings')).json()).speechCharacterLimit).toBe(360)
  } finally {
    await request.put('/api/settings', { data: original })
  }
})

test('generates unique seat names and preserves the manual role multiset', async ({ page }) => {
  await page.goto('/matches/new')
  const names = page.getByLabel('玩家昵称')
  await expect(names).toHaveCount(12)

  await page.getByRole('button', { name: '6 人', exact: true }).click()
  await expect(page.getByRole('button', { name: /6 人快速场/ })).toHaveAttribute(
    'data-selected',
    'true',
  )
  await expect(names).toHaveCount(6)

  await page.getByRole('button', { name: '9 人', exact: true }).click()
  await expect(page.getByRole('button', { name: /9 人标准场/ })).toHaveAttribute(
    'data-selected',
    'true',
  )
  await expect(names).toHaveCount(9)

  await page.getByRole('button', { name: '12 人', exact: true }).click()
  await expect(names).toHaveCount(12)
  const before = await names.evaluateAll((elements) =>
    elements.map((element) => (element as HTMLInputElement).value),
  )
  expect(new Set(before).size).toBe(12)
  await page.getByTitle('换一个名字').first().click()
  const after = await names.evaluateAll((elements) =>
    elements.map((element) => (element as HTMLInputElement).value),
  )
  expect(after[0]).not.toBe(before[0])
  expect(new Set(after).size).toBe(12)

  await page.getByRole('button', { name: '指定身份' }).click()
  const roles = page.getByRole('combobox', { name: '身份牌' })
  await expect(roles).toHaveCount(12)
  const beforeRoles = await roles.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-value') ?? ''),
  )
  const targetRole = beforeRoles[0] === 'role-villager' ? '狼人' : '平民'
  await roles.first().click()
  await page.getByRole('option', { name: targetRole, exact: true }).click()
  const afterRoles = await roles.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-value') ?? ''),
  )
  expect(sorted(afterRoles)).toEqual(sorted(beforeRoles))
  await expect(page.locator('select')).toHaveCount(0)
})

test('projects god, closed-eye, and player spectator views from the server', async ({
  page,
  request,
}) => {
  const matchResponse = await request.post('/api/matches', {
    data: {
      boardId: 'board-standard-12',
      roleAssignment: 'random',
      seats: Array.from({ length: 12 }, (_, index) => ({
        seat: index + 1,
        name: `${testRunId}-projection-${index + 1}`,
        profileId: sharedProfileId,
      })),
    },
  })
  expect(matchResponse.ok()).toBe(true)
  const match = (await matchResponse.json()) as { id: string }
  await page.goto(`/matches/${match.id}`)
  await expect(page.getByRole('heading', { name: '事件时间线' })).toBeVisible()
  const roleLabels = page.locator('.aw-stage-grid > .aw-player-rail .aw-player-card__role')
  await expect(roleLabels).toHaveCount(12)
  await expect(page.locator('.aw-stage-grid > .aw-player-rail .aw-player-card__model')).toHaveText(
    Array.from({ length: 12 }, () => '模型 · mock-model'),
  )
  expect(
    (await roleLabels.allTextContents()).filter((value) => value !== '身份未公开'),
  ).toHaveLength(12)
  await expect(roleLabels.filter({ hasText: '女巫' })).toHaveCSS('color', 'rgb(189, 134, 223)')
  await expect(roleLabels.filter({ hasText: '猎人' })).toHaveCSS('color', 'rgb(114, 198, 154)')

  await page.getByRole('button', { name: '闭眼视角' }).click()
  await expect(roleLabels).toHaveText(Array.from({ length: 12 }, () => '身份未公开'))
  expect(
    await roleLabels.evaluateAll((elements) =>
      elements.map((element) => element.dataset['roleId']),
    ),
  ).toEqual(Array.from({ length: 12 }, () => 'hidden'))

  await page.getByRole('button', { name: '玩家视角' }).click()
  await expect(page.getByLabel('选择玩家视角')).toBeVisible()
  await expect
    .poll(
      async () =>
        (await roleLabels.allTextContents()).filter((value) => value !== '身份未公开').length,
    )
    .toBeGreaterThanOrEqual(1)
  const visibleRoles = (await roleLabels.allTextContents()).filter(
    (value) => value !== '身份未公开',
  )
  expect(visibleRoles.length).toBeGreaterThanOrEqual(1)
  expect(visibleRoles.length).toBeLessThanOrEqual(4)
})

test('guides simulation review and approval from the Match row', async ({ page }) => {
  const source = thinkingMatchFixture()
  const ended: MatchView = {
    ...source,
    id: 'match-simulation-wizard-e2e',
    status: 'ended',
    day: 2,
    phaseId: 'phase-match-ended',
    phaseLabel: '对局结束',
    winner: 'village',
    seats: source.seats.map((seat) => ({
      ...seat,
      active: false,
      sessionStatus: 'closed',
    })),
  }
  const running: MatchView = {
    ...source,
    id: 'match-simulation-running-e2e',
  }
  await page.route(
    (url) => url.pathname.endsWith('/api/matches'),
    (route) => route.fulfill({ json: [ended, running] }),
  )
  await page.route('**/api/developer/matches/*/simulation/review', async (route) => {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 220))
    await route.fulfill({
      json: {
        simulationId: 'simulation-browser-wizard-e2e',
        relativePath: '.agentwolf/simulations/inbox/simulation-browser-wizard-e2e.sim.json',
        sourceStatus: 'ended',
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
  const endedRow = page.locator(`[data-match-id="${ended.id}"]`)
  const runningRow = page.locator(`[data-match-id="${running.id}"]`)
  const trigger = endedRow.getByRole('button', { name: '添加仿真' })
  await expect(trigger).toBeEnabled()
  await expect(runningRow.getByRole('button', { name: '添加仿真' })).toBeDisabled()
  const rowBounds = await endedRow.boundingBox()
  const actionBounds = await endedRow.locator('.aw-match-row__actions').boundingBox()
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
}) => {
  const createdResponse = await request.post('/api/matches', {
    data: {
      boardId: 'board-quick-6',
      roleAssignment: 'random',
      seats: Array.from({ length: 6 }, (_, index) => ({
        seat: index + 1,
        name: `${testRunId}-trajectory-${index + 1}`,
        profileId: sharedProfileId,
      })),
    },
  })
  expect(createdResponse.ok()).toBe(true)
  const match = (await createdResponse.json()) as { id: string }
  expect((await request.post(`/api/matches/${match.id}/start`)).ok()).toBe(true)
  await expect
    .poll(async () => {
      const response = await request.get(`/api/developer/matches/${match.id}/trajectory/summary`)
      if (!response.ok()) return 0
      const summary = (await response.json()) as {
        owners: Array<{ ownerId: string; turnCount: number }>
      }
      return summary.owners.find((owner) => owner.ownerId === 'player-1')?.turnCount ?? 0
    })
    .toBeGreaterThan(0)
  await expect
    .poll(async () => {
      const response = await request.get(`/api/matches/${match.id}?view=god`)
      return ((await response.json()) as MatchView).status
    })
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
  await expect(page.getByText('上下文审计通过')).toBeVisible()
  await expect(page.getByRole('button', { name: '添加仿真' })).toHaveCount(0)
  const firstOwner = page.locator('.aw-trajectory-owner').filter({ hasText: '1号玩家' })
  await expect(firstOwner).toContainText(`${testRunId}-trajectory-1`)
  await expect(firstOwner).toContainText('模型：mock-model')
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
  await expect(page.getByRole('button', { name: /提示词/ }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /思考/ }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /工具调用/ }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /上下文用量/ }).first()).toBeVisible()
  await expect(page.locator('.aw-trajectory-kind-tag[data-kind="prompt"]').first()).toHaveCSS(
    'background-color',
    'rgb(121, 169, 220)',
  )
  const firstPromptNode = page.locator('.aw-trajectory-minimap__node[data-kind="prompt"]').first()
  await firstPromptNode.click()
  await expect(page.locator('.aw-trajectory-record[data-selected="true"]')).toContainText(
    '注入提示词',
  )
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
  await page.getByRole('link', { name: '切换到游戏主界面' }).click()
  await expect(page).toHaveURL(new RegExp(`/matches/${match.id}$`))
  await expect(page.getByRole('heading', { name: '对局已暂停' })).toBeVisible()
  await expect(page.getByRole('link', { name: '切换到玩家行动轨迹' })).toHaveCount(0)
})

test('keeps the match viewport fixed and animates a real thinking state', async ({ page }) => {
  const match = thinkingMatchFixture()
  const closedEyeMatch = closedEyeFixture(match)
  await page.route('**/api/runtime-config', async (route) =>
    route.fulfill({ json: { developerMode: false } }),
  )
  await page.route(`**/api/matches/${match.id}?*`, async (route) => {
    const requestedView = new URL(route.request().url()).searchParams.get('view')
    if (requestedView === 'closed-eye') {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 350))
    }
    await route.fulfill({ json: requestedView === 'closed-eye' ? closedEyeMatch : match })
  })
  await page.routeWebSocket('**/live?*', (socket) => {
    const initialKind = new URL(socket.url()).searchParams.get('view')
    const sendSnapshot = (kind: string): void => {
      socket.send(
        JSON.stringify({
          type: 'snapshot',
          view: { kind: kind === 'closed-eye' ? 'closed-eye' : 'god' },
          data: kind === 'closed-eye' ? closedEyeMatch : match,
        }),
      )
    }
    setTimeout(() => sendSnapshot(initialKind ?? 'god'), initialKind === 'closed-eye' ? 420 : 30)
    socket.onMessage((value) => {
      const message = JSON.parse(String(value)) as { type: string; view?: { kind: string } }
      if (message.type === 'view.set' && message.view) {
        setTimeout(() => sendSnapshot(message.view!.kind), 350)
      }
    })
  })

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/matches/${match.id}`)
  const shell = page.locator('.aw-match-shell')
  await expect(shell).toHaveAttribute('data-presence-state', 'thinking')
  await expect(page.getByRole('link', { name: '切换到玩家行动轨迹' })).toHaveCount(0)
  const rightCardAlignment = await page
    .locator('.aw-stage-grid > .aw-player-rail--right .aw-player-card')
    .first()
    .evaluate((element) => {
      const copyBox = element
        .querySelector<HTMLElement>('.aw-player-card__copy')!
        .getBoundingClientRect()
      const roleBox = element
        .querySelector<HTMLElement>('.aw-player-card__role')!
        .getBoundingClientRect()
      const nameBox = element
        .querySelector<HTMLElement>('.aw-player-card__name-row strong')!
        .getBoundingClientRect()
      const statusBox = element
        .querySelector<HTMLElement>('.aw-player-card__status')!
        .getBoundingClientRect()
      return {
        nameRightGap: Math.abs(copyBox.right - nameBox.right),
        roleRightGap: Math.abs(copyBox.right - roleBox.right),
        statusRightGap: Math.abs(copyBox.right - statusBox.right),
      }
    })
  expect(rightCardAlignment.nameRightGap).toBeLessThanOrEqual(1)
  expect(rightCardAlignment.roleRightGap).toBeLessThanOrEqual(1)
  expect(rightCardAlignment.statusRightGap).toBeLessThanOrEqual(1)
  const leftCardAlignment = await page
    .locator('.aw-stage-grid > .aw-player-rail--left .aw-player-card')
    .first()
    .evaluate((element) => {
      const copyBox = element
        .querySelector<HTMLElement>('.aw-player-card__copy')!
        .getBoundingClientRect()
      const roleBox = element
        .querySelector<HTMLElement>('.aw-player-card__role')!
        .getBoundingClientRect()
      const nameBox = element
        .querySelector<HTMLElement>('.aw-player-card__name-row strong')!
        .getBoundingClientRect()
      const statusBox = element
        .querySelector<HTMLElement>('.aw-player-card__status')!
        .getBoundingClientRect()
      const modelBox = element
        .querySelector<HTMLElement>('.aw-player-card__model')!
        .getBoundingClientRect()
      const cardBox = element.getBoundingClientRect()
      return {
        nameLeftGap: Math.abs(copyBox.left - nameBox.left),
        roleLeftGap: Math.abs(copyBox.left - roleBox.left),
        statusLeftGap: Math.abs(copyBox.left - statusBox.left),
        modelLeftGap: Math.abs(cardBox.left + 12 - modelBox.left),
      }
    })
  expect(leftCardAlignment.nameLeftGap).toBeLessThanOrEqual(1)
  expect(leftCardAlignment.roleLeftGap).toBeLessThanOrEqual(1)
  expect(leftCardAlignment.statusLeftGap).toBeLessThanOrEqual(1)
  expect(leftCardAlignment.modelLeftGap).toBeLessThanOrEqual(1)
  const ring = page
    .locator('.aw-stage-grid .aw-player-card[data-session="thinking"] .aw-player-avatar__ring')
    .first()
  const transformBefore = await ring.evaluate((element) => getComputedStyle(element).transform)
  await page.waitForTimeout(320)
  const transformAfter = await ring.evaluate((element) => getComputedStyle(element).transform)
  expect(transformAfter).not.toBe(transformBefore)

  const desktopMetrics = await page.evaluate(() => {
    const feed = document.querySelector<HTMLElement>('.aw-feed-scroll')
    if (!feed) throw new Error('Missing feed scroller')
    return {
      documentHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      windowScrollY: window.scrollY,
      feedHeight: feed.clientHeight,
      feedScrollHeight: feed.scrollHeight,
    }
  })
  expect(desktopMetrics.documentHeight).toBe(desktopMetrics.viewportHeight)
  expect(desktopMetrics.windowScrollY).toBe(0)
  expect(desktopMetrics.feedScrollHeight).toBeGreaterThan(desktopMetrics.feedHeight)

  const feed = page.locator('.aw-feed-scroll')
  await feed.evaluate((element) => {
    element.scrollTop = 0
  })
  await feed.hover()
  await page.mouse.wheel(0, 480)
  await expect.poll(() => feed.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.aw-mobile-roster')).toBeVisible()
  await expect(page.getByRole('button', { name: '语音播报已关闭' })).toBeVisible()
  const mobileMetrics = await page.evaluate(() => ({
    documentHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
    windowScrollY: window.scrollY,
  }))
  expect(mobileMetrics.documentHeight).toBe(mobileMetrics.viewportHeight)
  expect(mobileMetrics.windowScrollY).toBe(0)

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('button', { name: '闭眼视角' }).click()
  await expect(page.locator('.aw-projection-veil')).toBeVisible()
  await expect(page.locator('.aw-stage-grid')).toHaveAttribute('aria-hidden', 'true')
  await expect(page.locator('.aw-projection-veil')).toBeHidden()
  await expect(page.locator('.aw-stage-grid > .aw-player-rail .aw-player-card__role')).toHaveText(
    Array.from({ length: 6 }, () => '身份未公开'),
  )

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await expect(page.locator('.aw-match-shell')).toHaveAttribute('data-presence-state', 'thinking')
  const reducedRing = page
    .locator('.aw-stage-grid .aw-player-card[data-session="thinking"] .aw-player-avatar__ring')
    .first()
  const reducedBefore = await reducedRing.evaluate((element) => getComputedStyle(element).transform)
  await page.waitForTimeout(320)
  const reducedAfter = await reducedRing.evaluate((element) => getComputedStyle(element).transform)
  expect(reducedAfter).toBe(reducedBefore)
  await expect(page.getByText('测试玩家6正在思考')).toBeVisible()
})

test('identifies the Sheriff while daytime speech order is pending', async ({ page }) => {
  const base = thinkingMatchFixture()
  const deciding = {
    ...base,
    id: 'match-sheriff-speech-order-presence-test',
    phaseId: 'phase-day-speech-order',
    phaseLabel: '确定发言顺序',
    activeSpeech: null,
    seats: base.seats.map((seat, index) => ({
      ...seat,
      active: false,
      sessionStatus: index === 1 ? 'thinking' : 'ready',
    })),
  } as MatchView
  let current = deciding
  let sendSnapshot: ((match: MatchView) => void) | null = null
  await page.route(`**/api/matches/${deciding.id}?*`, async (route) =>
    route.fulfill({ json: current }),
  )
  await page.routeWebSocket('**/live?*', (socket) => {
    sendSnapshot = (match) =>
      socket.send(JSON.stringify({ type: 'snapshot', view: { kind: 'god' }, data: match }))
    sendSnapshot(deciding)
  })

  await page.goto(`/matches/${deciding.id}`)
  await expect(page.getByText('2 号警长 测试玩家2正在决定发言顺序')).toBeVisible()

  current = {
    ...deciding,
    seats: deciding.seats.map((seat) => ({ ...seat, sessionStatus: 'ready' })),
  } as MatchView
  sendSnapshot?.(current)
  await expect(page.getByText('等待 2 号警长 测试玩家2决定发言顺序')).toBeVisible()
})

test('plays visible role-effect cues once and respects reduced and off modes', async ({ page }) => {
  const base = {
    ...thinkingMatchFixture(),
    id: 'match-role-effect-test',
    phaseId: 'phase-sheriff-speech',
    phaseLabel: '警上发言',
    lastSequence: 30,
    effectCues: [],
    seats: thinkingMatchFixture().seats.map((seat, index) => ({
      ...seat,
      sheriffCandidate: index === 0,
    })),
  } as MatchView
  let sendSnapshot: ((match: MatchView) => void) | null = null
  await page.route(`**/api/matches/${base.id}?*`, async (route) => route.fulfill({ json: base }))
  await page.routeWebSocket('**/live?*', (socket) => {
    if (!socket.url().includes(base.id)) return
    sendSnapshot = (match) =>
      socket.send(JSON.stringify({ type: 'snapshot', view: { kind: 'god' }, data: match }))
    sendSnapshot(base)
  })
  await page.goto(`/matches/${base.id}`)
  await expect(
    page.locator('.aw-stage-grid .aw-player-card[data-player-id="player-1"]').first(),
  ).toContainText('上警')
  const effectSelect = page.getByRole('combobox', { name: '技能特效' })
  await effectSelect.click()
  await page.getByRole('option', { name: '完整', exact: true }).click()

  const cue = {
    cueId: '31:sheriff-elected',
    sequence: 31,
    effectId: 'sheriff-elected',
    roleId: null,
    abilityId: null,
    sourcePlayerIds: [],
    targetPlayerIds: ['player-1'],
    variant: null,
    tier: 'large',
    occurredAt: '2026-08-23T00:00:02.000Z',
  } as const
  sendSnapshot?.({ ...base, lastSequence: 31, effectCues: [cue] } as MatchView)
  const overlay = page.locator('.aw-role-effect-overlay')
  await expect(overlay).toHaveAttribute('data-effect', 'sheriff-elected')
  await expect(
    page.locator('.aw-stage-grid .aw-player-card[data-player-id="player-1"]').first(),
  ).toHaveAttribute('data-role-effect', 'sheriff-elected')
  await expect(overlay).toBeHidden({ timeout: 2_000 })

  await effectSelect.click()
  await page.getByRole('option', { name: '精简', exact: true }).click()
  const stage = page.locator('.aw-stage-grid')
  const before = await stage.evaluate((element) => getComputedStyle(element).transform)
  sendSnapshot?.({
    ...base,
    lastSequence: 32,
    effectCues: [
      {
        ...cue,
        cueId: '32:sheriff-transferred',
        sequence: 32,
        effectId: 'sheriff-transferred',
        sourcePlayerIds: ['player-1'],
        targetPlayerIds: ['player-2'],
      },
    ],
  } as MatchView)
  await expect(overlay).toHaveAttribute('data-effect', 'sheriff-transferred')
  await page.waitForTimeout(180)
  expect(await stage.evaluate((element) => getComputedStyle(element).transform)).toBe(before)
  await expect(overlay).toBeHidden({ timeout: 2_000 })

  await effectSelect.click()
  await page.getByRole('option', { name: '关闭', exact: true }).click()
  sendSnapshot?.({
    ...base,
    lastSequence: 33,
    effectCues: [{ ...cue, cueId: '33:sheriff-elected', sequence: 33 }],
  } as MatchView)
  await page.waitForTimeout(250)
  await expect(overlay).toHaveCount(0)
})

test('renders a private night phase through its generic projection', async ({ page }) => {
  const match = {
    ...thinkingMatchFixture(),
    id: 'match-private-night-phase-test',
    phaseId: 'phase-night-hidden',
    phaseLabel: '夜间行动',
  } as MatchView
  await page.route(`**/api/matches/${match.id}?*`, async (route) => route.fulfill({ json: match }))
  await page.routeWebSocket('**/live?*', (socket) => {
    if (!socket.url().includes(match.id)) return
    socket.send(JSON.stringify({ type: 'snapshot', view: { kind: 'closed-eye' }, data: match }))
  })

  await page.goto(`/matches/${match.id}`)
  await expect(page.locator('.aw-phase-title')).toHaveText('夜间行动')
  await expect(page.getByText('觉醒隐狼行动', { exact: true })).toHaveCount(0)
})

test('starts narration at sentence boundaries and only appends the committed tail', async ({
  page,
}) => {
  await installSpeechSynthesisStub(page)
  const initial = {
    ...thinkingMatchFixture(),
    id: 'match-streamed-speech-playback-test',
    activeSpeech: null,
  } as MatchView
  let current = initial
  let sendLive: (message: unknown) => void = ignoreLiveMessage
  const clientMessages: Array<Record<string, unknown>> = []
  await page.route(`**/api/matches/${initial.id}?*`, async (route) =>
    route.fulfill({ json: current }),
  )
  await page.routeWebSocket('**/live?*', (socket) => {
    sendLive = (message) => socket.send(JSON.stringify(message))
    sendLive({ type: 'snapshot', view: { kind: 'god' }, data: current })
    sendLive({
      type: 'speech-playback.state',
      state: { enabled: false, controlledByThisClient: false, pendingSequence: null },
    })
    socket.onMessage((value) => {
      const message = JSON.parse(String(value)) as Record<string, unknown>
      clientMessages.push(message)
      if (message['type'] === 'speech-playback.set' && message['enabled'] === true) {
        sendLive({
          type: 'speech-playback.state',
          state: { enabled: true, controlledByThisClient: true, pendingSequence: null },
        })
      }
    })
  })

  await page.goto(`/matches/${initial.id}`)
  await page.getByRole('button', { name: '语音播报已关闭' }).click()
  await expect(page.getByRole('button', { name: '语音播报已开启' })).toBeVisible()
  sendLive({
    type: 'speech-chunk',
    matchId: initial.id,
    playerId: 'player-1',
    text: '第一句',
  })
  await page.waitForTimeout(50)
  expect(await speechStubState(page, 'spoken')).toEqual([])
  sendLive({
    type: 'speech-chunk',
    matchId: initial.id,
    playerId: 'player-1',
    text: '。第二句',
  })
  await expect.poll(async () => speechStubState(page, 'spoken')).toEqual(['第一句。'])
  await finishSpeech(page)

  current = {
    ...current,
    activeSpeech: { playerId: 'player-1', text: '第一句。第二句', final: true },
    timeline: [...current.timeline, speechTimelineItem(31, 'player-1', '第一句。第二句')],
  }
  sendLive({ type: 'snapshot', view: { kind: 'god' }, data: current })
  sendLive({
    type: 'speech-playback.state',
    state: { enabled: true, controlledByThisClient: true, pendingSequence: 31 },
  })
  await expect.poll(async () => speechStubState(page, 'spoken')).toEqual(['第一句。', '第二句'])
  await finishSpeech(page)
  await expect
    .poll(() =>
      clientMessages.some(
        (message) =>
          message['type'] === 'speech-playback.resolve' &&
          message['sequence'] === 31 &&
          message['outcome'] === 'completed',
      ),
    )
    .toBe(true)
  expect(await speechStubState(page, 'spoken')).not.toContain('第一句。第二句')
})

test('keeps skip available across speaker handoff and suppresses later chunks after skip', async ({
  page,
}) => {
  await installSpeechSynthesisStub(page)
  const initial = {
    ...thinkingMatchFixture(),
    id: 'match-streamed-speech-skip-handoff-test',
    activeSpeech: null,
  } as MatchView
  let current = initial
  let sendLive: (message: unknown) => void = ignoreLiveMessage
  const clientMessages: Array<Record<string, unknown>> = []
  await page.route(`**/api/matches/${initial.id}?*`, async (route) =>
    route.fulfill({ json: current }),
  )
  await page.routeWebSocket('**/live?*', (socket) => {
    sendLive = (message) => socket.send(JSON.stringify(message))
    sendLive({ type: 'snapshot', view: { kind: 'god' }, data: current })
    sendLive({
      type: 'speech-playback.state',
      state: { enabled: false, controlledByThisClient: false, pendingSequence: null },
    })
    socket.onMessage((value) => {
      const message = JSON.parse(String(value)) as Record<string, unknown>
      clientMessages.push(message)
      if (message['type'] === 'speech-playback.set' && message['enabled'] === true) {
        sendLive({
          type: 'speech-playback.state',
          state: { enabled: true, controlledByThisClient: true, pendingSequence: null },
        })
      }
    })
  })

  await page.goto(`/matches/${initial.id}`)
  await page.getByRole('button', { name: '语音播报已关闭' }).click()
  sendLive({
    type: 'speech-chunk',
    matchId: initial.id,
    playerId: 'player-1',
    text: '第一位已经开始播报。',
  })
  const firstSkip = page.getByRole('button', {
    name: '1 号玩家 测试玩家1：跳过自动播报',
  })
  await expect(firstSkip).toBeVisible()
  await expect.poll(async () => speechStubState(page, 'spoken')).toEqual(['第一位已经开始播报。'])

  current = {
    ...current,
    lastSequence: 31,
    activeSpeech: { playerId: 'player-2', text: '', final: false },
    timeline: [...current.timeline, speechTimelineItem(31, 'player-1', '第一位已经开始播报。')],
  }
  sendLive({ type: 'snapshot', view: { kind: 'god' }, data: current })
  sendLive({
    type: 'speech-chunk',
    matchId: initial.id,
    playerId: 'player-2',
    text: '第二位正在生成。',
  })
  const committedFirst = page.locator('.aw-speech-bubble[data-sequence="31"]')
  await expect(committedFirst.getByRole('button', { name: /跳过自动播报/ })).toBeVisible()
  await committedFirst.getByRole('button', { name: /跳过自动播报/ }).click()

  await expect
    .poll(async () => speechStubState(page, 'spoken'))
    .toEqual(['第一位已经开始播报。', '第二位正在生成。'])
  const secondSkip = page.getByRole('button', {
    name: '2 号玩家 测试玩家2：跳过自动播报',
  })
  await expect(secondSkip).toBeVisible()
  await secondSkip.click()
  sendLive({
    type: 'speech-chunk',
    matchId: initial.id,
    playerId: 'player-2',
    text: '后续句子。',
  })
  await page.waitForTimeout(100)
  expect(await speechStubState(page, 'spoken')).toEqual([
    '第一位已经开始播报。',
    '第二位正在生成。',
  ])

  current = {
    ...current,
    lastSequence: 32,
    activeSpeech: {
      playerId: 'player-2',
      text: '第二位正在生成。后续句子。',
      final: true,
    },
    timeline: [
      ...current.timeline,
      speechTimelineItem(32, 'player-2', '第二位正在生成。后续句子。'),
    ],
  }
  sendLive({ type: 'snapshot', view: { kind: 'god' }, data: current })
  sendLive({
    type: 'speech-playback.state',
    state: { enabled: true, controlledByThisClient: true, pendingSequence: 32 },
  })
  await expect
    .poll(() =>
      clientMessages.some(
        (message) =>
          message['type'] === 'speech-playback.resolve' &&
          message['sequence'] === 32 &&
          message['outcome'] === 'skipped',
      ),
    )
    .toBe(true)
})

test('shows sealed vote progress without a thinking spinner and groups ballots by seat', async ({
  page,
}) => {
  const match = votingMatchFixture()
  await page.route(`**/api/matches/${match.id}?*`, async (route) => route.fulfill({ json: match }))
  await page.routeWebSocket('**/live?*', (socket) => {
    socket.send(JSON.stringify({ type: 'snapshot', view: { kind: 'god' }, data: match }))
  })

  await page.goto(`/matches/${match.id}`)
  const shell = page.locator('.aw-match-shell')
  await expect(shell).toHaveAttribute('data-presence-state', 'awaiting-actions')
  await expect(page.getByText('等待玩家提交投票', { exact: true })).toBeVisible()
  await expect(
    page.locator('.aw-stage-grid .aw-player-card[data-player-id="player-1"]'),
  ).toContainText('已提交')
  const votingPlayer = page.locator('.aw-stage-grid .aw-player-card[data-player-id="player-6"]')
  await expect(votingPlayer).toContainText('投票中')

  const orb = page.locator('.aw-presence__orb')
  const ring = votingPlayer.locator('.aw-player-avatar__ring')
  const signal = page.locator('.aw-presence__signal')
  const motionBefore = await Promise.all([
    orb.evaluate((element) => getComputedStyle(element).transform),
    ring.evaluate((element) => getComputedStyle(element).transform),
    signal.evaluate(
      (element) => `${getComputedStyle(element).transform}:${getComputedStyle(element).opacity}`,
    ),
  ])
  await page.waitForTimeout(360)
  const motionAfter = await Promise.all([
    orb.evaluate((element) => getComputedStyle(element).transform),
    ring.evaluate((element) => getComputedStyle(element).transform),
    signal.evaluate(
      (element) => `${getComputedStyle(element).transform}:${getComputedStyle(element).opacity}`,
    ),
  ])
  expect(motionAfter[0]).toBe(motionBefore[0])
  expect(motionAfter[1]).toBe(motionBefore[1])
  expect(motionAfter[2]).not.toBe(motionBefore[2])

  const voteResult = page.locator('.aw-vote-result')
  await expect(voteResult).toContainText('投票结算：1号、4号同为3票。')
  await expect(voteResult.locator('.aw-vote-result__detail > span')).toHaveText([
    '投1号：2号、3号、4号',
    '投4号：1号、5号、6号',
  ])
  await expect(voteResult).not.toContainText('测试玩家')
})

test('shows private wolf ballots in god and Werewolf player views only', async ({ page }) => {
  const source = thinkingMatchFixture()
  const wolfVote = {
    sequence: 31,
    kind: 'vote.resolved',
    title: '狼人投票平票：3号、4号、空刀同为1票，随机选择3号作为袭击目标。',
    detail: '投3号：1号\n投4号：2号\n空刀：3号',
    playerIds: ['player-1', 'player-2', 'player-4', 'player-3'],
    occurredAt: '2026-08-23T00:00:01.000Z',
  } as MatchView['timeline'][number]
  const base = {
    ...source,
    id: 'match-private-wolf-ballot-test',
    phaseId: 'phase-night-witch',
    phaseLabel: '女巫行动',
    timeline: [source.timeline[0]!, wolfVote],
    seats: source.seats.map((seat, index) => ({
      ...seat,
      roleId: index < 2 ? 'role-werewolf' : 'role-villager',
      roleName: index < 2 ? '狼人' : '平民',
      faction: index < 2 ? 'werewolf' : 'village',
      active: false,
      sessionStatus: 'ready',
    })),
  } as MatchView
  const projection = (view: { kind: string; playerId?: string }): MatchView => ({
    ...base,
    timeline:
      view.kind === 'god' ||
      (view.kind === 'player' && ['player-1', 'player-2'].includes(view.playerId ?? ''))
        ? base.timeline
        : [base.timeline[0]!],
  })
  await page.route(`**/api/matches/${base.id}?*`, async (route) => {
    const url = new URL(route.request().url())
    await route.fulfill({
      json: projection({
        kind: url.searchParams.get('view') ?? 'god',
        playerId: url.searchParams.get('playerId') ?? undefined,
      }),
    })
  })
  await page.routeWebSocket('**/live?*', (socket) => {
    if (!socket.url().includes(base.id)) return
    const sendSnapshot = (view: { kind: string; playerId?: string }): void => {
      socket.send(JSON.stringify({ type: 'snapshot', view, data: projection(view) }))
    }
    const url = new URL(socket.url())
    sendSnapshot({
      kind: url.searchParams.get('view') ?? 'god',
      playerId: url.searchParams.get('playerId') ?? undefined,
    })
    socket.onMessage((value) => {
      const message = JSON.parse(String(value)) as {
        type: string
        view?: { kind: string; playerId?: string }
      }
      if (message.type === 'view.set' && message.view) sendSnapshot(message.view)
    })
  })

  await page.goto(`/matches/${base.id}`)
  const privateVote = page.getByText(/狼人投票平票/)
  await expect(privateVote).toBeVisible()
  await expect(page.locator('.aw-vote-result__detail > span')).toHaveText([
    '投3号：1号',
    '投4号：2号',
    '空刀：3号',
  ])

  await page.getByRole('button', { name: '闭眼视角' }).click()
  await expect(privateVote).toBeHidden()
  await page.getByRole('button', { name: '玩家视角' }).click()
  await expect(privateVote).toBeVisible()
  const playerSelect = page.getByRole('combobox', { name: '选择玩家视角' })
  await playerSelect.click()
  await page.getByRole('option', { name: '4 号玩家 测试玩家4', exact: true }).click()
  await expect(privateVote).toBeHidden()
  await playerSelect.click()
  await page.getByRole('option', { name: '2 号玩家 测试玩家2', exact: true }).click()
  await expect(privateVote).toBeVisible()
  await page.getByRole('button', { name: '上帝视角' }).click()
  await expect(privateVote).toBeVisible()
})

test('plays every speech by sequence and keeps manual controls independent from phase pacing', async ({
  page,
}) => {
  await installSpeechSynthesisStub(page)
  const initial = {
    ...thinkingMatchFixture(),
    id: 'match-speech-playback-test',
    phaseId: 'phase-day-speech',
    phaseLabel: '白天发言',
    activeSpeech: null,
    seats: thinkingMatchFixture().seats.map((seat) => ({
      ...seat,
      active: false,
      sessionStatus: 'ready',
    })),
  } as MatchView
  let current = initial
  let sendLive: (message: unknown) => void = ignoreLiveMessage
  const clientMessages: Array<Record<string, unknown>> = []
  await page.route(`**/api/matches/${initial.id}?*`, async (route) =>
    route.fulfill({ json: current }),
  )
  await page.routeWebSocket('**/live?*', (socket) => {
    sendLive = (message) => socket.send(JSON.stringify(message))
    sendLive({ type: 'snapshot', view: { kind: 'god' }, data: current })
    sendLive({
      type: 'speech-playback.state',
      state: { enabled: false, controlledByThisClient: false, pendingSequence: null },
    })
    socket.onMessage((value) => {
      const message = JSON.parse(String(value)) as Record<string, unknown>
      clientMessages.push(message)
      if (message['type'] === 'speech-playback.set' && message['enabled'] === true) {
        sendLive({
          type: 'speech-playback.state',
          state: { enabled: true, controlledByThisClient: true, pendingSequence: null },
        })
      }
      if (message['type'] === 'speech-playback.resolve') {
        sendLive({
          type: 'speech-playback.state',
          state: { enabled: true, controlledByThisClient: true, pendingSequence: null },
        })
        if (message['sequence'] === 32) {
          current = { ...current, phaseId: 'phase-day-vote', phaseLabel: '白天投票' }
          sendLive({ type: 'snapshot', view: { kind: 'god' }, data: current })
        }
      }
    })
  })

  await page.goto(`/matches/${initial.id}`)
  const manualPlay = page.getByRole('button', { name: /播放这段发言/ }).first()
  await manualPlay.click()
  await expect(page.getByRole('button', { name: /停止播放/ })).toBeVisible()
  expect(await speechStubState(page, 'spoken')).toHaveLength(1)
  await page.getByRole('button', { name: /停止播放/ }).click()
  expect(clientMessages.some((message) => message['type'] === 'speech-playback.resolve')).toBe(
    false,
  )

  await page.getByRole('button', { name: '语音播报已关闭' }).click()
  await expect(page.getByRole('button', { name: '语音播报已开启' })).toBeVisible()
  const repeatedSpeech = '相同文本也必须按事件序号分别播报。'
  current = {
    ...current,
    timeline: [
      ...current.timeline,
      speechTimelineItem(31, 'player-1', repeatedSpeech),
      speechTimelineItem(32, 'player-2', repeatedSpeech),
    ],
  }
  sendLive({ type: 'snapshot', view: { kind: 'god' }, data: current })
  sendLive({
    type: 'speech-playback.state',
    state: { enabled: true, controlledByThisClient: true, pendingSequence: 32 },
  })

  const skip = page.getByRole('button', { name: /跳过自动播报/ })
  await expect(skip).toBeVisible()
  await expect(page.getByRole('button', { name: /播放这段发言/ }).first()).toBeDisabled()
  await skip.click()
  await expect.poll(async () => (await speechStubState(page, 'spoken')).length).toBe(3)
  expect((await speechStubState(page, 'spoken')).slice(-2)).toEqual([
    repeatedSpeech,
    repeatedSpeech,
  ])
  expect(
    clientMessages.some(
      (message) => message['type'] === 'speech-playback.resolve' && message['sequence'] === 31,
    ),
  ).toBe(false)
  await finishSpeech(page)
  await expect
    .poll(() =>
      clientMessages.some(
        (message) =>
          message['type'] === 'speech-playback.resolve' &&
          message['sequence'] === 32 &&
          message['outcome'] === 'completed',
      ),
    )
    .toBe(true)
  await expect(page.locator('.aw-phase-title')).toHaveText('白天投票')

  current = {
    ...current,
    phaseId: 'phase-day-runoff-speech',
    phaseLabel: '放逐平票发言',
    timeline: [...current.timeline, speechTimelineItem(33, 'player-3', '这段模拟播报失败。')],
  }
  sendLive({ type: 'snapshot', view: { kind: 'god' }, data: current })
  sendLive({
    type: 'speech-playback.state',
    state: { enabled: true, controlledByThisClient: true, pendingSequence: 33 },
  })
  await expect(page.getByRole('button', { name: /跳过自动播报/ })).toBeVisible()
  await failSpeech(page)
  await expect(page.getByText('语音播报失败，已跳过当前发言')).toBeVisible()
  await expect
    .poll(() =>
      clientMessages.some(
        (message) =>
          message['type'] === 'speech-playback.resolve' &&
          message['sequence'] === 33 &&
          message['outcome'] === 'skipped',
      ),
    )
    .toBe(true)
})

test('settles ended matches and stops polling a missing match', async ({ page }) => {
  const runningMatch = {
    ...thinkingMatchFixture(),
    id: 'match-ended-stable-test',
  } as MatchView
  const endedMatch = {
    ...runningMatch,
    id: 'match-ended-stable-test',
    status: 'ended',
    phaseId: 'phase-match-ended',
    phaseLabel: '对局结束',
    winner: 'village',
    seats: thinkingMatchFixture().seats.map((seat) => ({
      ...seat,
      sessionStatus: 'closed',
    })),
  } as MatchView
  let socketCount = 0
  await page.route(`**/api/matches/${endedMatch.id}?*`, async (route) =>
    route.fulfill({ json: runningMatch }),
  )
  await page.routeWebSocket('**/live?*', async (socket) => {
    if (!socket.url().includes(endedMatch.id)) {
      await socket.close()
      return
    }
    socketCount += 1
    socket.send(JSON.stringify({ type: 'snapshot', view: { kind: 'god' }, data: runningMatch }))
    setTimeout(() => {
      socket.send(JSON.stringify({ type: 'snapshot', view: { kind: 'god' }, data: endedMatch }))
      void socket.close()
    }, 1_200)
  })
  await page.goto(`/matches/${endedMatch.id}`)
  await expect(page.locator('.aw-match-shell')).toHaveAttribute('data-presence-state', 'thinking')
  const previouslyThinkingRing = page.locator(
    '.aw-stage-grid .aw-player-card[data-player-id="player-6"] .aw-player-avatar__ring',
  )
  const movingTransform = await previouslyThinkingRing.evaluate(
    (element) => getComputedStyle(element).transform,
  )
  await page.waitForTimeout(180)
  expect(
    await previouslyThinkingRing.evaluate((element) => getComputedStyle(element).transform),
  ).not.toBe(movingTransform)
  await expect(page.locator('.aw-match-shell')).toHaveAttribute('data-presence-state', 'ended')
  await expect(page.locator('.aw-connection-indicator')).toContainText('对局记录已完整同步')
  await expect(page.locator('.aw-stage-grid .aw-player-card__role')).toHaveText(
    endedMatch.seats.map((seat) => seat.roleName ?? '身份未公开'),
  )
  const settledTransform = await previouslyThinkingRing.evaluate(
    (element) => getComputedStyle(element).transform,
  )
  await page.waitForTimeout(360)
  expect(
    await previouslyThinkingRing.evaluate((element) => getComputedStyle(element).transform),
  ).toBe(settledTransform)
  const settledSocketCount = socketCount
  await page.waitForTimeout(600)
  expect(socketCount).toBe(settledSocketCount)

  const missingId = 'match-missing-stable-test'
  let missingGets = 0
  page.on('request', (request) => {
    if (request.method() === 'GET' && request.url().includes(`/api/matches/${missingId}?`)) {
      missingGets += 1
    }
  })
  await page.goto(`/matches/${missingId}`)
  await expect(page.getByText('这场对局不存在或已经删除')).toBeVisible()
  const settledGetCount = missingGets
  await page.waitForTimeout(900)
  expect(missingGets).toBe(settledGetCount)
})

test('offers recovery controls and deletes a paused match', async ({ page, request }) => {
  const createdResponse = await request.post('/api/matches', {
    data: {
      boardId: 'board-quick-6',
      roleAssignment: 'random',
      seats: Array.from({ length: 6 }, (_, index) => ({
        seat: index + 1,
        name: `${testRunId}-paused-${index + 1}`,
        profileId: sharedProfileId,
      })),
    },
  })
  expect(createdResponse.ok()).toBe(true)
  const created = (await createdResponse.json()) as { id: string }
  expect((await request.post(`/api/matches/${created.id}/start`)).ok()).toBe(true)
  await expect
    .poll(
      async () =>
        (
          (await (await request.get(`/api/matches/${created.id}?view=god`)).json()) as {
            status: string
          }
        ).status,
      { timeout: 15_000 },
    )
    .toBe('paused')

  await page.goto(`/matches/${created.id}`)
  await expect(page.getByRole('button', { name: '继续对局' })).toBeVisible()
  await page.getByRole('button', { name: '删除对局' }).click()
  const dialog = page.getByRole('alertdialog', { name: '确认删除对局' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '删除对局' }).click()
  await expect(page).toHaveURL('/')
  const matches = (await (await request.get('/api/matches')).json()) as Array<{ id: string }>
  expect(matches.some((match) => match.id === created.id)).toBe(false)
})

async function installSpeechSynthesisStub(page: Page): Promise<void> {
  await page.addInitScript(() => {
    class StubUtterance extends EventTarget {
      public readonly text: string
      public lang = ''
      public rate = 1

      public constructor(text: string) {
        super()
        this.text = text
      }
    }
    const state: { active: StubUtterance | null; spoken: string[] } = {
      active: null,
      spoken: [],
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: StubUtterance,
    })
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel: () => {
          state.active = null
        },
        speak: (utterance: StubUtterance) => {
          state.active = utterance
          state.spoken.push(utterance.text)
        },
      },
    })
    Object.defineProperty(window, 'speechTest', {
      configurable: true,
      value: {
        spoken: state.spoken,
        finish: () => {
          const active = state.active
          state.active = null
          active?.dispatchEvent(new Event('end'))
        },
        fail: () => {
          const active = state.active
          state.active = null
          active?.dispatchEvent(new Event('error'))
        },
      },
    })
  })
}

async function speechStubState(page: Page, _key: 'spoken'): Promise<string[]> {
  return page.evaluate(() => [
    ...(window as unknown as { speechTest: { spoken: string[] } }).speechTest.spoken,
  ])
}

async function expectTooltip(locator: Locator, label: string): Promise<void> {
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

async function finishSpeech(page: Page): Promise<void> {
  await page.evaluate(() =>
    (window as unknown as { speechTest: { finish: () => void } }).speechTest.finish(),
  )
}

async function failSpeech(page: Page): Promise<void> {
  await page.evaluate(() =>
    (window as unknown as { speechTest: { fail: () => void } }).speechTest.fail(),
  )
}

function ignoreLiveMessage(_message: unknown): void {}

function speechTimelineItem(sequence: number, playerId: string, text: string) {
  return {
    sequence,
    kind: 'speech.committed',
    title: text,
    playerIds: [playerId],
    occurredAt: '2026-08-23T00:00:00.000Z',
  } as MatchView['timeline'][number]
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort()
}

function thinkingMatchFixture(): MatchView {
  const occurredAt = '2026-08-23T00:00:00.000Z'
  const seats = Array.from({ length: 6 }, (_, index) => ({
    playerId: `player-${index + 1}`,
    seat: index + 1,
    name: `测试玩家${index + 1}`,
    model: 'mock-model',
    alive: true,
    canVote: true,
    sheriff: index === 1,
    active: index === 5,
    roleId: index === 5 ? 'role-werewolf' : 'role-villager',
    roleName: index === 5 ? '狼人' : '平民',
    faction: index === 5 ? 'werewolf' : 'village',
    sessionStatus: index === 5 ? 'thinking' : 'ready',
  }))
  const timeline = [
    {
      sequence: 1,
      kind: 'night.started',
      title: '第 1 夜开始',
      playerIds: [],
      occurredAt,
    },
    ...Array.from({ length: 28 }, (_, index) => ({
      sequence: index + 2,
      kind: 'speech.committed',
      title: `这是第 ${index + 1} 条用于验证独立滚动区域的测试发言。`,
      playerIds: [`player-${(index % 6) + 1}`],
      occurredAt,
    })),
    {
      sequence: 30,
      kind: 'vote.resolved',
      title: '投票结算：1号、4号同为3票。',
      detail: '投1号：2号、3号、4号\n投4号：1号、5号、6号',
      playerIds: ['player-1', 'player-4'],
      occurredAt,
    },
  ]
  return {
    id: 'match-layout-motion-test',
    boardId: 'board-quick-6',
    boardName: '6 人快速场',
    status: 'running',
    day: 1,
    phaseId: 'phase-day-speech',
    phaseLabel: '白天发言',
    seats,
    timeline,
    activeSpeech: null,
    winner: null,
    pausedReason: null,
  } as MatchView
}

function votingMatchFixture(): MatchView {
  const match = thinkingMatchFixture()
  return {
    ...match,
    id: 'match-vote-progress-test',
    phaseId: 'phase-day-vote',
    phaseLabel: '放逐投票',
    seats: match.seats.map((seat, index) => ({
      ...seat,
      active: false,
      sessionStatus: index === 0 ? 'submitted' : index === 5 ? 'thinking' : 'ready',
    })),
  }
}

function closedEyeFixture(match: MatchView): MatchView {
  return {
    ...match,
    seats: match.seats.map((seat) => {
      const { roleId: _roleId, roleName: _roleName, faction: _faction, ...publicSeat } = seat
      return { ...publicSeat, sessionStatus: 'idle' }
    }),
  }
}
