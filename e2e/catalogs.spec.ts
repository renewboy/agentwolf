import { resolve } from 'node:path'
import { expect, test } from './fixtures/test.js'

test('creates, edits, selects, and deletes a custom six-player board', async ({
  page,
  resources,
}) => {
  const boardName = `E2E Board ${resources.runId}`
  await page.goto('/boards')
  const roleBadges = page.locator('.aw-board-role-row .aw-role-badge')
  await expect(roleBadges).toHaveCount(11)
  expect(
    new Set(
      await roleBadges.evaluateAll((elements) =>
        elements.map((element) => getComputedStyle(element).color),
      ),
    ).size,
  ).toBe(11)
  await expect(roleBadges.filter({ hasText: '女巫' })).toHaveCSS('color', 'rgb(189, 134, 223)')
  await expect(roleBadges.filter({ hasText: '猎人' })).toHaveCSS('color', 'rgb(114, 198, 154)')
  await expect(roleBadges.filter({ hasText: '魔镜少女' })).toHaveCSS('color', 'rgb(233, 159, 208)')
  await expect(roleBadges.filter({ hasText: '白狼王' })).toHaveCSS('color', 'rgb(232, 237, 243)')
  await expect(roleBadges.filter({ hasText: '觉醒隐狼' })).toHaveCSS('color', 'rgb(207, 143, 115)')
  await expect(roleBadges.filter({ hasText: '丘比特' })).toHaveCSS('color', 'rgb(231, 143, 168)')
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
  await page.getByRole('button', { name: /12 人预女猎爱场/ }).click()
  await expect(
    page.locator('.aw-board-role-row').filter({ hasText: '丘比特' }).locator('output'),
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
  resources: _resources,
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
  resources,
}) => {
  const characterName = `E2E Character ${resources.runId}`
  const boardName = `E2E Character Board ${resources.runId}`
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
  const agentSelectors = page.getByRole('combobox', { name: /号座位默认 Agent/ })
  await agentSelectors.nth(0).click()
  await page.getByRole('option', { name: new RegExp(resources.boardProfileName) }).click()
  await agentSelectors.nth(1).click()
  await page.getByRole('option', { name: new RegExp(resources.boardProfileName) }).click()
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
  const inheritedAgents = page.getByRole('combobox', { name: 'Agent 配置' })
  await expect(inheritedAgents.nth(0)).toHaveAttribute('data-value', resources.boardProfileId)
  await expect(inheritedAgents.nth(1)).toHaveAttribute('data-value', resources.boardProfileId)
  await expect(page.getByRole('button', { name: '开始对局' })).toBeDisabled()
  await expect(seats.nth(0)).toHaveAttribute('data-duplicate-name', 'true')
  await seats.nth(1).getByRole('textbox').fill(`${characterName} B`)
  await expect(page.getByRole('button', { name: '开始对局' })).toBeEnabled()
  await expect(page.locator('select')).toHaveCount(0)

  await page.goto('/agents')
  await page
    .locator('.aw-profile-item')
    .filter({ hasText: resources.boardProfileName })
    .locator('button')
    .last()
    .click()
  await page.getByRole('button', { name: '删除配置' }).click()
  const profileDialog = page.getByRole('alertdialog', { name: '确认删除配置' })
  await profileDialog.getByRole('button', { name: '删除配置' }).click()
  await expect(page.getByText(new RegExp(`used by board ${boardName}`))).toBeVisible()
  await expect(
    page.locator('.aw-profile-item').filter({ hasText: resources.boardProfileName }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
})
