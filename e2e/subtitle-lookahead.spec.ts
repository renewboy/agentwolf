import { setup, audio, playbackBar } from './fixtures/portrait.js'
import { expect, test } from './fixtures/test.js'

for (const clauses of [
  ['先核对发言。', '再检查投票。', '最后决定。'],
  ['同意。', '同意。', '随后核对。'],
]) {
  test(`previews the next audio clause in order for ${clauses[0]}`, async ({ page }) => {
    const match = await setup(page, 'left')
    await page.route('**/speech-audio', (route) =>
      route.fulfill({ contentType: 'audio/L16;rate=24000;channels=1', body: audio(2) }),
    )
    match.publish(clauses.join(''))
    const stage = page.getByRole('region', { name: '角色播报' })
    const current = stage.locator('.aw-speech-subtitles__current'),
      next = stage.locator('.aw-speech-subtitles__next')
    await expect(current).toHaveText(clauses[0]!)
    await expect(next).toHaveText(clauses[1]!)
    await expect(stage).toHaveCSS('opacity', '1')
    expect((await current.boundingBox())!.y).toBeLessThan((await next.boundingBox())!.y)
    await expect(next).toHaveText(clauses[2]!)
    await expect(current).toHaveText(clauses[1]!)
    await expect(current).toHaveText(clauses[2]!)
    await expect(next).toHaveCount(0)
    await expect(playbackBar(page)).not.toBeVisible()
  })
}

test('adds lookahead when the next streamed clause becomes playable and clears it on skip', async ({
  page,
}) => {
  const match = await setup(page, 'left')
  await page.route('**/speech-audio', (route) =>
    route.fulfill({ contentType: 'audio/L16;rate=24000;channels=1', body: audio(8) }),
  )
  const stream = (text: string) =>
    match.send({
      type: 'speech-chunk',
      matchId: match.view.id,
      speechId: 31,
      playerId: match.player.playerId,
      text,
    })
  stream('当前一句已经完整。')
  const stage = page.getByRole('region', { name: '角色播报' })
  await expect(stage.locator('.aw-speech-subtitles__current')).toHaveText('当前一句已经完整。')
  await expect(stage.locator('.aw-speech-subtitles__next')).toHaveCount(0)
  stream('下一句')
  await expect(stage.locator('.aw-speech-subtitles__next')).toHaveCount(0)
  stream('已经完整。')
  await expect(stage.locator('.aw-speech-subtitles__next')).toHaveText('下一句已经完整。')
  await expect(stage.locator('.aw-speech-subtitles__current')).toHaveText('当前一句已经完整。')
  await playbackBar(page).getByRole('button', { name: '跳过', exact: true }).click()
  await expect(stage).not.toBeVisible()
})
