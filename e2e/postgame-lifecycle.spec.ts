import type { MatchView } from '@agentwolf/contracts'
import {
  ignoreLiveMessage,
  postgameMatchFixture,
  postgameResult,
  postgameSubmission,
  thinkingMatchFixture,
} from './fixtures/matches.js'
import { speechTimelineItem } from './fixtures/speech.js'
import { expect, test } from './fixtures/test.js'

test('settles ended matches and stops polling a missing match', async ({
  page,
  resources: _resources,
}) => {
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

test('receives the countdown and automatic review start over one live connection', async ({
  page,
  resources: _resources,
}) => {
  const matchId = 'match-postgame-live-transition-test'
  const base = thinkingMatchFixture()
  const countdown = postgameMatchFixture(base, matchId, 'countdown')
  const collecting = postgameMatchFixture(base, matchId, 'collecting')
  let current = { ...base, id: matchId } as unknown as MatchView
  let sendLive: (message: unknown) => void = ignoreLiveMessage
  await page.route(`**/api/matches/${matchId}?*`, async (route) => route.fulfill({ json: current }))
  await page.routeWebSocket('**/live?*', (socket) => {
    sendLive = (message) => socket.send(JSON.stringify(message))
    socket.send(JSON.stringify({ type: 'snapshot', view: { kind: 'god' }, data: current }))
  })

  await page.goto(`/matches/${matchId}`)
  await expect(page.getByRole('timer')).toHaveCount(0)
  current = countdown
  sendLive({ type: 'snapshot', view: { kind: 'god' }, data: current })
  await expect(page.getByRole('timer')).toBeVisible()
  await expect(page.getByRole('heading', { name: '复盘即将开始' })).toBeVisible()

  current = collecting
  sendLive({ type: 'snapshot', view: { kind: 'god' }, data: current })
  await expect(page.getByRole('timer')).toHaveCount(0)
  await expect(page.getByText('已完成 0 / 6')).toBeVisible()
  await expect(page.locator('.aw-connection-indicator')).toContainText('实时连接正常')
})

test('shows completed player ratings immediately and streams reflections through speech bubbles', async ({
  page,
  resources: _resources,
}) => {
  const matchId = 'match-postgame-review-ui-test'
  const base = thinkingMatchFixture()
  const running = { ...base, id: matchId }
  const countdown = postgameMatchFixture(base, matchId, 'countdown')
  const collecting = postgameMatchFixture(base, matchId, 'collecting')
  let current = running
  let sendLive: (message: unknown) => void = ignoreLiveMessage
  await page.route(`**/api/matches/${matchId}?*`, async (route) => route.fulfill({ json: current }))
  await page.route(`**/api/matches/${matchId}/postgame-review/start`, async (route) => {
    current = collecting
    await route.fulfill({ status: 202, json: collecting })
  })
  await page.routeWebSocket('**/live?*', (socket) => {
    sendLive = (message) => socket.send(JSON.stringify(message))
    socket.send(JSON.stringify({ type: 'snapshot', view: { kind: 'god' }, data: current }))
  })

  await page.goto(`/matches/${matchId}`)
  await expect(page.getByRole('timer')).toHaveCount(0)
  current = countdown
  sendLive({ type: 'snapshot', view: { kind: 'god' }, data: current })
  await expect(page.getByRole('heading', { name: '复盘即将开始' })).toBeVisible()
  await expect(page.getByRole('timer')).toBeVisible()
  await expect(page.getByRole('timer')).toContainText(/\d+/)
  await page.getByRole('button', { name: '立即开始' }).click()
  await expect(page.getByText('已完成 0 / 6')).toBeVisible()
  const postgameFeedGroup = page.locator('.aw-day-group').filter({ hasText: '对局复盘' })
  await expect(postgameFeedGroup.getByText('复盘开始', { exact: true })).toBeVisible()
  await expect(
    postgameFeedGroup.getByText('全员评分完成后将公布 MVP、SVP，并由玩家依次发表复盘感言。'),
  ).toBeVisible()
  await expect(page.locator('.aw-postgame-inspector')).toHaveCount(0)
  await expect(page.locator('.aw-feed-shell')).toBeVisible()

  const submission = postgameSubmission(matchId)
  current = {
    ...collecting,
    postgameReview: {
      ...collecting.postgameReview!,
      submittedCount: 1,
      submissions: [submission],
    },
  } as unknown as MatchView
  sendLive({ type: 'snapshot', view: { kind: 'god' }, data: current })
  await expect(page.getByText('已完成 1 / 6')).toBeVisible()
  await expect(
    page.locator('.aw-stage-grid .aw-player-card[data-player-id="player-1"]'),
  ).toHaveAttribute('data-review-submitted', 'true')
  await page.getByRole('button', { name: '查看复盘' }).click()
  await expect(page.locator('.aw-postgame-inspector')).toBeVisible()
  await expect(page.getByText('测试玩家1的评分')).toBeVisible()
  await expect(page.getByText(/评审单/)).toHaveCount(0)
  await expect(page.getByText('已提交评分')).toHaveCount(0)
  await expect(page.locator('.aw-postgame-player-tab')).toHaveCount(6)
  for (const seat of Array.from({ length: 6 }, (_, index) => index + 1)) {
    await expect(page.locator('.aw-postgame-player-tab').nth(seat - 1)).toContainText(
      `测试玩家${seat}`,
    )
  }
  await expect(
    page.locator('.aw-postgame-player-tab').filter({ hasText: '测试玩家1' }),
  ).toBeEnabled()
  await expect(
    page.locator('.aw-postgame-player-tab').filter({ hasText: '测试玩家2' }),
  ).toBeDisabled()
  await expect(page.getByRole('button', { name: '2 · 测试玩家2' })).toBeVisible()
  await expect(page.locator('.aw-postgame-radar__value')).toBeVisible()
  const desktopFeedBounds = await page.locator('.aw-feed-shell').boundingBox()
  const desktopInspectorBounds = await page.locator('.aw-postgame-inspector').boundingBox()
  expect(desktopFeedBounds).not.toBeNull()
  expect(desktopInspectorBounds).not.toBeNull()
  expect((desktopFeedBounds?.x ?? 0) + (desktopFeedBounds?.width ?? 0)).toBeLessThanOrEqual(
    desktopInspectorBounds?.x ?? 0,
  )
  const reviewerTabBounds = await page
    .locator('.aw-postgame-player-tab')
    .filter({ hasText: '测试玩家1' })
    .first()
    .boundingBox()
  const reviewerTabsBounds = await page.locator('.aw-postgame-player-tabs').boundingBox()
  const inspectorContentBounds = await page.locator('.aw-postgame-content').boundingBox()
  expect(reviewerTabBounds?.height ?? 0).toBeGreaterThanOrEqual(30)
  expect(reviewerTabsBounds?.height ?? 0).toBeGreaterThanOrEqual(35)
  expect(reviewerTabBounds?.y ?? 0).toBeGreaterThanOrEqual(inspectorContentBounds?.y ?? 0)
  expect(
    await page
      .locator('.aw-postgame-player-tab')
      .filter({ hasText: '测试玩家1' })
      .first()
      .evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        const hit = document.elementFromPoint(
          bounds.x + bounds.width / 2,
          bounds.y + bounds.height / 2,
        )
        return hit === element || element.contains(hit)
      }),
  ).toBe(true)

  const result = postgameResult()
  current = {
    ...current,
    postgameReview: {
      ...current.postgameReview!,
      state: 'speaking',
      submittedCount: 6,
      submissions: Array.from({ length: 6 }, (_, index) => ({
        ...submission,
        reviewerId: `player-${index + 1}`,
        submittedAt: `2026-08-26T00:00:0${index}.000Z`,
      })),
      result,
      currentSpeakerId: 'player-2',
    },
  } as unknown as MatchView
  sendLive({ type: 'snapshot', view: { kind: 'god' }, data: current })
  await expect(page.getByRole('button', { name: '玩家评分' })).toBeVisible()
  const feedAwards = postgameFeedGroup.locator('.aw-postgame-feed-result')
  await expect(feedAwards).toBeVisible()
  await expect(feedAwards).toContainText('本局 MVP 与 SVP')
  await expect(feedAwards).toContainText('2 · 测试玩家2')
  await expect(feedAwards).toContainText('4 票')
  await expect(feedAwards).toContainText('3 · 测试玩家3')
  await expect(feedAwards).toContainText('3 票')
  await expect(feedAwards.locator('.aw-postgame-radar')).toHaveCount(2)
  await expect(feedAwards.locator('.aw-postgame-radar__value')).toHaveCount(2)
  sendLive({
    type: 'speech-chunk',
    matchId,
    playerId: 'player-2',
    text: '这是一段逐字出现的复盘感言。',
  })
  await expect(page.getByText('这是一段逐字出现的复盘感言。')).toBeVisible()

  const reflectionText = '这是一段逐字出现的复盘感言。下一局我会更重视信息闭环。'
  const reflection = {
    matchId,
    playerId: 'player-2',
    seat: 2,
    speechSequence: 32,
    text: reflectionText,
    occurredAt: '2026-08-26T00:01:00.000Z',
  }
  current = {
    ...current,
    timeline: [
      ...current.timeline,
      { ...speechTimelineItem(32, 'player-2', reflectionText), postgame: true },
    ],
    activeSpeech: null,
    postgameReview: {
      ...current.postgameReview!,
      state: 'completed',
      currentSpeakerId: null,
      reflections: [reflection],
    },
  } as unknown as MatchView
  sendLive({ type: 'snapshot', view: { kind: 'god' }, data: current })
  await expect(page.getByRole('log').getByText(reflectionText, { exact: true })).toBeVisible()
  await expect(feedAwards.getByText('MVP · 获胜方最佳')).toBeVisible()
  await expect(feedAwards.locator('.aw-postgame-radar__value')).toHaveCount(2)
  await expect(page.locator('.aw-connection-indicator')).toContainText('对局记录已完整同步')
  await page.setViewportSize({ width: 760, height: 900 })
  await expect(page.locator('.aw-mobile-roster')).toBeVisible()
  await expect(page.locator('.aw-postgame-inspector')).toBeVisible()
  await expect(page.locator('.aw-feed-shell')).toBeHidden()
  const inspectorBounds = await page.locator('.aw-postgame-inspector').boundingBox()
  expect(inspectorBounds).not.toBeNull()
  expect((inspectorBounds?.x ?? 0) + (inspectorBounds?.width ?? 0)).toBeLessThanOrEqual(760)
  expect((inspectorBounds?.y ?? 0) + (inspectorBounds?.height ?? 0)).toBeLessThanOrEqual(900)
  await page.locator('.aw-postgame-inspector-close').click()
  await expect(page.locator('.aw-postgame-inspector')).toHaveCount(0)
  await expect(page.locator('.aw-feed-shell')).toBeVisible()
  const mobileAwardsBounds = await feedAwards.boundingBox()
  expect(mobileAwardsBounds).not.toBeNull()
  expect((mobileAwardsBounds?.x ?? 0) + (mobileAwardsBounds?.width ?? 0)).toBeLessThanOrEqual(760)
})

test('offers recovery controls and deletes a paused match', async ({
  page,
  request,
  resources,
}) => {
  const createdResponse = await request.post('/api/matches', {
    data: {
      boardId: 'board-quick-6',
      roleAssignment: 'random',
      seats: Array.from({ length: 6 }, (_, index) => ({
        seat: index + 1,
        name: `${resources.runId}-paused-${index + 1}`,
        profileId: resources.sharedProfileId,
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
