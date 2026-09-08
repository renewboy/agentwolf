import type { MatchView } from '@agentwolf/contracts'
import { closedEyeFixture, thinkingMatchFixture, votingMatchFixture } from './fixtures/matches.js'
import { expect, test } from './fixtures/test.js'

test('keeps the match viewport fixed and animates a real thinking state', async ({
  page,
  resources: _resources,
}) => {
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
  await page.getByRole('button', { name: '上帝视角', exact: true }).click()
  const shell = page.locator('.aw-match-shell')
  await expect(shell).toHaveAttribute('data-presence-state', 'thinking')
  await expect(page.getByRole('link', { name: '切换到玩家行动轨迹' })).toHaveCount(0)
  const cards = page.locator('.aw-player-rail .aw-player-card')
  await expect(cards).toHaveCount(6)
  await expect(page.locator('.aw-player-rail')).toHaveCount(2)
  await expect(
    page.getByRole('complementary', { name: '左侧玩家' }).locator('article'),
  ).toHaveCount(3)
  await expect(
    page.getByRole('complementary', { name: '右侧玩家' }).locator('article'),
  ).toHaveCount(3)
  const dimensions = await cards.first().evaluate((element) => {
    const portrait = element
      .querySelector<HTMLElement>('.aw-player-avatar')!
      .getBoundingClientRect()
    const name = element.querySelector<HTMLElement>('.aw-player-card__name-row strong')!
    return {
      width: element.getBoundingClientRect().width,
      portraitRatio: portrait.width / portrait.height,
      portraitWidth: portrait.width,
      nameSize: Number.parseFloat(getComputedStyle(name).fontSize),
    }
  })
  expect(dimensions.width).toBeGreaterThanOrEqual(212)
  expect(dimensions.width).toBeLessThanOrEqual(252)
  expect(dimensions.portraitRatio).toBe(1)
  expect(dimensions.portraitWidth).toBeGreaterThanOrEqual(90)
  expect(dimensions.nameSize).toBeGreaterThanOrEqual(14)
  await expect(cards.locator('.aw-player-card__agent')).toHaveCount(6)
  await expect(cards.first().locator('.aw-player-card__agent')).toContainText('mock-model')
  for (const selector of ['.aw-match-stage', '.aw-presence', '.aw-vote-result']) {
    expect(
      await page
        .locator(selector)
        .evaluate((element) => getComputedStyle(element).borderImageSource),
    ).toContain('engraved-frame')
  }
  const ring = page
    .locator('.aw-player-rail .aw-player-card[data-session="thinking"] .aw-avatar-orbit__rotor')
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
  await expect(page.getByRole('complementary', { name: '左侧玩家' })).toBeVisible()
  await expect(page.getByRole('complementary', { name: '右侧玩家' })).toBeVisible()
  await cards.last().scrollIntoViewIfNeeded()
  await expect(cards.last()).toBeInViewport()
  expect(
    await cards
      .first()
      .evaluate((element) =>
        Number.parseFloat(
          getComputedStyle(element.querySelector('.aw-player-card__name-row strong')!).fontSize,
        ),
      ),
  ).toBeGreaterThanOrEqual(12)
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
  await expect(page.locator('.aw-match-projection')).toHaveAttribute('aria-hidden', 'true')
  await expect(page.locator('.aw-match-projection')).toHaveAttribute('inert', '')
  await expect(cards.first()).toBeHidden()
  await expect(page.locator('.aw-projection-veil')).toBeHidden()
  await expect(page.locator('.aw-player-rail .aw-player-card__role')).toHaveText(
    Array.from({ length: 6 }, () => '未知'),
  )

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await page.getByRole('button', { name: '上帝视角', exact: true }).click()
  await expect(page.locator('.aw-match-shell')).toHaveAttribute('data-presence-state', 'thinking')
  const reducedRing = page
    .locator('.aw-player-rail .aw-player-card[data-session="thinking"] .aw-avatar-orbit__rotor')
    .first()
  const reducedBefore = await reducedRing.evaluate((element) => getComputedStyle(element).transform)
  await page.waitForTimeout(320)
  const reducedAfter = await reducedRing.evaluate((element) => getComputedStyle(element).transform)
  expect(reducedAfter).toBe(reducedBefore)
  await expect(page.getByText('测试玩家6正在思考')).toBeVisible()
})

test('opens an earlier day from the header and keeps that position during live speech', async ({
  page,
  resources: _resources,
}) => {
  const base = thinkingMatchFixture()
  const timeline = Array.from({ length: 3 }, (_, dayIndex) => [
    { ...base.timeline[0]!, sequence: dayIndex * 13 + 1, title: `第 ${dayIndex + 1} 夜开始` },
    ...Array.from({ length: 12 }, (_speech, speechIndex) => ({
      ...base.timeline[1]!,
      sequence: dayIndex * 13 + speechIndex + 2,
      speechId: dayIndex * 13 + speechIndex + 2,
      title: `第${dayIndex + 1}天的发言${speechIndex + 1}。${'请结合前面的发言分析今天的票型。'.repeat(4)}`,
    })),
  ]).flat()
  const match = { ...base, id: 'match-day-navigation-test', day: 3, timeline } as MatchView
  let sendSnapshot: ((value: unknown) => void) | null = null
  await page.route(`**/api/matches/${match.id}?*`, async (route) => route.fulfill({ json: match }))
  await page.routeWebSocket('**/live?*', (socket) => {
    sendSnapshot = (value) => socket.send(JSON.stringify(value))
    sendSnapshot({ type: 'snapshot', view: { kind: 'god' }, data: match })
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/matches/${match.id}`)
  await page.getByRole('button', { name: '上帝视角', exact: true }).click()
  const firstDay = page.locator('[data-day-key="day-1"]')
  const feed = page.getByRole('log')
  await expect(firstDay).toHaveAttribute('data-open', 'false')
  const select = page.getByRole('combobox', { name: '跳转到指定日期' })
  await select.click()
  await page.getByRole('option', { name: '第 1 天', exact: true }).click()
  await expect(firstDay).toHaveAttribute('data-open', 'true')
  await expect(firstDay.getByRole('button').first()).toBeInViewport()
  const readingPosition = await feed.evaluate((element) => element.scrollTop)
  ;(sendSnapshot as ((value: unknown) => void) | null)?.({
    type: 'speech-chunk',
    matchId: match.id,
    speechId: 42,
    playerId: 'player-1',
    text: '实时发言更新。'.repeat(24),
  })
  await expect(page.locator('.aw-speech-bubble[data-live="true"]')).toContainText('实时发言更新')
  expect(await feed.evaluate((element) => element.scrollTop)).toBe(readingPosition)
  await firstDay.getByRole('button').first().click()
  await expect(firstDay).toHaveAttribute('data-open', 'false')
  await select.click()
  await page.getByRole('option', { name: '第 1 天', exact: true }).click()
  await expect(firstDay).toHaveAttribute('data-open', 'true')
  await expect(firstDay.getByRole('button').first()).toBeInViewport()
})

test('identifies the Sheriff while daytime speech order is pending', async ({
  page,
  resources: _resources,
}) => {
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
  } as unknown as MatchView
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
  await page.getByRole('button', { name: '上帝视角', exact: true }).click()
  await expect(page.getByText('2 号警长 测试玩家2正在决定发言顺序')).toBeVisible()

  current = {
    ...deciding,
    seats: deciding.seats.map((seat) => ({ ...seat, sessionStatus: 'ready' })),
  } as MatchView
  ;(sendSnapshot as ((match: MatchView) => void) | null)?.(current)
  await expect(page.getByText('等待 2 号警长 测试玩家2决定发言顺序')).toBeVisible()
})

test('plays visible role-effect cues once and respects reduced and off modes', async ({
  page,
  resources: _resources,
}) => {
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
  } as unknown as MatchView
  let sendSnapshot: ((match: MatchView) => void) | null = null
  await page.route(`**/api/matches/${base.id}?*`, async (route) => route.fulfill({ json: base }))
  await page.routeWebSocket('**/live?*', (socket) => {
    if (!socket.url().includes(base.id)) return
    sendSnapshot = (match) =>
      socket.send(JSON.stringify({ type: 'snapshot', view: { kind: 'god' }, data: match }))
    sendSnapshot(base)
  })
  await page.goto(`/matches/${base.id}`)
  await page.getByRole('button', { name: '上帝视角', exact: true }).click()
  await expect(
    page.locator('.aw-player-rail .aw-player-card[data-player-id="player-1"]').first(),
  ).toContainText('上警')
  await expect(page.getByRole('combobox', { name: '技能特效' })).toHaveCount(0)

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
  ;(sendSnapshot as ((match: MatchView) => void) | null)?.({
    ...base,
    lastSequence: 31,
    effectCues: [cue],
  } as unknown as MatchView)
  const overlay = page.locator('.aw-role-effect-overlay')
  await expect(overlay).toHaveAttribute('data-effect', 'sheriff-elected')
  await expect(
    page.locator('.aw-player-rail .aw-player-card[data-player-id="player-1"]').first(),
  ).toHaveAttribute('data-role-effect', 'sheriff-elected')
  await expect(overlay).toHaveAttribute('data-duration', '2500')
  await expect(overlay).toBeHidden({ timeout: 4_000 })

  await page.evaluate(() => window.localStorage.setItem('agentwolf.role-effect-mode', 'reduced'))
  await page.reload()
  await page.getByRole('button', { name: '上帝视角', exact: true }).click()
  await expect(page.locator('.aw-match-shell')).toHaveAttribute('data-presence-state', 'thinking')
  const stage = page.locator('.aw-stage-grid')
  const before = await stage.evaluate((element) => getComputedStyle(element).transform)
  ;(sendSnapshot as ((match: MatchView) => void) | null)?.({
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
  } as unknown as MatchView)
  await expect(overlay).toHaveAttribute('data-effect', 'sheriff-transferred')
  await page.waitForTimeout(180)
  expect(await stage.evaluate((element) => getComputedStyle(element).transform)).toBe(before)
  await expect(overlay).toBeHidden({ timeout: 4_000 })

  await page.evaluate(() => window.localStorage.setItem('agentwolf.role-effect-mode', 'off'))
  await page.reload()
  await page.getByRole('button', { name: '上帝视角', exact: true }).click()
  await expect(page.locator('.aw-match-shell')).toHaveAttribute('data-presence-state', 'thinking')
  ;(sendSnapshot as ((match: MatchView) => void) | null)?.({
    ...base,
    lastSequence: 33,
    effectCues: [{ ...cue, cueId: '33:sheriff-elected', sequence: 33 }],
  } as unknown as MatchView)
  await page.waitForTimeout(250)
  await expect(overlay).toHaveCount(0)
})

test('rotates the voting avatar and groups sealed ballots by seat', async ({
  page,
  resources: _resources,
}) => {
  const match = votingMatchFixture()
  await page.route(`**/api/matches/${match.id}?*`, async (route) => route.fulfill({ json: match }))
  await page.routeWebSocket('**/live?*', (socket) => {
    socket.send(JSON.stringify({ type: 'snapshot', view: { kind: 'god' }, data: match }))
  })

  await page.goto(`/matches/${match.id}`)
  await page.getByRole('button', { name: '上帝视角', exact: true }).click()
  const shell = page.locator('.aw-match-shell')
  await expect(shell).toHaveAttribute('data-presence-state', 'awaiting-actions')
  await expect(page.getByText('等待玩家提交投票', { exact: true })).toBeVisible()
  await expect(
    page.locator('.aw-player-rail .aw-player-card[data-player-id="player-1"]'),
  ).toContainText('已提交')
  const votingPlayer = page.locator('.aw-player-rail .aw-player-card[data-player-id="player-6"]')
  await expect(votingPlayer).toContainText('投票中')

  const orbit = votingPlayer.locator('.aw-avatar-orbit__rotor')
  await expect(orbit).toHaveCSS('animation-name', 'aw-ink-orbit')
  const before = await orbit.evaluate((element) => getComputedStyle(element).transform)
  await page.waitForTimeout(360)
  expect(await orbit.evaluate((element) => getComputedStyle(element).transform)).not.toBe(before)

  const voteResult = page.locator('.aw-vote-result')
  await expect(voteResult).toContainText('投票结算：1号、4号同为3票。')
  await expect(voteResult.locator('.aw-vote-result__detail > span')).toHaveText([
    '投1号：2号、3号、4号',
    '投4号：1号、5号、6号',
  ])
  await expect(voteResult).not.toContainText('测试玩家')
})
