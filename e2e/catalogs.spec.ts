import { resolve } from 'node:path'
import type { CharacterId } from '@agentwolf/contracts'
import { expect, test } from './fixtures/test.js'

test('creates, edits, selects, and deletes a custom six-player board', async ({
  page,
  resources,
}) => {
  const boardName = `E2E Board ${resources.runId}`
  await page.goto('/boards')
  await expect(page.locator('.aw-board-overview')).toBeVisible()
  await expect(page.getByLabel('板型名称')).toHaveCount(0)
  await page.getByRole('button', { name: /10 人镜隐迷踪局/ }).click()
  await expect(
    page.locator('.aw-board-role-card').filter({ hasText: '魔镜少女' }).locator('strong'),
  ).toHaveText('1')
  await expect(
    page.locator('.aw-board-role-card').filter({ hasText: '觉醒隐狼' }).locator('strong'),
  ).toHaveText('1')
  await page.getByRole('button', { name: /12 人白狼王场/ }).click()
  await expect(
    page.locator('.aw-board-role-card').filter({ hasText: '白狼王' }).locator('strong'),
  ).toHaveText('1')
  await page.getByRole('button', { name: /12 人预女猎爱场/ }).click()
  await expect(
    page.locator('.aw-board-role-card').filter({ hasText: '丘比特' }).locator('strong'),
  ).toHaveText('1')
  await page.getByRole('button', { name: /12 人盗丘场/ }).click()
  await expect(
    page.locator('.aw-board-role-card').filter({ hasText: '盗贼' }).locator('strong'),
  ).toHaveText('1')
  await expect(page.locator('.aw-board-facts dd')).toHaveText(['12', '14', '2'])
  await page.getByRole('button', { name: '新建板型' }).click()
  const roleBadges = page.locator('.aw-board-role-row .aw-role-badge')
  await expect(roleBadges).toHaveCount(12)
  expect(
    new Set(
      await roleBadges.evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('data-role-id')),
      ),
    ).size,
  ).toBe(12)
  await page.getByLabel('板型名称').fill(boardName)
  await page.getByLabel('板型说明').fill('E2E six-player Seer and Witch board')
  for (const role of ['狼人', '狼人', '平民', '平民', '预言家', '女巫']) {
    await page.getByRole('button', { name: `增加${role}` }).click()
  }
  await expect(page.getByText('6 张牌 · 6 个席位', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '保存板型' }).click()
  await expect(page.getByText('板型已保存')).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(boardName) })).toBeVisible()

  await page.getByRole('button', { name: '编辑板型' }).click()
  const sheriff = page.getByRole('switch', { name: /开启警长竞选/ })
  await sheriff.click()
  await expect(sheriff).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('button', { name: '屠边' }).click()
  await page.getByRole('button', { name: '保存板型' }).click()
  await expect(page.getByText('板型已保存')).toBeVisible()

  await page.goto('/matches/new')
  await page.getByRole('button', { name: '6 人', exact: true }).click()
  const boardOption = page.getByRole('button', { name: new RegExp(boardName) })
  await expect(boardOption).toBeVisible()
  await boardOption.click()
  await page.getByRole('button', { name: '确认牌组，安排玩家' }).click()
  await expect(page.getByLabel('玩家昵称')).toHaveCount(6)

  await page.goto('/boards')
  await page.getByRole('button', { name: new RegExp(boardName) }).click()
  await page.getByRole('button', { name: '删除板型' }).click()
  const dialog = page.getByRole('alertdialog', { name: '确认删除板型' })
  await dialog.getByRole('button', { name: '删除板型' }).click()
  await expect(page.getByRole('button', { name: new RegExp(boardName) })).toBeHidden()
})

test('shows the concise Mirror Hidden preset without clipping its composition', async ({
  page,
  resources: _resources,
}, testInfo) => {
  await page.goto('/matches/new')
  const count = page.getByRole('button', { name: '10 人', exact: true })
  await expect(count).toHaveCSS('border-image-source', /engraved-frame/u)
  await count.hover()
  await expect(count).toHaveCSS('color', 'rgb(246, 237, 216)')
  await expect(count).toHaveCSS('border-image-source', /engraved-frame/u)
  expect(await count.evaluate((element) => getComputedStyle(element, '::before').content)).toBe(
    'none',
  )
  await count.click()
  await expect(count).toHaveCSS('color', 'rgb(48, 45, 37)')
  await expect(count).toHaveCSS('background-image', /rice-paper/u)
  await expect(count).toHaveCSS('border-image-source', /engraved-frame/u)
  expect(await count.evaluate((element) => getComputedStyle(element, '::before').content)).toBe(
    'none',
  )
  const countSize = await count.boundingBox()
  expect(countSize!.width).toBe(88)
  expect(countSize!.height).toBe(64)
  await page
    .locator('.aw-setup-counts')
    .screenshot({ path: testInfo.outputPath('agentwolf-count-choices.png') })
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
  await page.getByRole('heading', { level: 1 }).hover()
  expect(
    await page
      .locator('.aw-character-card[data-selected="true"]')
      .evaluate((element) => getComputedStyle(element, '::before').width),
  ).toBe('3px')
  const copiedCharacterResponse = page.waitForResponse((response) => {
    const path = new URL(response.url()).pathname
    return response.request().method() === 'POST' && /\/api\/characters\/[^/]+\/copy$/u.test(path)
  })
  await page.getByRole('button', { name: '复制为自定义角色' }).click()
  const response = await copiedCharacterResponse
  expect(response.ok()).toBe(true)
  const copiedCharacter = (await response.json()) as { readonly id: CharacterId }
  resources.trackCharacter(copiedCharacter.id)
  await page.getByLabel('角色姓名', { exact: true }).fill(characterName)
  await page
    .locator('.aw-character-upload input[type="file"]')
    .setInputFiles(resolve('packages/assets/characters/portraits/mouri-ran.png'))
  await expect(page.locator('.aw-character-portrait-preview__image')).toHaveAttribute(
    'src',
    /portrait-[a-f0-9]{64}$/,
  )
  await page.getByRole('button', { name: '保存角色' }).click()
  await expect(page.getByText('角色卡已保存')).toBeVisible()

  await page.goto('/boards')
  await page.getByRole('button', { name: /6 人快速场/ }).click()
  await page.getByRole('button', { name: '基于此创建' }).click()
  await page.getByLabel('板型名称').fill(boardName)
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
  await page.getByRole('button', { name: '保存板型' }).click()
  await expect(page.getByText('板型已保存')).toBeVisible()

  await page.goto('/matches/new')
  await page.getByRole('button', { name: '6 人', exact: true }).click()
  await page.getByRole('button', { name: new RegExp(boardName) }).click()
  await page.getByRole('button', { name: '确认牌组，安排玩家' }).click()
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

test('bounds board browsing and editing with a mobile list/detail switch', async ({
  page,
  resources: _resources,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/boards')
  await expect(page.locator('.aw-board-overview')).toBeVisible()
  const activeNavigation = page.locator('.aw-nav__link[aria-current="page"]')
  const selectedBoard = page.locator('.aw-board-management__item[data-selected="true"]')
  await expect(activeNavigation.locator('.aw-choice__label')).toHaveCSS('color', 'rgb(175, 44, 28)')
  await expect(selectedBoard.locator('.aw-choice__label')).toHaveCSS('color', 'rgb(175, 44, 28)')
  await expect(selectedBoard.locator('.aw-choice__meta')).toHaveCSS('color', 'rgb(170, 169, 152)')
  expect(
    await activeNavigation.evaluate((element) => getComputedStyle(element).borderImageSource),
  ).toBe('none')
  const hoveredBoard = page.locator('.aw-board-management__item[data-selected="false"]').first()
  const idleText = await hoveredBoard
    .locator('.aw-choice__label')
    .evaluate((element) => getComputedStyle(element).color)
  await hoveredBoard.hover()
  await expect(hoveredBoard.locator('.aw-choice__label')).not.toHaveCSS('color', idleText)
  await expect(hoveredBoard.locator('.aw-choice__label')).toHaveCSS('color', 'rgb(175, 44, 28)')
  await expect(hoveredBoard.locator('.aw-choice__meta')).toHaveCSS('color', 'rgb(170, 169, 152)')
  await expect(hoveredBoard).toHaveCSS('border-image-source', 'none')
  await expect(hoveredBoard).toHaveCSS('box-shadow', 'none')
  await expect(hoveredBoard).toHaveCSS(
    'background-image',
    await selectedBoard.evaluate((element) => getComputedStyle(element).backgroundImage),
  )
  expect(
    await hoveredBoard.evaluate((element) => getComputedStyle(element, '::before').content),
  ).toBe('none')
  await selectedBoard.hover()
  await page.getByRole('heading', { level: 1 }).hover()
  for (const selected of [selectedBoard, activeNavigation]) {
    const stripe = await selected.evaluate((element) => {
      const style = getComputedStyle(element, '::before')
      return { content: style.content, width: style.width, background: style.backgroundColor }
    })
    expect(stripe.content).toBe('""')
    expect(stripe.width).toBe('3px')
    expect(stripe.background).not.toBe('rgba(0, 0, 0, 0)')
  }
  const badges = page.locator('.aw-board-role-card .aw-role-badge')
  expect(
    await badges.evaluateAll((elements) =>
      elements.every((element) => {
        const source = getComputedStyle(element).borderImageSource
        return source.includes(`${element.getAttribute('data-role-id')}/tag-horizontal-`)
      }),
    ),
  ).toBe(true)
  await page.getByRole('button', { name: '基于此创建' }).click()
  const editor = page.locator('.aw-board-editor > .aw-catalog-scroll')
  const footer = page.locator('.aw-board-editor > .aw-editor-actions')
  const before = await footer.boundingBox()
  await editor.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  expect(await editor.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  expect(await footer.boundingBox()).toEqual(before)
  await expect(footer.getByRole('button', { name: '保存板型' })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '板型列表', exact: true }).click()
  await expect(page.locator('.aw-board-management > .aw-catalog-sidebar')).toBeVisible()
  await expect(page.locator('.aw-catalog-detail')).toBeHidden()
  await page.getByRole('button', { name: /6 人快速场/ }).click()
  await expect(page.locator('.aw-board-overview')).toBeVisible()
  await expect(page.locator('.aw-board-management > .aw-catalog-sidebar')).toBeHidden()
  await expect(page.getByRole('link', { name: '使用此板型' })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true)
})
