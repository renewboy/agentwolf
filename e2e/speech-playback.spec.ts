import type { MatchView } from '@agentwolf/contracts'
import { ignoreLiveMessage, thinkingMatchFixture } from './fixtures/matches.js'
import { expect, test } from './fixtures/test.js'
import {
  failSpeech,
  finishSpeech,
  installSpeechSynthesisStub,
  speechStubRates,
  speechStubState,
  speechTimelineItem,
} from './fixtures/speech.js'

test('starts narration at sentence boundaries and only appends the committed tail', async ({
  page,
  resources: _resources,
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
    speechId: 31,
    playerId: 'player-1',
    text: '第一句',
  })
  await page.waitForTimeout(50)
  expect(await speechStubState(page, 'spoken')).toEqual([])
  sendLive({
    type: 'speech-chunk',
    matchId: initial.id,
    speechId: 31,
    playerId: 'player-1',
    text: '。第二句',
  })
  await expect.poll(async () => speechStubState(page, 'spoken')).toEqual(['第一句。'])
  expect(await speechStubRates(page)).toEqual([2])
  await finishSpeech(page)

  current = {
    ...current,
    activeSpeech: {
      speechId: 31 as never,
      playerId: 'player-1' as never,
      text: '规范后的第一句。第二句',
      final: true,
    },
    timeline: [...current.timeline, speechTimelineItem(31, 'player-1', '规范后的第一句。第二句')],
  }
  sendLive({ type: 'snapshot', view: { kind: 'god' }, data: current })
  sendLive({
    type: 'speech-playback.state',
    state: { enabled: true, controlledByThisClient: true, pendingSequence: 31 },
  })
  await expect.poll(async () => speechStubState(page, 'spoken')).toEqual(['第一句。', '第二句'])
  expect(await speechStubRates(page)).toEqual([2, 2])
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
  expect(await speechStubState(page, 'spoken')).not.toContain('规范后的第一句。第二句')
})

test('keeps skip available across speaker handoff and suppresses later chunks after skip', async ({
  page,
  resources: _resources,
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
    speechId: 31,
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
    activeSpeech: {
      speechId: 32 as never,
      playerId: 'player-2' as never,
      text: '',
      final: false,
    },
    timeline: [...current.timeline, speechTimelineItem(31, 'player-1', '第一位已经开始播报。')],
  }
  sendLive({ type: 'snapshot', view: { kind: 'god' }, data: current })
  sendLive({
    type: 'speech-chunk',
    matchId: initial.id,
    speechId: 32,
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
    speechId: 32,
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
      speechId: 32 as never,
      playerId: 'player-2' as never,
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

test('plays every speech by sequence and keeps manual controls independent from phase pacing', async ({
  page,
  resources: _resources,
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
  await expect(page.getByRole('button', { name: /播放这段发言/ }).first()).toBeEnabled()
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

test('lets one message preempt live speech without queuing speech that arrives meanwhile', async ({
  page,
  resources: _resources,
}) => {
  await installSpeechSynthesisStub(page)
  const initial = {
    ...thinkingMatchFixture(),
    id: 'match-manual-speech-focus-test',
    activeSpeech: null,
  } as MatchView
  let current = initial
  let sendLive: (message: unknown) => void = ignoreLiveMessage
  const clientMessages: Array<Record<string, unknown>> = []
  await page.route(`**/api/matches/${initial.id}?*`, async (route) =>
    route.fulfill({ json: current }),
  )
  await page.routeWebSocket(`**/api/matches/${initial.id}/live?*`, (socket) => {
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
    speechId: 31,
    playerId: 'player-1',
    text: '正在播报的现场发言。',
  })
  await expect.poll(async () => speechStubState(page, 'spoken')).toEqual(['正在播报的现场发言。'])

  await page
    .getByRole('button', { name: /播放这段发言/ })
    .first()
    .click()
  const selectedStop = page.getByRole('button', { name: /停止播放/ })
  await expect(selectedStop).toBeVisible()
  expect(await speechStubState(page, 'spoken')).toHaveLength(2)

  current = {
    ...current,
    activeSpeech: {
      speechId: 32 as never,
      playerId: 'player-2' as never,
      text: '手动播放期间出现的新发言。',
      final: false,
    },
    timeline: [...current.timeline, speechTimelineItem(31, 'player-1', '正在播报的现场发言。')],
  }
  sendLive({ type: 'snapshot', view: { kind: 'god' }, data: current })
  sendLive({
    type: 'speech-playback.state',
    state: { enabled: true, controlledByThisClient: true, pendingSequence: 31 },
  })
  await expect(selectedStop).toBeVisible()
  expect(await speechStubState(page, 'spoken')).toHaveLength(2)
  await expect
    .poll(() =>
      clientMessages.some(
        (message) =>
          message['type'] === 'speech-playback.resolve' &&
          message['sequence'] === 31 &&
          message['outcome'] === 'skipped',
      ),
    )
    .toBe(true)

  await selectedStop.click()
  await expect.poll(async () => speechStubState(page, 'spoken')).toHaveLength(3)
  expect((await speechStubState(page, 'spoken')).at(-1)).toBe('手动播放期间出现的新发言。')
})
