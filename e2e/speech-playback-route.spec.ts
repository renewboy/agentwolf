import type { MatchView } from '@agentwolf/contracts'
import { ignoreLiveMessage, thinkingMatchFixture } from './fixtures/matches.js'
import { expect, test } from './fixtures/test.js'
import {
  finishSpeech,
  installSpeechSynthesisStub,
  speechStubCancelCount,
  speechStubState,
} from './fixtures/speech.js'

test('keeps one voice session while switching between a Match and its trajectory', async ({
  page,
  resources: _resources,
}) => {
  await installSpeechSynthesisStub(page)
  const initial = {
    ...thinkingMatchFixture(),
    id: 'match-speech-route-session-test',
    activeSpeech: null,
  } as MatchView
  let sendLive: (message: unknown) => void = ignoreLiveMessage
  let liveConnections = 0
  await page.route('**/api/runtime-config', async (route) =>
    route.fulfill({ json: { developerMode: true } }),
  )
  await page.route(`**/api/matches/${initial.id}?*`, async (route) =>
    route.fulfill({ json: initial }),
  )
  await page.route('**/api/developer/matches/**', async (route) =>
    route.fulfill({ status: 503, json: { error: 'not needed for playback continuity' } }),
  )
  await page.routeWebSocket(`**/api/matches/${initial.id}/live?*`, (socket) => {
    liveConnections += 1
    sendLive = (message) => socket.send(JSON.stringify(message))
    sendLive({ type: 'snapshot', view: { kind: 'god' }, data: initial })
    sendLive({
      type: 'speech-playback.state',
      state: { enabled: false, controlledByThisClient: false, pendingSequence: null },
    })
    socket.onMessage((value) => {
      const message = JSON.parse(String(value)) as Record<string, unknown>
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
    text: '跨页播放。',
  })
  await expect.poll(async () => speechStubState(page, 'spoken')).toEqual(['跨页播放。'])
  await page.getByRole('link', { name: '切换到玩家行动轨迹' }).click()
  await expect(page).toHaveURL(new RegExp(`/matches/${initial.id}/trajectory$`))
  expect(liveConnections).toBe(1)
  expect(await speechStubCancelCount(page)).toBe(0)

  await finishSpeech(page)
  sendLive({
    type: 'speech-chunk',
    matchId: initial.id,
    speechId: 31,
    playerId: 'player-1',
    text: '仍然继续。',
  })
  await expect
    .poll(async () => speechStubState(page, 'spoken'))
    .toEqual(['跨页播放。', '仍然继续。'])
  await page.goBack()
  await expect(page.getByRole('button', { name: '语音播报已开启' })).toBeVisible()
  expect(liveConnections).toBe(1)
  await page.reload()
  await expect(page.getByRole('button', { name: '语音播报已开启' })).toBeVisible()
  expect(liveConnections).toBe(2)
})
