import { expect, test } from '@playwright/test'
import type { MatchView } from '@agentwolf/contracts'
import { ignoreLiveMessage, thinkingMatchFixture } from './fixtures/matches.js'
import { speechTimelineItem } from './fixtures/speech.js'

for (const side of ['left', 'right'] as const) {
  test(`keeps the streaming caret inside the ${side} speech surface as text wraps`, async ({
    page,
  }, testInfo) => {
    const initial = thinkingMatchFixture()
    const playerId = initial.seats[side === 'left' ? 0 : 5]!.playerId
    let current: MatchView = {
      ...initial,
      id: `match-speech-cursor-${side}` as MatchView['id'],
      timeline: initial.timeline.slice(0, 1),
      activeSpeech: { speechId: 31 as never, playerId, text: '', final: false },
    }
    let sendLive = ignoreLiveMessage
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.route('**/api/runtime-config', (route) =>
      route.fulfill({ json: { developerMode: false } }),
    )
    await page.route(`**/api/matches/${current.id}?*`, (route) => route.fulfill({ json: current }))
    await page.routeWebSocket('**/live?*', (socket) => {
      sendLive = (message) => socket.send(JSON.stringify(message))
      sendLive({ type: 'snapshot', view: { kind: 'god' }, data: current })
    })
    await page.goto(`/matches/${current.id}`)
    await page.getByRole('button', { name: '上帝视角', exact: true }).click()

    const bubble = page.locator('.aw-speech-bubble[data-live="true"]')
    const message = bubble.locator('.aw-speech-bubble__message')
    const paragraph = message.locator('p')
    const cursor = bubble.locator('.aw-stream-cursor')
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      for (const text of [
        '',
        '先听完这一轮。',
        '这是一段持续生成的发言，用来检查光标在自动换行后仍然跟随正文。'.repeat(6),
        '第一段发言。\n\n第二段补充判断。',
      ]) {
        current = { ...current, activeSpeech: { ...current.activeSpeech!, text } }
        sendLive({ type: 'snapshot', view: { kind: 'god' }, data: current })
        await expect(paragraph).toHaveText(text)
        await expect(paragraph).toHaveCSS('font-family', /Songti SC/)
        await expect(paragraph).toHaveCSS('font-size', width === 390 ? '16px' : '17px')
        await expect(cursor).toBeVisible()
        await expect(bubble).toHaveAttribute('data-side', side)
        const geometry = await cursor.evaluate((element) => {
          const textBlock = element.closest('p')!
          const surface = element.closest('.aw-speech-bubble__message')!
          const rect = element.getBoundingClientRect()
          const bounds = textBlock.getBoundingClientRect()
          const style = getComputedStyle(textBlock)
          const textNode = [...textBlock.childNodes].findLast(
            (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
          )
          const range = document.createRange()
          if (textNode) {
            const length = textNode.textContent!.length
            range.setStart(textNode, length - 1)
            range.setEnd(textNode, length)
          }
          const lastCharacter = textNode ? range.getBoundingClientRect() : rect
          return {
            contained:
              rect.left >= bounds.left + parseFloat(style.paddingLeft) - 1 &&
              rect.right <= bounds.right - parseFloat(style.paddingRight) + 1 &&
              rect.top >= bounds.top + parseFloat(style.paddingTop) - 1 &&
              rect.bottom <= bounds.bottom - parseFloat(style.paddingBottom) + 1,
            tailDistance: Math.abs(rect.top - lastCharacter.top),
            lineHeight: parseFloat(style.lineHeight),
            ink: getComputedStyle(element).backgroundColor,
            textInk: getComputedStyle(surface).color,
          }
        })
        expect(geometry.contained).toBe(true)
        expect(geometry.tailDistance).toBeLessThanOrEqual(geometry.lineHeight)
        expect(geometry.ink).toBe(geometry.textInk)
      }
      await bubble.scrollIntoViewIfNeeded()
      await bubble.screenshot({ path: testInfo.outputPath(`speech-cursor-${side}-${width}.png`) })
    }

    const completed = current.activeSpeech!
    current = {
      ...current,
      activeSpeech: { ...completed, final: true },
      timeline: [...current.timeline, speechTimelineItem(31, playerId, completed.text)],
    }
    sendLive({ type: 'snapshot', view: { kind: 'god' }, data: current })
    await expect(page.locator('.aw-stream-cursor')).toHaveCount(0)
    await expect(page.locator('.aw-speech-bubble__message p')).toHaveText(completed.text)
  })
}
