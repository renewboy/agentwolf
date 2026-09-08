import { expect, test } from './fixtures/test.js'
import { thinkingMatchFixture } from './fixtures/matches.js'

test('keeps a restored paused match free of raw control errors and deletion controls', async ({
  page,
}) => {
  const match = {
    ...thinkingMatchFixture(),
    id: 'match-paused-controls',
    status: 'paused',
    activeSpeech: null,
    pausedReason: '服务重启后需要恢复 Agent Session，请点击继续对局。',
  }
  const commands: string[] = []
  const diagnostic = `Live controls are unavailable for inactive match ${match.id}`
  await page.addInitScript(() => localStorage.setItem('agentwolf.voice-enabled', 'true'))
  await page.route(`**/api/matches/${match.id}?*`, (route) => route.fulfill({ json: match }))
  await page.routeWebSocket(`**/api/matches/${match.id}/live?*`, (socket) => {
    socket.send(JSON.stringify({ type: 'snapshot', view: { kind: 'closed-eye' }, data: match }))
    socket.send(
      JSON.stringify({
        type: 'speech-playback.state',
        state: { enabled: false, controlledByThisClient: false, pendingSequence: null },
      }),
    )
    socket.send(
      JSON.stringify({ type: 'error', code: 'invalid-live-message', message: diagnostic }),
    )
    socket.onMessage((value) => commands.push(JSON.parse(String(value)).type))
  })
  await page.goto(`/matches/${match.id}`)
  await expect(page.getByRole('button', { name: '继续对局' })).toBeVisible()
  await expect(page.getByRole('button', { name: '语音播报已开启' })).toBeDisabled()
  await expect(page.getByText(diagnostic)).toHaveCount(0)
  await page.getByText('暂停详情', { exact: true }).click()
  await expect(page.getByText(match.pausedReason)).toBeVisible()
  await expect(page.getByRole('button', { name: '删除对局' })).toHaveCount(0)
  expect(commands).not.toContain('speech-playback.set')
})
