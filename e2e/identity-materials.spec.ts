import type { MatchView } from '@agentwolf/contracts'
import manifest from '../packages/assets/art/roles/manifest.json' with { type: 'json' }
import { thinkingMatchFixture } from './fixtures/matches.js'
import { expect, test } from './fixtures/test.js'

test('renders the identity material catalog with unclipped silhouettes and both paper bubbles', async ({
  page,
  request,
  resources: _resources,
}, testInfo) => {
  const identities = manifest.roles.filter((role) => role.id !== 'hidden')
  const registered = (await (await request.get('/api/roles')).json()) as { id: string }[]
  for (const role of registered) expect(identities.some((entry) => entry.id === role.id)).toBe(true)
  const base = thinkingMatchFixture()
  const text =
    '先把发言与票型放在一起看，再决定今天的选择。\n\n尚未公开的信息，我会保留判断。请把推断依据讲清楚，让其他玩家能够沿着同一份信息继续判断。'
  const match = {
    ...base,
    id: 'match-identity-material-review',
    seats: identities.map((role, index) => ({
      ...base.seats[index % base.seats.length]!,
      playerId: `player-${index + 1}`,
      seat: index + 1,
      name: role.label,
      roleId: role.id,
      roleName: role.label,
      active: false,
      sheriff: false,
      alive: true,
      sessionStatus: 'ready',
      agent: { name: 'Agent', model: 'Model', reasoningEffort: 'high' },
    })),
    timeline: [0, 10].map((index) => ({
      ...base.timeline[1]!,
      sequence: index + 2,
      speechId: index + 2,
      playerIds: [`player-${index + 1}`],
      title: text,
    })),
  } as MatchView
  await page.route(`**/api/matches/${match.id}?*`, (route) => route.fulfill({ json: match }))
  await page.routeWebSocket('**/live?*', (socket) => {
    socket.send(JSON.stringify({ type: 'snapshot', view: { kind: 'god' }, data: match }))
  })
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto(`/matches/${match.id}`)
  await page.getByRole('button', { name: '上帝视角', exact: true }).click()
  const cards = page.locator('.aw-player-rail .aw-player-card')
  await expect(cards).toHaveCount(20)
  await expect
    .poll(() =>
      cards
        .locator('img')
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true)
  for (const side of ['left', 'right']) {
    const bubble = page.locator(`.aw-speech-bubble[data-side="${side}"]`)
    await bubble.scrollIntoViewIfNeeded()
    await expect(bubble.locator('.aw-speech-bubble__avatar img')).toHaveCount(1)
    await expect(bubble.locator('.aw-speech-bubble__avatar > span')).toHaveCount(0)
    const pointsTowardAvatar = await bubble.evaluate((element) => {
      const avatar = element.querySelector('.aw-speech-bubble__avatar')!.getBoundingClientRect()
      const pointer = element.querySelector('.aw-speech-bubble__pointer')!.getBoundingClientRect()
      return pointer.top >= avatar.top && pointer.top < avatar.bottom
    })
    expect(pointsTowardAvatar).toBe(true)
    const overlap = await bubble.evaluate((element) => {
      const paragraph = element.querySelector('p')!
      const range = document.createRange()
      range.selectNodeContents(paragraph)
      const textBounds = range.getBoundingClientRect()
      const landscape = element
        .querySelector('.aw-speech-bubble__landscape')!
        .getBoundingClientRect()
      return textBounds.bottom > landscape.top
    })
    expect(overlap).toBe(false)
    await bubble.screenshot({ path: testInfo.outputPath(`speech-${side}.png`) })
  }
  const markup = await cards.evaluateAll((elements) => elements.map((element) => element.outerHTML))
  const stylesheets = await page
    .locator('link[rel="stylesheet"]')
    .evaluateAll((elements) => elements.map((element) => (element as HTMLLinkElement).href))
  const inlineStyles = await page.locator('style').allTextContents()
  const gallery = await page.context().newPage()
  await gallery.setViewportSize({ width: 1160, height: 980 })
  await gallery.setContent(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><base href="${new URL(page.url()).origin}/">${stylesheets.map((url) => `<link rel="stylesheet" href="${url}">`).join('')}<style>${inlineStyles.join('\n')}</style><style>
    body{margin:0;padding:36px;background:#151712;color:#ded2b5;font-family:'Songti SC',serif}
    h1{font-size:28px;font-weight:400;margin:0 0 10px}p{font-size:14px;color:#aaa18b;margin:0 0 28px}
    .material-gallery{display:grid;grid-template-columns:repeat(4,252px);gap:26px}
    .material-gallery>.aw-player-card{min-height:132px}
  </style></head><body><h1>身份材质 · 20 款</h1><p>异形狼月头像框 · 矿物颜料印面 · 动态身份与编号</p><div class="material-gallery">${markup.join('')}</div></body></html>`)
  await expect
    .poll(() =>
      gallery
        .locator('img')
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true)
  await gallery.screenshot({ path: testInfo.outputPath('identity-gallery.png'), fullPage: true })
  await gallery.close()
})
