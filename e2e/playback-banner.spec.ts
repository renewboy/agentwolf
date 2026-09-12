import type { MatchView } from '@agentwolf/contracts'
import { postgameMatchFixture, postgameResult, postgameSubmission } from './fixtures/matches.js'
import { speechTimelineItem } from './fixtures/speech.js'
import { setup, audio, opening, playbackBar } from './fixtures/portrait.js'
import { expect, test } from './fixtures/test.js'

test('remembers closing and opening the portrait for following automatic playback', async ({
  page,
}) => {
  const match = await setup(page, 'left')
  await page.route('**/speech-audio', (route) =>
    route.fulfill({ contentType: 'audio/L16;rate=24000;channels=1', body: audio(2) }),
  )
  match.publish()
  await expect(page.getByRole('region', { name: '角色播报' })).toBeVisible()
  await playbackBar(page).getByRole('button', { name: '关闭立绘', exact: true }).click()
  await expect(page.getByRole('region', { name: '角色播报' })).not.toBeVisible()
  await expect(playbackBar(page).getByRole('button', { name: '显示立绘' })).toBeVisible()
  await expect(playbackBar(page)).not.toBeVisible()
  match.publish('这一轮重新核对发言。', 32)
  await expect(playbackBar(page).getByRole('button', { name: '显示立绘' })).toBeVisible()
  await expect(page.getByRole('region', { name: '角色播报' })).not.toBeVisible()
  await playbackBar(page).getByRole('button', { name: '显示立绘' }).click()
  await expect(page.getByRole('region', { name: '角色播报' })).toBeVisible()
  await expect(playbackBar(page)).not.toBeVisible()
  match.publish('继续核对投票。', 33)
  await expect(page.getByRole('region', { name: '角色播报' })).toBeVisible()
  await playbackBar(page).getByRole('button', { name: '跳过', exact: true }).click()
})

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 390, height: 844 },
]) {
  test(`keeps playback controls inside the postgame status panel at ${viewport.width}px and remembers visibility on replay`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport)
    const match = await setup(page, 'left')
    await page.getByRole('button', { name: '语音播报已开启' }).click()
    await page.route('**/speech-audio', (route) =>
      route.fulfill({ contentType: 'audio/L16;rate=24000;channels=1', body: audio(12) }),
    )
    const ended = postgameMatchFixture(match.view, match.view.id, 'collecting')
    match.update({
      ...ended,
      lastSequence: 31,
      timeline: [speechTimelineItem(31, match.player.playerId, opening)],
      postgameReview: {
        ...ended.postgameReview!,
        state: 'completed',
        submittedCount: 1,
        submissions: [postgameSubmission(match.view.id)],
        result: postgameResult(),
      },
    } as MatchView)
    await page.getByRole('button', { name: '展开开局', exact: true }).click()
    const play = page.getByRole('button', { name: /播放这段发言/u })
    await play.click()
    const bar = playbackBar(page),
      portrait = page.getByRole('region', { name: '角色播报' })
    await expect(portrait).toBeVisible()
    await expect(bar).toContainText(`正在播放 ${match.player.seat} 号`)
    await bar.getByRole('button', { name: '关闭立绘', exact: true }).click()
    await expect(portrait).not.toBeVisible()
    const summary = page.locator('.aw-postgame-strip'),
      barBox = (await bar.boundingBox())!,
      summaryBox = (await summary.boundingBox())!
    expect(await summary.locator('.aw-speech-playback-bar').count()).toBe(1)
    const outcomeBox = (await summary.locator('.aw-postgame-strip__summary').boundingBox())!
    const speechBox = (await page.locator('.aw-match-stage').boundingBox())!
    expect(barBox.y).toBeGreaterThan(summaryBox.y)
    expect(barBox.x).toBeGreaterThanOrEqual(summaryBox.x)
    expect(barBox.x + barBox.width).toBeLessThanOrEqual(summaryBox.x + summaryBox.width)
    expect(barBox.y + barBox.height).toBeLessThanOrEqual(outcomeBox.y)
    expect(barBox.y).toBeGreaterThanOrEqual(speechBox.y)
    await expect(page.getByRole('button', { name: '返回播报', exact: true })).toHaveCount(0)
    await page.screenshot({ path: info.outputPath(`playback-bar-${viewport.width}-closed.png`) })
    await page.locator('.aw-postgame-inspector-toggle').click()
    await expect(page.locator('.aw-postgame-inspector')).toBeVisible()
    await expect(bar).toBeVisible()
    await page.locator('.aw-postgame-inspector-close').click()
    await bar.getByRole('button', { name: '跳过', exact: true }).click()
    await expect(bar).not.toBeVisible()
    await play.click()
    await expect(bar.getByRole('button', { name: '显示立绘' })).toBeVisible()
    await expect(portrait).not.toBeVisible()
    await bar.getByRole('button', { name: '显示立绘' }).click()
    await expect(portrait).toBeVisible()
    await expect(portrait).toHaveCSS('opacity', '1')
    await expect(portrait.locator('canvas')).toHaveAttribute('data-ready', 'true')
    await page.screenshot({ path: info.outputPath(`playback-bar-${viewport.width}-portrait.png`) })
    await bar.getByRole('button', { name: '跳过', exact: true }).click()
    await page.reload()
    await page.getByRole('button', { name: '展开开局', exact: true }).click()
    await play.click()
    await expect(portrait).toBeVisible()
    await bar.getByRole('button', { name: '关闭立绘', exact: true }).click()
    await bar.getByRole('button', { name: '跳过', exact: true }).click()
    await page.reload()
    await page.getByRole('button', { name: '展开开局', exact: true }).click()
    await play.click()
    await expect(bar.getByRole('button', { name: '显示立绘' })).toBeVisible()
    await expect(portrait).not.toBeVisible()
    await bar.getByRole('button', { name: '跳过', exact: true }).click()
  })
}
