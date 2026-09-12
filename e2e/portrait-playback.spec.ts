import { readFileSync, writeFileSync } from 'node:fs'
import { characterPerformance } from '../packages/assets/src/character-performances.js'
import type { CharacterId, CharacterPortraitAssetId } from '@agentwolf/contracts'
import { thinkingMatchFixture } from './fixtures/matches.js'
import { setup, audio, opening, playbackBar, gin } from './fixtures/portrait.js'
import { expect, test } from './fixtures/test.js'

test('renders cloth deformation and procedural expressions from one texture with a stable face and grip', async ({
  page,
}, info) => {
  await page.goto('/')
  const rig = characterPerformance({
    id: gin.id as CharacterId,
    portraitAssetId: gin.portraitAssetId as CharacterPortraitAssetId,
  })!
  const result = await page.evaluate(async (definition) => {
    const rendererPath = '/src/components/match/portrait-mesh.ts',
      artPath = '/src/components/match/CharacterPortrait.tsx'
    const { PortraitMesh } = (await import(
      rendererPath
    )) as typeof import('../apps/web/src/components/match/portrait-mesh.js')
    const { loadPortraitImages } = (await import(
      artPath
    )) as typeof import('../apps/web/src/components/match/CharacterPortrait.js')
    const images = await loadPortraitImages('gin')
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 768
    const mesh = new PortraitMesh(canvas, definition, images)
    const gl = canvas.getContext('webgl')!
    const samples: Array<{ frame: number; pixels: Uint8Array; png: string }> = []
    for (let frame = 0; frame <= 150; frame++) {
      mesh.draw(frame / 30, 1 / 30, frame >= 10 && frame < 65 ? 0.12 : 0)
      if ([0, 45, 96, 140].includes(frame)) {
        const pixels = new Uint8Array(canvas.width * canvas.height * 4)
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
        samples.push({ frame, pixels, png: canvas.toDataURL('image/png') })
      }
    }
    function difference(
      a: number,
      b: number,
      x: number,
      y: number,
      width: number,
      height: number,
    ): number {
      let changed = 0,
        count = 0
      for (let row = Math.floor(y / 2); row < (y + height) / 2; row++)
        for (let col = Math.floor(x / 2); col < (x + width) / 2; col++) {
          const index = ((767 - row) * 512 + col) * 4
          let change = 0
          for (let channel = 0; channel < 4; channel++)
            change += Math.abs(
              samples[a]!.pixels[index + channel]! - samples[b]!.pixels[index + channel]!,
            )
          if (change > 12) changed++
          count++
        }
      return changed / count
    }
    const changes = {
      hair: difference(1, 3, 175, 485, 90, 130),
      shoulder: difference(1, 3, 105, 640, 170, 120),
      lapel: difference(1, 3, 420, 745, 120, 180),
      sleeve: difference(1, 3, 840, 950, 115, 150),
      face: difference(1, 3, 515, 370, 35, 45),
      grip: difference(1, 3, 640, 1110, 90, 75),
      mouth: difference(1, 3, 516, 438, 75, 31),
      eyes: difference(0, 2, 470, 313, 67, 30),
      closedMouth: difference(0, 3, 516, 438, 75, 31),
    }
    mesh.dispose()
    return {
      changes,
      sourceCount: images.length,
      samples: samples.map(({ frame, png }) => ({ frame, png })),
    }
  }, rig)
  expect(result.sourceCount).toBe(1)
  for (const part of ['hair', 'shoulder', 'lapel', 'sleeve', 'mouth', 'eyes'] as const)
    expect(result.changes[part], part).toBeGreaterThan(0.02)
  expect(result.changes.face).toBe(0)
  expect(result.changes.grip).toBe(0)
  expect(result.changes.closedMouth).toBe(0)
  for (const sample of result.samples)
    writeFileSync(
      info.outputPath(`portrait-frame-${sample.frame}.png`),
      Buffer.from(sample.png.split(',')[1]!, 'base64'),
    )
  await info.attach('portrait-motion-evidence', {
    contentType: 'application/json',
    body: JSON.stringify(result.changes, null, 2),
  })
})

for (const side of ['left', 'right'] as const) {
  test(`places the half-body portrait on the ${side} while retaining both player rails`, async ({
    page,
  }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const match = await setup(page, side)
    match.publish()
    const stage = page.getByRole('region', { name: '角色播报' })
    await expect(stage).toBeVisible()
    await expect(stage).toHaveCSS('opacity', '1')
    await expect(stage).toHaveAttribute('data-side', side)
    await expect(page.locator('.aw-player-rail[data-side="left"]')).toBeVisible()
    await expect(page.locator('.aw-player-rail[data-side="right"]')).toBeVisible()
    await expect(page.locator('.aw-match-conversation')).not.toHaveAttribute('inert', '')
    expect(
      await page
        .locator('.aw-speech-stage-content')
        .evaluate((element) => getComputedStyle(element, '::after').opacity),
    ).toBe('0.7')
    await expect(page.locator('.aw-speaking-portrait__canvas')).toHaveAttribute(
      'data-ready',
      'true',
    )
    await expect(stage.getByText(opening)).toBeVisible()
    await expect(stage.getByText(`${match.player.seat} 号`, { exact: true })).toBeVisible()
    match.send({
      type: 'speech-chunk',
      matchId: `match-portrait-${side}`,
      speechId: 32,
      playerId: 'player-2',
      text: '下一位已经开始生成发言。',
    })
    await expect(stage).toHaveAttribute('data-player-id', match.player.playerId)
    const bounds = await page.locator('.aw-speech-subtitles__text').evaluate((element) => {
      const css = getComputedStyle(element)
      return {
        height: element.getBoundingClientRect().height,
        lineHeight: Number.parseFloat(css.lineHeight),
      }
    })
    const currentHeight = await stage
      .locator('.aw-speech-subtitles__current')
      .evaluate((element) => element.getBoundingClientRect().height)
    expect(currentHeight).toBeLessThanOrEqual(bounds.lineHeight + 1)
    expect(bounds.height).toBeLessThanOrEqual(bounds.lineHeight * 2 + 1)
    const alignment = await stage.locator('.aw-speech-subtitles__current').evaluate((element) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      const text = range.getBoundingClientRect(),
        area = element.getBoundingClientRect()
      return { left: text.left - area.left, right: area.right - text.right }
    })
    expect(Math.abs(alignment[side])).toBeLessThan(1)
    await page.screenshot({ path: info.outputPath(`portrait-${side}.png`) })
    await playbackBar(page).getByRole('button', { name: '关闭' }).click()
    await expect(stage).not.toBeVisible()
    expect(
      match.messages.filter((message) => message['type'] === 'speech-playback.resolve'),
    ).toEqual([])
    await playbackBar(page).getByRole('button', { name: '显示立绘' }).click()
    await playbackBar(page).getByRole('button', { name: '跳过', exact: true }).click()
    await expect(stage).not.toBeVisible()
    await expect(page.locator('.aw-match-conversation')).not.toHaveAttribute('inert', '')
    await expect(page.locator('.aw-match-conversation')).toHaveCSS('opacity', '1')
    expect(errors).toEqual([])
  })
}

test('keeps dimmed records scrollable and clickable through the portrait', async ({
  page,
}, info) => {
  const match = await setup(page, 'left', false, thinkingMatchFixture().timeline)
  await page.route('**/speech-audio', (route) =>
    route.fulfill({
      contentType: 'audio/L16;rate=24000;channels=1',
      body: audio(12),
    }),
  )
  const feed = page.locator('.aw-feed-scroll')
  await feed.focus()
  match.publish()
  const stage = page.getByRole('region', { name: '角色播报' })
  await expect(stage).toHaveCSS('opacity', '1')
  await expect(feed).toBeFocused()
  await expect(page.locator('.aw-match-conversation')).not.toHaveAttribute('aria-hidden', 'true')
  const portrait = stage.locator('.aw-speaking-portrait')
  await expect(portrait).toHaveCSS('opacity', '1')
  await expect(stage.locator('canvas')).toHaveCSS('opacity', '1')
  await expect.poll(() => feed.evaluate((element) => element.scrollTop)).toBeGreaterThan(500)
  const original = await feed.evaluate((element) => element.scrollTop),
    box = (await portrait.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.55)
  await page.mouse.wheel(0, -420)
  await expect
    .poll(() => feed.evaluate((element) => element.scrollTop))
    .toBeLessThan(original - 100)
  const reading = await feed.evaluate((element) => element.scrollTop)
  match.send({
    type: 'speech-chunk',
    matchId: 'match-portrait-left',
    speechId: 32,
    playerId: 'player-2',
    text: '下一位正在生成发言。',
  })
  await expect(page.locator('.aw-match-conversation')).toContainText('下一位正在生成发言。')
  expect(Math.abs((await feed.evaluate((element) => element.scrollTop)) - reading)).toBeLessThan(2)
  await page.mouse.wheel(0, -10_000)
  await expect.poll(() => feed.evaluate((element) => element.scrollTop)).toBe(0)
  const toggle = page.locator('.aw-day-group__toggle').first()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  const toggleBox = (await toggle.boundingBox())!,
    hit = { x: toggleBox.x + 80, y: toggleBox.y + toggleBox.height / 2 }
  expect(hit.x).toBeGreaterThan(box.x)
  expect(hit.x).toBeLessThan(box.x + box.width)
  expect(hit.y).toBeGreaterThan(box.y)
  expect(hit.y).toBeLessThan(box.y + box.height)
  await toggle.click({ position: { x: 80, y: toggleBox.height / 2 } })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(stage).toBeVisible()
  expect(match.messages.filter((message) => message['type'] === 'speech-playback.resolve')).toEqual(
    [],
  )
  await page.screenshot({ path: info.outputPath('interactive-portrait.png') })
  await playbackBar(page).getByRole('button', { name: '跳过', exact: true }).click()
  await expect(stage).not.toBeVisible()
})

test('plays default MP3 through the media element and keeps the portrait controls available', async ({
  page,
}) => {
  const match = await setup(page, 'left', true)
  await page.route('**/speech-audio', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'audio/mpeg',
      body: readFileSync(new URL('./fixtures/speech-tone.mp3', import.meta.url)),
      headers: {
        'X-AgentWolf-Speech-Source': JSON.stringify({
          provider: 'edge-tts',
          voice: 'zh-CN-YunxiNeural',
          reason: 'browser',
        }),
      },
    }),
  )
  match.publish()
  const stage = page.getByRole('region', { name: '角色播报' })
  await expect(stage).toBeVisible()
  await expect(stage.getByText('当前浏览器使用默认语音。')).toBeVisible()
  await expect(playbackBar(page).getByRole('button', { name: '跳过', exact: true })).toBeVisible()
  await expect(stage).not.toBeVisible()
  expect(
    match.messages.some(
      (message) =>
        message['type'] === 'speech-playback.resolve' && message['outcome'] === 'completed',
    ),
  ).toBe(true)
})

test('keeps caption reflow readable while resizing and retains still artwork after context loss', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  const match = await setup(page, 'right')
  match.publish('先把每个人说过的话和投出的票逐项核对清楚，再决定该相信谁。')
  const stage = page.getByRole('region', { name: '角色播报' })
  await expect(stage.locator('canvas')).toHaveAttribute('data-ready', 'true')
  await page.setViewportSize({ width: 701, height: 900 })
  const lines = await stage
    .locator('.aw-speech-subtitles__text')
    .evaluate(
      (el) => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight),
    )
  expect(lines).toBeLessThanOrEqual(2.05)
  await stage
    .locator('canvas')
    .evaluate((el) =>
      (el as HTMLCanvasElement)
        .getContext('webgl')!
        .getExtension('WEBGL_lose_context')!
        .loseContext(),
    )
  await expect(stage.locator('canvas')).toHaveAttribute('data-ready', 'false')
  await expect(stage.locator('.aw-speaking-portrait__still')).toBeVisible()
  await playbackBar(page).getByRole('button', { name: '跳过', exact: true }).click()
})

test('changes mouth pixels with audible output and closes the mouth during a silent interval', async ({
  page,
}) => {
  await page.addInitScript(() => {
    class ObservedAudioContext extends AudioContext {
      override createAnalyser(): AnalyserNode {
        const analyser = super.createAnalyser(),
          read = analyser.getFloatTimeDomainData.bind(analyser)
        analyser.getFloatTimeDomainData = (wave) => {
          read(wave)
          ;(window as unknown as { portraitRms: number }).portraitRms = Math.sqrt(
            wave.reduce((sum, value) => sum + value * value, 0) / wave.length,
          )
        }
        return analyser
      }
    }
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: ObservedAudioContext,
    })
  })
  const match = await setup(page, 'left')
  const bytes = audio(7)
  bytes.fill(0, 24_000 * 2 * 2, 24_000 * 5 * 2)
  await page.route('**/speech-audio', (route) =>
    route.fulfill({ contentType: 'audio/L16;rate=24000;channels=1', body: bytes }),
  )
  match.publish()
  const stage = page.getByRole('region', { name: '角色播报' })
  await expect(stage).toHaveCSS('opacity', '1')
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { portraitRms: number }).portraitRms))
    .toBeGreaterThan(0.05)
  const clip = await stage.locator('canvas').evaluate((el) => {
    const box = el.getBoundingClientRect(),
      scale = Math.min(box.width / 1024, box.height / 1536)
    return {
      x: box.left + 510 * scale,
      y: box.top + box.height - 1536 * scale + 430 * scale,
      width: 82 * scale,
      height: 44 * scale,
    }
  })
  const speaking = await page.screenshot({ clip })
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { portraitRms: number }).portraitRms))
    .toBeLessThan(0.001)
  const silent = await page.screenshot({ clip })
  expect(speaking.equals(silent)).toBe(false)
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { portraitRms: number }).portraitRms))
    .toBeGreaterThan(0.05)
  const resumed = await page.screenshot({ clip })
  expect(resumed.equals(silent)).toBe(false)
  await expect(stage).not.toBeVisible()
})

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`keeps a readable two-line caption at ${viewport.width}px`, async ({ page }, info) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const match = await setup(page, 'right')
    match.publish(
      '先把这一轮所有人的发言放到一起核对，再看看投票理由是否前后一致。判断不能只靠语气，证据才是关键。',
    )
    const stage = page.getByRole('region', { name: '角色播报' })
    await expect(stage).toBeVisible()
    await expect(stage.locator('canvas')).toHaveCount(0)
    await expect(stage.locator('.aw-speech-subtitles__previous')).toBeVisible()
    const overflow = await page.locator('.aw-speech-subtitles__text').evaluate((element) => {
      const box = element.getBoundingClientRect(),
        css = getComputedStyle(element)
      return {
        lines: box.height / Number.parseFloat(css.lineHeight),
        left: box.left,
        right: box.right,
        width: window.innerWidth,
      }
    })
    expect(overflow.lines).toBeLessThanOrEqual(2.05)
    expect(overflow.left).toBeGreaterThanOrEqual(0)
    expect(overflow.right).toBeLessThanOrEqual(overflow.width)
    await page.screenshot({ path: info.outputPath(`portrait-${viewport.width}.png`) })
    await playbackBar(page).getByRole('button', { name: '跳过', exact: true }).click()
  })
}
