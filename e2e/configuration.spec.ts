import { expect, test } from './fixtures/test.js'

test.describe.configure({ mode: 'serial' })

test('keeps mobile configuration readable and opens tool setup in a contained dialog', async ({
  page,
  resources: _resources,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/agents')
  const editor = page.locator('.aw-agent-editor')
  await expect(page.locator('.aw-agent-library')).toBeVisible()
  await expect(editor).toBeHidden()
  await page.getByRole('button', { name: '配置详情', exact: true }).click()
  await expect(editor.getByRole('heading', { name: '配置玩家' })).toBeVisible()
  await expect(page.locator('.aw-agent-library')).toBeHidden()
  const advanced = page.locator('.aw-advanced-settings')
  await expect(advanced.getByLabel('运行模式', { exact: true })).toBeHidden()
  await advanced.locator('summary').click()
  await expect(advanced.getByLabel('运行模式', { exact: true })).toBeVisible()
  const toolButton = page.getByRole('button', { name: '新增自定义工具' })
  await toolButton.click()
  const dialog = page.getByRole('dialog', { name: '接入自定义工具' })
  await expect(dialog).toBeVisible()
  const box = await dialog.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  expect(box!.y + box!.height).toBeLessThanOrEqual(844)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(toolButton).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})

test('creates, reorders, defaults, edits, and deletes an Agent Profile', async ({
  page,
  request,
  resources,
}) => {
  const profileName = `E2E UI ${resources.runId}`
  const updatedName = `E2E UI Updated ${resources.runId}`
  const discoveryPayloads: string[] = []
  page.on('request', (browserRequest) => {
    if (browserRequest.method() === 'POST' && browserRequest.url().includes('/api/agent-tools/')) {
      discoveryPayloads.push(browserRequest.postData() ?? '')
    }
  })
  await page.goto('/agents')
  const tool = page.getByRole('combobox', { name: 'Agent 工具', exact: true })
  await tool.click()
  const toolList = page.getByRole('listbox', { name: 'Agent 工具' })
  await expect(toolList).toBeVisible()
  await toolList.getByRole('option', { name: resources.sharedToolName, exact: true }).click()
  await expect(tool).toHaveAttribute('data-value', resources.sharedToolId)
  await page.getByLabel('配置名称', { exact: true }).fill(profileName)
  const model = page.getByRole('combobox', { name: /^模型/ })
  await expect(model).toBeEnabled()
  await model.click()
  await page.getByRole('option', { name: 'mock-model', exact: true }).click()
  const reasoning = page.getByRole('combobox', { name: '推理强度' })
  await expect(reasoning).toBeEnabled()
  await reasoning.click()
  await page.getByRole('option', { name: 'low', exact: true }).click()
  expect(discoveryPayloads.filter((payload) => payload.includes('mock-model'))).toHaveLength(1)
  await page.getByRole('button', { name: '保存配置' }).click()
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  await expect(page.locator('.aw-profile-item').filter({ hasText: profileName })).toBeVisible()

  await page.getByLabel('配置名称', { exact: true }).fill(updatedName)
  await page.getByRole('button', { name: '保存配置' }).click()
  const updatedProfileRow = page.locator('.aw-profile-item').filter({ hasText: updatedName })
  const boardProfileRow = page
    .locator('.aw-profile-item')
    .filter({ hasText: resources.boardProfileName })
  await expect(updatedProfileRow).toBeVisible()
  await page.getByRole('heading', { level: 1 }).hover()
  expect(
    await updatedProfileRow.evaluate((element) => getComputedStyle(element, '::before').width),
  ).toBe('3px')
  await expect(updatedProfileRow.locator('small')).toContainText('mock-model · low')
  const nameBox = await updatedProfileRow.locator('strong').boundingBox()
  const modelBox = await updatedProfileRow.locator('small').boundingBox()
  expect(nameBox).not.toBeNull()
  expect(modelBox).not.toBeNull()
  expect(modelBox!.y).toBeGreaterThan(nameBox!.y)

  const reorderHandle = updatedProfileRow.getByRole('button', {
    name: `调整 ${updatedName} 的顺序`,
  })
  const sourceBox = await updatedProfileRow.boundingBox()
  const targetBox = await boardProfileRow.boundingBox()
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
  await expect(boardProfileRow).toHaveAttribute('data-drop-position', 'before')
  await page.mouse.up()
  await pointerOrderSaved
  const profileList = page.locator('.aw-profile-list')
  await expect(profileList).toHaveAttribute('data-reordering', 'false')
  await expect(page.locator('.aw-profile-item').nth(1)).toContainText(updatedName)

  await reorderHandle.focus()
  const initialHomeOrderSaved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/agent-profiles/order') && response.request().method() === 'PUT',
  )
  await page.keyboard.press('Home')
  await initialHomeOrderSaved
  await expect(profileList).toHaveAttribute('data-reordering', 'false')
  await expect(page.locator('.aw-profile-item').first()).toContainText(updatedName)
  const arrowOrderSaved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/agent-profiles/order') && response.request().method() === 'PUT',
  )
  await page.keyboard.press('ArrowDown')
  await arrowOrderSaved
  await expect(profileList).toHaveAttribute('data-reordering', 'false')
  await expect(page.locator('.aw-profile-item').first()).toContainText(resources.sharedProfileName)
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
    reasoningEffort?: string
  }>
  expect(orderedProfiles[0]?.name).toBe(updatedName)
  expect(orderedProfiles[0]?.reasoningEffort).toBe('low')

  await page.goto('/matches/new')
  await page.getByRole('button', { name: '确认牌组，安排玩家' }).click()
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

test('edits the shared speech preference from global settings', async ({
  page,
  request,
  resources: _resources,
}) => {
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

test('generates unique seat names and preserves the manual role multiset', async ({
  page,
  resources: _resources,
}) => {
  await page.goto('/matches/new')
  const names = page.getByLabel('玩家昵称')
  await page.getByRole('button', { name: '确认牌组，安排玩家' }).click()
  await expect(names).toHaveCount(12)
  await page.getByRole('button', { name: '选择牌组', exact: true }).click()

  await page.getByRole('button', { name: '6 人', exact: true }).click()
  await expect(page.getByRole('button', { name: /6 人快速场/ })).toHaveAttribute(
    'data-selected',
    'true',
  )
  await page.getByRole('button', { name: '确认牌组，安排玩家' }).click()
  await expect(names).toHaveCount(6)
  await page.getByRole('button', { name: '选择牌组', exact: true }).click()

  await page.getByRole('button', { name: '9 人', exact: true }).click()
  await expect(page.getByRole('button', { name: /9 人标准场/ })).toHaveAttribute(
    'data-selected',
    'true',
  )
  await page.getByRole('button', { name: '确认牌组，安排玩家' }).click()
  await expect(names).toHaveCount(9)
  await page.getByRole('button', { name: '选择牌组', exact: true }).click()

  await page.getByRole('button', { name: '12 人', exact: true }).click()
  await page.getByRole('button', { name: '确认牌组，安排玩家' }).click()
  await expect(names).toHaveCount(12)
  const before = await names.evaluateAll((elements) =>
    elements.map((element) => (element as HTMLInputElement).value),
  )
  expect(new Set(before).size).toBe(12)
  await page.getByRole('button', { name: '换一个名字' }).first().click()
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

function sorted(values: readonly string[]): string[] {
  return [...values].sort()
}

test('keeps a long Agent directory and editor in independent viewport scroll areas', async ({
  page,
  resources: _resources,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.route('**/api/agent-profiles', async (route) => {
    const response = await route.fetch()
    const profiles = (await response.json()) as Array<Record<string, unknown>>
    await route.fulfill({
      response,
      json: Array.from({ length: 36 }, (_, index) => ({
        ...profiles[0],
        id: `profile-catalog-scroll-${index}`,
        name: `目录配置 ${index + 1}`,
      })),
    })
  })
  await page.goto('/agents')
  const list = page.locator('.aw-profile-list')
  await expect(list.locator('.aw-profile-item')).toHaveCount(36)
  const footer = page.locator('.aw-agent-editor > .aw-editor-actions')
  const before = await footer.boundingBox()
  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(page.getByText('目录配置 36', { exact: true })).toBeInViewport()
  await page.locator('.aw-advanced-settings > summary').click()
  const editorScroll = page.locator('.aw-agent-editor > .aw-catalog-scroll')
  await editorScroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  expect(await editorScroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  expect(await list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  expect(await footer.boundingBox()).toEqual(before)
  await expect(footer.getByRole('button', { name: '保存配置' })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true)
  expect(
    await page
      .locator('.aw-input')
      .first()
      .evaluate((element) => getComputedStyle(element).borderImageSource),
  ).not.toBe('none')
  expect(
    await page
      .locator('.aw-game-select__trigger')
      .first()
      .evaluate((element) => getComputedStyle(element).borderImageSource),
  ).not.toBe('none')
})

test('persists visual effects preferences immediately in the browser', async ({
  page,
  resources: _resources,
}) => {
  await page.goto('/settings')
  const select = page.getByRole('combobox', { name: '技能特效' })
  await select.click()
  const selectedOption = page.getByRole('option', { selected: true })
  await expect(selectedOption).toHaveCSS('color', 'rgb(175, 44, 28)')
  await expect(selectedOption).not.toHaveCSS('background-color', 'rgb(216, 208, 187)')
  const hoveredOption = page.getByRole('option', { name: '精简', exact: true })
  const idleText = await hoveredOption.evaluate((element) => getComputedStyle(element).color)
  await hoveredOption.hover()
  await expect(hoveredOption).not.toHaveCSS('color', idleText)
  await expect(hoveredOption).toHaveCSS('color', 'rgb(175, 44, 28)')
  await expect(hoveredOption).toHaveCSS('border-image-source', 'none')
  await page.getByRole('heading', { level: 1 }).hover()
  expect(
    await selectedOption.evaluate((element) => getComputedStyle(element, '::before').width),
  ).toBe('3px')
  await page.getByRole('option', { name: '精简', exact: true }).click()
  expect(await page.evaluate(() => localStorage.getItem('agentwolf.role-effect-mode'))).toBe(
    'reduced',
  )
  await page.reload()
  await expect(select).toHaveAttribute('data-value', 'reduced')
  await select.click()
  await page.getByRole('option', { name: '关闭', exact: true }).click()
  expect(await page.evaluate(() => localStorage.getItem('agentwolf.role-effect-mode'))).toBe('off')
  await expect(page.getByRole('button', { name: '保存设置' }).locator('.aw-icon')).toHaveCount(0)
})
