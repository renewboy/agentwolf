import { expect, test } from '@playwright/test'
import type {
  MatchView,
  TrajectoryAuditReport,
  TrajectoryDelta,
  TrajectoryOwnerSummary,
  TrajectoryPage,
  TrajectoryPlayerDebug,
  TrajectoryRecord,
  TrajectorySummary,
  TrajectoryTurn,
} from '@agentwolf/contracts'

const occurredAt = '2026-08-27T00:00:00.000Z'

test('keeps the speech feed reading position during streamed generation', async ({ page }) => {
  const match = matchFixture('match-speech-scroll-retention')
  let sendLive: (message: unknown) => void = ignoreMessage
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/api/runtime-config', async (route) =>
    route.fulfill({ json: { developerMode: false } }),
  )
  await page.route(`**/api/matches/${match.id}?*`, async (route) => route.fulfill({ json: match }))
  await page.routeWebSocket(`**/api/matches/${match.id}/live?*`, (socket) => {
    sendLive = (message) => socket.send(JSON.stringify(message))
    sendLive({ type: 'snapshot', view: { kind: 'god' }, data: match })
  })

  await page.goto(`/matches/${match.id}`)
  const feed = page.locator('.aw-feed-scroll')
  await expect
    .poll(() =>
      feed.evaluate((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      })),
    )
    .toMatchObject({ clientHeight: expect.any(Number), scrollHeight: expect.any(Number) })
  await expect
    .poll(() => feed.evaluate((element) => element.scrollHeight - element.clientHeight))
    .toBeGreaterThan(200)

  const readingPosition = await feed.evaluate((element) => {
    element.scrollTop = element.scrollHeight - element.clientHeight - 48
    return element.scrollTop
  })
  await expect.poll(() => feed.evaluate((element) => element.scrollTop)).toBe(readingPosition)
  await feed.dispatchEvent('wheel', { deltaY: -24 })

  sendLive({
    type: 'speech-chunk',
    matchId: match.id,
    speechId: 42,
    playerId: 'player-1',
    text: '这是正在生成的发言。'.repeat(36),
  })
  await expect(page.locator('.aw-speech-bubble[data-live="true"]')).toContainText(
    '这是正在生成的发言',
  )
  await page.waitForTimeout(120)
  expect(await feed.evaluate((element) => element.scrollTop)).toBe(readingPosition)
  await expect(page.getByRole('button', { name: '回到最新' })).toBeVisible()

  await page.getByRole('button', { name: '回到最新' }).click()
  await expect
    .poll(() =>
      feed.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight),
    )
    .toBeLessThanOrEqual(1)
})

test('keeps the trajectory reading position while live records arrive', async ({ page }) => {
  const match = matchFixture('match-trajectory-scroll-retention')
  const turn = trajectoryTurn(match.id)
  const records = Array.from({ length: 36 }, (_, index) =>
    trajectoryRecord(match.id, turn.turnId, index + 1, 1),
  )
  const owner = {
    ownerId: 'player-1',
    label: '测试玩家1',
    turnCount: 1,
    recordCount: records.length,
  } as unknown as TrajectoryOwnerSummary
  const summary: TrajectorySummary = {
    matchId: match.id,
    revision: 1,
    owners: [owner],
    turns: [turn],
  }
  const trajectoryPage = {
    matchId: match.id,
    revision: 1,
    ownerId: 'player-1',
    turns: [turn],
    records,
    nextBeforeTurn: null,
  } as unknown as TrajectoryPage
  const audit = {
    matchId: match.id,
    ok: true,
    auditedTurns: 1,
    issues: [],
  } as unknown as TrajectoryAuditReport
  let sendDelta: (delta: TrajectoryDelta) => void = ignoreMessage
  await page.setViewportSize({ width: 1280, height: 700 })
  await page.route('**/api/runtime-config', async (route) =>
    route.fulfill({ json: { developerMode: true } }),
  )
  await page.route(`**/api/matches/${match.id}?*`, async (route) => route.fulfill({ json: match }))
  await page.route(`**/api/developer/matches/${match.id}/trajectory/summary`, async (route) =>
    route.fulfill({ json: summary }),
  )
  await page.route(`**/api/developer/matches/${match.id}/trajectory/audit`, async (route) =>
    route.fulfill({ json: audit }),
  )
  await page.route(
    `**/api/developer/matches/${match.id}/trajectory/players/player-1`,
    async (route) => route.fulfill({ json: playerDebugFixture(match.id) }),
  )
  await page.route(`**/api/developer/matches/${match.id}/trajectory?*`, async (route) =>
    route.fulfill({ json: trajectoryPage }),
  )
  await page.routeWebSocket(`**/api/developer/matches/${match.id}/trajectory/live?*`, (socket) => {
    sendDelta = (delta) => socket.send(JSON.stringify(delta))
  })

  await page.goto(`/matches/${match.id}/trajectory`)
  const ledger = page.locator('.aw-trajectory-scroll')
  await expect
    .poll(() => ledger.evaluate((element) => element.scrollHeight - element.clientHeight))
    .toBeGreaterThan(200)
  const readingPosition = await ledger.evaluate((element) => {
    element.scrollTop = element.scrollHeight - element.clientHeight - 40
    return element.scrollTop
  })
  await expect.poll(() => ledger.evaluate((element) => element.scrollTop)).toBe(readingPosition)
  await ledger.dispatchEvent('wheel', { deltaY: -24 })

  const nextRecord = trajectoryRecord(match.id, turn.turnId, records.length + 1, 2)
  sendDelta({
    type: 'trajectory.delta',
    revision: 2,
    turns: [],
    records: [nextRecord],
  })
  await expect(
    page.getByRole('button', { name: `#${nextRecord.ordinal} 发言`, exact: true }),
  ).toBeVisible()
  await page.waitForTimeout(120)
  expect(await ledger.evaluate((element) => element.scrollTop)).toBe(readingPosition)

  await page.locator('.aw-trajectory-minimap__node[aria-label="#20 发言"]').click()
  await expect(page.locator('.aw-trajectory-record[data-selected="true"]')).toContainText('#20')
  await ledger.evaluate((element) => {
    element.scrollTop = 0
  })
  await ledger.dispatchEvent('wheel', { deltaY: -24 })
  await expect.poll(() => ledger.evaluate((element) => element.scrollTop)).toBe(0)

  const laterRecord = trajectoryRecord(match.id, turn.turnId, records.length + 2, 3)
  sendDelta({
    type: 'trajectory.delta',
    revision: 3,
    turns: [],
    records: [laterRecord],
  })
  await expect(
    page.getByRole('button', { name: `#${laterRecord.ordinal} 发言`, exact: true }),
  ).toBeVisible()
  await page.waitForTimeout(120)
  expect(await ledger.evaluate((element) => element.scrollTop)).toBe(0)
})

function matchFixture(id: string): MatchView {
  return {
    id,
    boardId: 'board-quick-6',
    boardName: '6 人快速场',
    status: 'running',
    day: 1,
    phaseId: 'phase-day-speech',
    phaseLabel: '白天发言',
    seats: Array.from({ length: 6 }, (_, index) => ({
      playerId: `player-${index + 1}`,
      seat: index + 1,
      name: `测试玩家${index + 1}`,
      agent: { name: 'Mock Agent', model: 'mock-model', reasoningEffort: 'high' },
      alive: true,
      canVote: true,
      sheriff: false,
      active: index === 0,
      roleId: index < 2 ? 'role-werewolf' : 'role-villager',
      roleName: index < 2 ? '狼人' : '平民',
      faction: index < 2 ? 'werewolf' : 'village',
      sessionStatus: index === 0 ? 'thinking' : 'ready',
    })),
    timeline: [
      {
        sequence: 1,
        kind: 'day.started',
        title: '第 1 天开始',
        playerIds: [],
        occurredAt,
      },
      ...Array.from({ length: 40 }, (_, index) => ({
        sequence: index + 2,
        kind: 'speech.committed' as const,
        title: `第 ${index + 1} 条用于验证阅读位置的历史发言。`,
        playerIds: [`player-${(index % 6) + 1}`],
        speechId: index + 2,
        occurredAt,
      })),
    ],
    activeSpeech: null,
    winner: null,
    pausedReason: null,
  } as unknown as MatchView
}

function trajectoryTurn(matchId: MatchView['id']): TrajectoryTurn {
  return {
    matchId,
    turnId: 'turn-scroll-retention',
    ownerId: 'player-1',
    sessionId: 'session-scroll-retention',
    sessionGeneration: 1,
    ordinal: 1,
    attempt: 1,
    kind: 'action',
    phaseId: 'phase-day-speech',
    actionType: 'speech',
    timelineGroup: { kind: 'day', index: 1 },
    fromSequence: 1,
    toSequence: 1,
    visibleEventSequences: [1],
    gameStatus: 'running',
    pausedReasonAtRender: null,
    continuation: false,
    status: 'running',
    startedAt: occurredAt,
    completedAt: null,
    durationMs: null,
    stopReason: null,
    error: null,
    usage: null,
    revision: 1,
  } as unknown as TrajectoryTurn
}

function playerDebugFixture(matchId: MatchView['id']): TrajectoryPlayerDebug {
  return {
    matchId,
    playerId: 'player-1',
    profile: {
      id: 'profile-debug-player-1',
      name: 'Debug profile',
      toolId: 'tool-debug-player',
      toolName: 'Mock Agent',
      toolKind: 'custom',
      model: 'mock-model',
      reasoningEffort: 'high',
      mode: null,
      promptTimeoutMs: 5_000,
    },
    session: {
      id: 'session-scroll-retention',
      generation: 1,
      state: 'active',
      bootstrapState: 'acknowledged',
      pendingActionType: null,
      pendingDeliveryId: null,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    },
    launch: { command: 'mock-agent', args: [], environment: [], connectionKeys: [] },
    delivery: { acknowledgedSequence: 1, activeAttempt: null },
    context: {
      latest: { used: 1_000, size: 10_000, cost: null },
      peakUsed: 1_000,
      turnsWithUsage: 1,
    },
    latestTurn: {
      ordinal: 1,
      actionType: 'speech',
      status: 'completed',
      attempt: 1,
      fromSequence: 1,
      toSequence: 1,
      durationMs: 100,
      error: null,
    },
  } as unknown as TrajectoryPlayerDebug
}

function trajectoryRecord(
  matchId: MatchView['id'],
  turnId: string,
  ordinal: number,
  revision: number,
): TrajectoryRecord {
  return {
    matchId,
    recordId: `record-scroll-${ordinal}`,
    turnId,
    ownerId: 'player-1',
    ordinal,
    step: ordinal,
    kind: 'message',
    title: `流式记录 ${ordinal}`,
    status: 'streaming',
    text: `这是第 ${ordinal} 条模型消息记录。`,
    input: null,
    output: null,
    usage: null,
    startedAt: occurredAt,
    completedAt: null,
    durationMs: null,
    truncatedFields: [],
    revision,
  } as unknown as TrajectoryRecord
}

function ignoreMessage(_message: unknown): void {}
