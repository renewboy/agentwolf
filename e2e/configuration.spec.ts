import { expect, test } from './fixtures/test.js'

test.describe.configure({ mode: 'serial' })

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

function sorted(values: readonly string[]): string[] {
  return [...values].sort()
}
