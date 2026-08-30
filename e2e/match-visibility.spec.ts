import type { MatchView } from '@agentwolf/contracts'
import { thinkingMatchFixture } from './fixtures/matches.js'
import { expect, test } from './fixtures/test.js'

test('projects god, closed-eye, and player spectator views from the server', async ({
  page,
  request,
  resources,
}) => {
  const matchResponse = await request.post('/api/matches', {
    data: {
      boardId: 'board-standard-12',
      roleAssignment: 'random',
      seats: Array.from({ length: 12 }, (_, index) => ({
        seat: index + 1,
        name: `${resources.runId}-projection-${index + 1}`,
        profileId: resources.boardProfileId,
      })),
    },
  })
  const matchBody = await matchResponse.json()
  expect(matchResponse.ok(), JSON.stringify(matchBody)).toBe(true)
  const match = matchBody as { id: string }
  await page.goto(`/matches/${match.id}`)
  await expect(page.getByRole('heading', { name: '事件时间线' })).toBeVisible()
  const roleLabels = page.locator('.aw-stage-grid > .aw-player-rail .aw-player-card__role')
  await expect(roleLabels).toHaveCount(12)
  await expect(page.locator('.aw-stage-grid > .aw-player-rail .aw-player-card__agent')).toHaveText(
    Array.from({ length: 12 }, () => `${resources.sharedToolName} · mock-model · high`),
  )
  expect(
    (await roleLabels.allTextContents()).filter((value) => value !== '身份未公开'),
  ).toHaveLength(12)
  await expect(roleLabels.filter({ hasText: '女巫' })).toHaveCSS('color', 'rgb(189, 134, 223)')
  await expect(roleLabels.filter({ hasText: '猎人' })).toHaveCSS('color', 'rgb(114, 198, 154)')

  await page.getByRole('button', { name: '闭眼视角' }).click()
  await expect(roleLabels).toHaveText(Array.from({ length: 12 }, () => '身份未公开'))
  await expect(page.locator('.aw-stage-grid > .aw-player-rail .aw-player-card__agent')).toHaveText(
    Array.from({ length: 12 }, () => `${resources.sharedToolName} · mock-model · high`),
  )
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

test('renders a private night phase through its generic projection', async ({
  page,
  resources: _resources,
}) => {
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

test('shows Cupid relationship markers only in authorized spectator views', async ({
  page,
  resources: _resources,
}) => {
  const source = thinkingMatchFixture()
  const cupidId = 'player-1'
  const loverIds = ['player-2', 'player-4']
  const base = { ...source, id: 'match-private-cupid-marker-test' } as MatchView
  let terminal = false
  const projection = (view: { kind: string; playerId?: string }): MatchView => {
    const canSeeLovers =
      terminal ||
      view.kind === 'god' ||
      (view.kind === 'player' && [cupidId, ...loverIds].includes(view.playerId ?? ''))
    return {
      ...base,
      status: terminal ? 'ended' : base.status,
      seats: base.seats.map((seat) => ({
        ...seat,
        markers: canSeeLovers && loverIds.includes(seat.playerId) ? ['cupid-lover'] : [],
      })),
    }
  }
  await page.route(`**/api/matches/${base.id}?*`, async (route) => {
    const url = new URL(route.request().url())
    await route.fulfill({
      json: projection({
        kind: url.searchParams.get('view') ?? 'god',
        ...(url.searchParams.get('playerId')
          ? { playerId: url.searchParams.get('playerId')! }
          : {}),
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
      ...(url.searchParams.get('playerId') ? { playerId: url.searchParams.get('playerId')! } : {}),
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
  const desktopMarkers = page.locator(
    '.aw-stage-grid .aw-player-marker[data-marker-id="cupid-lover"]',
  )
  await expect(desktopMarkers).toHaveCount(2)
  await expect(desktopMarkers).toHaveText(['情侣', '情侣'])
  await expect(desktopMarkers.first()).toHaveCSS('color', 'rgb(231, 143, 168)')

  await page.getByRole('button', { name: '闭眼视角' }).click()
  await expect(desktopMarkers).toHaveCount(0)
  await page.getByRole('button', { name: '玩家视角' }).click()
  await expect(desktopMarkers).toHaveCount(2)
  const playerSelect = page.getByRole('combobox', { name: '选择玩家视角' })
  await playerSelect.click()
  await page.getByRole('option', { name: '3 号玩家 测试玩家3', exact: true }).click()
  await expect(desktopMarkers).toHaveCount(0)
  await playerSelect.click()
  await page.getByRole('option', { name: '2 号玩家 测试玩家2', exact: true }).click()
  await expect(desktopMarkers).toHaveCount(2)

  await page.setViewportSize({ width: 390, height: 844 })
  const mobileMarkers = page.locator(
    '.aw-mobile-roster .aw-player-marker[data-marker-id="cupid-lover"]',
  )
  await expect(mobileMarkers).toHaveCount(2)
  await expect(mobileMarkers.first()).toBeVisible()

  terminal = true
  await page.getByRole('button', { name: '闭眼视角' }).click()
  await expect(mobileMarkers).toHaveCount(2)
})

test('shows private wolf ballots in god and Werewolf player views only', async ({
  page,
  resources: _resources,
}) => {
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
        ...(url.searchParams.get('playerId')
          ? { playerId: url.searchParams.get('playerId')! }
          : {}),
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
      ...(url.searchParams.get('playerId') ? { playerId: url.searchParams.get('playerId')! } : {}),
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
