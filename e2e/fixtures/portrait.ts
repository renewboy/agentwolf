import type { Page } from '@playwright/test'
import type { MatchView } from '@agentwolf/contracts'
import builtInCharacterCards from '../../packages/assets/characters/zh-CN.json' with { type: 'json' }
import { thinkingMatchFixture, ignoreLiveMessage } from './matches.js'
import { installSpeechSynthesisStub, speechTimelineItem } from './speech.js'

export const gin = builtInCharacterCards.find((card) => card.id === 'character-gin')!
export const playbackBar = (page: Page) => page.getByRole('region', { name: '语音播放' })

export const opening = '首夜暂无公开信息，建议不自刀、不空刀，'
export function audio(seconds = 4): Buffer {
  const bytes = Buffer.alloc(24_000 * seconds * 2)
  for (let i = 0; i < bytes.length / 2; i++) {
    const envelope = i % 24_000 < 18_000 ? 0.12 : 0
    bytes.writeInt16BE(Math.round(Math.sin((i / 24_000) * Math.PI * 360) * 32767 * envelope), i * 2)
  }
  return bytes
}
export async function setup(
  page: Page,
  side: 'left' | 'right',
  media = false,
  history: MatchView['timeline'] = [],
) {
  if (media)
    await page.addInitScript(() => {
      Object.defineProperty(window, 'AudioContext', { configurable: true, value: undefined })
    })
  else await installSpeechSynthesisStub(page, { nativePcm: true })
  const index = side === 'left' ? 0 : 4
  const base = thinkingMatchFixture()
  let current = {
    ...base,
    id: `match-portrait-${side}`,
    seats: base.seats.map((seat, i) => ({ ...seat, character: i === index ? gin : null })),
    timeline: history,
  } as unknown as MatchView
  let send = ignoreLiveMessage
  const messages: Array<Record<string, unknown>> = []
  await page.route(`**/api/matches/${current.id}?*`, (route) => route.fulfill({ json: current }))
  await page.route(`**/api/matches/${current.id}/speech-audio`, (route) =>
    route.fulfill({ status: 200, contentType: 'audio/L16;rate=24000;channels=1', body: audio() }),
  )
  await page.routeWebSocket(`**/api/matches/${current.id}/live?*`, (socket) => {
    send = (message) => socket.send(JSON.stringify(message))
    send({ type: 'snapshot', view: { kind: 'closed-eye' }, data: current })
    send({
      type: 'speech-playback.state',
      state: { enabled: false, controlledByThisClient: false, pendingSequence: null },
    })
    socket.onMessage((value) => {
      const message = JSON.parse(String(value)) as Record<string, unknown>
      messages.push(message)
      if (message['type'] === 'speech-playback.set')
        send({
          type: 'speech-playback.state',
          state: {
            enabled: Boolean(message['enabled']),
            controlledByThisClient: Boolean(message['enabled']),
            pendingSequence: null,
          },
        })
      if (message['type'] === 'view.set')
        send({ type: 'snapshot', view: message['view'], data: { ...current, activeSpeech: null } })
    })
  })
  await page.goto(`/matches/${current.id}`)
  await page.getByRole('button', { name: '语音播报已关闭' }).click()
  const publish = (text = opening, sequence = 31) => {
    current = {
      ...current,
      lastSequence: sequence,
      activeSpeech: null,
      timeline: [...history, speechTimelineItem(sequence, current.seats[index]!.playerId, text)],
    }
    send({ type: 'snapshot', view: { kind: 'closed-eye' }, data: current })
    send({
      type: 'speech-playback.state',
      state: { enabled: true, controlledByThisClient: true, pendingSequence: sequence },
    })
  }
  return {
    publish,
    messages,
    send,
    player: current.seats[index]!,
    get view() {
      return current
    },
    update(view: MatchView) {
      current = view
      send({ type: 'snapshot', view: { kind: 'closed-eye' }, data: current })
    },
  }
}
