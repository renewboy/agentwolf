import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { MatchView } from '@agentwolf/contracts'
import { ignoreLiveMessage, thinkingMatchFixture } from './fixtures/matches.js'
import {
  installSpeechSynthesisStub,
  observeNativePcmPlayback,
  pcmPlaybackObservation,
  speechStubRates,
  speechStubState,
  speechTimelineItem,
} from './fixtures/speech.js'
import { expect, test } from './fixtures/test.js'

const text = '这段发言使用角色音色播放。'

function pcmFixture(seconds = 2): Buffer {
  const samples = 24_000 * seconds
  const audio = Buffer.alloc(samples * 2)
  for (let index = 0; index < samples; index += 1) {
    audio.writeInt16BE(Math.round(Math.sin((2 * Math.PI * 220 * index) / 24_000) * 512), index * 2)
  }
  for (const [index, value] of [256, -256, 512, -512].entries())
    audio.writeInt16BE(value, index * 2)
  return audio
}

async function controlledPcmRoute(page: Page, matchId: string) {
  let ready = false
  let aborted = false
  let write = (_bytes: Buffer): void => {
    throw new Error('Audio request has not arrived')
  }
  let end = (): void => {}
  let destroy = (): void => {}
  const server = createServer((request, reply) => {
    request.resume()
    reply.setHeader('Access-Control-Allow-Origin', '*')
    reply.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    reply.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (request.method === 'OPTIONS') {
      reply.writeHead(204)
      reply.end()
      return
    }
    ready = true
    write = (bytes) => {
      reply.write(bytes)
    }
    end = () => {
      reply.end()
    }
    destroy = () => {
      reply.destroy()
    }
    reply.once('close', () => {
      aborted = !reply.writableFinished
    })
    reply.writeHead(200, { 'Content-Type': 'audio/L16;rate=24000;channels=1' })
    reply.flushHeaders()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing streamed audio test address')
  await page.route(`**/api/matches/${matchId}/speech-audio`, (route) =>
    route.continue({ url: `http://127.0.0.1:${address.port}/speech-audio` }),
  )
  return {
    ready: () => ready,
    write: (seconds: number) => {
      write(pcmFixture(seconds))
    },
    end: () => {
      end()
    },
    aborted: () => aborted,
    close: async () => {
      destroy()
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    },
  }
}

async function setup(page: Page, suffix: string) {
  await installSpeechSynthesisStub(page, { nativePcm: true })
  await observeNativePcmPlayback(page)
  const initial = {
    ...thinkingMatchFixture(),
    id: `match-qwen-${suffix}`,
    activeSpeech: null,
  } as MatchView
  let current = initial
  let sendLive: (message: unknown) => void = ignoreLiveMessage
  const messages: Array<Record<string, unknown>> = []
  const completionStates: Array<{
    outcome: string
    sequence: number
    eof: boolean
    pendingNodes: number
  }> = []
  await page.route(`**/api/matches/${initial.id}?*`, (route) => route.fulfill({ json: current }))
  await page.routeWebSocket(`**/api/matches/${initial.id}/live?*`, (socket) => {
    sendLive = (message) => socket.send(JSON.stringify(message))
    sendLive({ type: 'snapshot', view: { kind: 'closed-eye' }, data: current })
    sendLive({
      type: 'speech-playback.state',
      state: { enabled: false, controlledByThisClient: false, pendingSequence: null },
    })
    socket.onMessage(async (value) => {
      const message = JSON.parse(String(value)) as Record<string, unknown>
      if (message['type'] === 'speech-playback.resolve') {
        const observation = await pcmPlaybackObservation(page)
        completionStates.push({
          outcome: String(message['outcome']),
          sequence: Number(message['sequence']),
          eof: observation.eofAt !== null,
          pendingNodes: observation.nodes.filter(({ endedAt }) => endedAt === null).length,
        })
      }
      messages.push(message)
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
  return {
    id: initial.id,
    completionStates,
    resolutions: () => messages.filter((message) => message['type'] === 'speech-playback.resolve'),
    publish: () => {
      current = {
        ...current,
        lastSequence: 31,
        activeSpeech: { speechId: 31 as never, playerId: 'player-1' as never, text, final: true },
        timeline: [...current.timeline, speechTimelineItem(31, 'player-1', text)],
      }
      sendLive({ type: 'snapshot', view: { kind: 'closed-eye' }, data: current })
      sendLive({
        type: 'speech-playback.state',
        state: { enabled: true, controlledByThisClient: true, pendingSequence: 31 },
      })
    },
    lateChunk: () =>
      sendLive({
        type: 'speech-chunk',
        matchId: initial.id,
        speechId: 31,
        playerId: 'player-1',
        text: '迟到的内容。',
      }),
  }
}

test('plays native L16 PCM at rate one and acknowledges only after EOF and every audio node ended', async ({
  page,
}) => {
  const match = await setup(page, 'native-completion')
  const bodies: unknown[] = []
  await page.route(`**/api/matches/${match.id}/speech-audio`, async (route) => {
    expect(route.request().method()).toBe('POST')
    bodies.push(route.request().postDataJSON())
    await route.fulfill({
      status: 200,
      contentType: 'audio/L16;rate=24000;channels=1',
      body: pcmFixture(),
    })
  })
  match.publish()
  await expect.poll(async () => (await pcmPlaybackObservation(page)).eofAt).not.toBeNull()
  const playing = await pcmPlaybackObservation(page)
  expect(playing.nodes.some(({ endedAt }) => endedAt === null)).toBe(true)
  expect(match.resolutions()).toEqual([])
  expect(playing.nodes.every(({ rate, sampleRate }) => rate === 1 && sampleRate === 24_000)).toBe(
    true,
  )
  expect(playing.nodes.reduce((sum, { frames }) => sum + frames, 0)).toBe(48_000)
  expect(playing.nodes[0]?.samples).toEqual([256, -256, 512, -512].map((value) => value / 32768))
  expect(bodies).toEqual([{ speechId: 31, view: { kind: 'closed-eye' }, text }])
  await expect
    .poll(() => match.resolutions().map((message) => message['outcome']))
    .toEqual(['completed'])
  expect(match.completionStates).toEqual([
    { outcome: 'completed', sequence: 31, eof: true, pendingNodes: 0 },
  ])
  expect(await speechStubState(page)).toEqual([])
})

test('skip stops native nodes and suppresses late completion and speech chunks', async ({
  page,
}) => {
  const match = await setup(page, 'native-skip')
  let requests = 0
  await page.route(`**/api/matches/${match.id}/speech-audio`, async (route) => {
    requests += 1
    await route.fulfill({
      status: 200,
      contentType: 'audio/L16;rate=24000;channels=1',
      body: pcmFixture(),
    })
  })
  match.publish()
  await expect
    .poll(async () => (await pcmPlaybackObservation(page)).nodes.length)
    .toBeGreaterThan(0)
  await page.getByRole('button', { name: /跳过自动播报/ }).click()
  await expect
    .poll(() => match.resolutions().map((message) => message['outcome']))
    .toEqual(['skipped'])
  match.lateChunk()
  await expect
    .poll(async () =>
      (await pcmPlaybackObservation(page)).nodes.every(({ endedAt }) => endedAt !== null),
    )
    .toBe(true)
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  const observation = await pcmPlaybackObservation(page)
  expect(observation.nodes.some(({ stopped }) => stopped)).toBe(true)
  expect(observation.abortCount).toBeGreaterThan(0)
  expect(match.resolutions().map((message) => message['outcome'])).toEqual(['skipped'])
  expect(requests).toBe(1)
  expect(await speechStubState(page)).toEqual([])
})

test('buffers separate HTTP arrivals before playback and after underrun, then flushes a short EOF tail', async ({
  page,
}) => {
  const match = await setup(page, 'native-buffering')
  const source = await controlledPcmRoute(page, match.id)
  try {
    match.publish()
    await expect.poll(source.ready).toBe(true)
    for (const bytes of [9_600, 19_200]) {
      source.write(0.2)
      await expect.poll(async () => (await pcmPlaybackObservation(page)).receivedBytes).toBe(bytes)
      expect((await pcmPlaybackObservation(page)).nodes).toHaveLength(0)
    }
    source.write(0.2)
    await expect.poll(async () => (await pcmPlaybackObservation(page)).nodes.length).toBe(6)
    await expect
      .poll(async () =>
        (await pcmPlaybackObservation(page)).nodes.every(({ endedAt }) => endedAt !== null),
      )
      .toBe(true)
    expect(match.resolutions()).toEqual([])
    for (const bytes of [38_400, 48_000]) {
      source.write(0.2)
      await expect.poll(async () => (await pcmPlaybackObservation(page)).receivedBytes).toBe(bytes)
      expect((await pcmPlaybackObservation(page)).nodes).toHaveLength(6)
    }
    source.write(0.2)
    await expect.poll(async () => (await pcmPlaybackObservation(page)).nodes.length).toBe(12)
    await expect
      .poll(async () =>
        (await pcmPlaybackObservation(page)).nodes.every(({ endedAt }) => endedAt !== null),
      )
      .toBe(true)
    source.write(0.1)
    await expect.poll(async () => (await pcmPlaybackObservation(page)).receivedBytes).toBe(62_400)
    expect((await pcmPlaybackObservation(page)).nodes).toHaveLength(12)
    source.end()
    await expect
      .poll(() => match.resolutions().map((message) => message['outcome']))
      .toEqual(['completed'])
    const observation = await pcmPlaybackObservation(page)
    expect(observation.nodes).toHaveLength(13)
    expect(observation.nodes.reduce((sum, { frames }) => sum + frames, 0)).toBe(31_200)
    expect(
      observation.nodes.every(({ rate, sampleRate }) => rate === 1 && sampleRate === 24_000),
    ).toBe(true)
    expect(match.completionStates).toEqual([
      { outcome: 'completed', sequence: 31, eof: true, pendingNodes: 0 },
    ])
  } finally {
    await source.close()
  }
})

test('skip cancels an HTTP stream during initial buffering without creating audio nodes', async ({
  page,
}) => {
  const match = await setup(page, 'native-buffering-skip')
  const source = await controlledPcmRoute(page, match.id)
  try {
    match.publish()
    await expect.poll(source.ready).toBe(true)
    source.write(0.2)
    await expect.poll(async () => (await pcmPlaybackObservation(page)).receivedBytes).toBe(9_600)
    expect((await pcmPlaybackObservation(page)).nodes).toHaveLength(0)
    await page.getByRole('button', { name: /跳过自动播报/ }).click()
    await expect
      .poll(() => match.resolutions().map((message) => message['outcome']))
      .toEqual(['skipped'])
    await expect.poll(source.aborted).toBe(true)
    match.lateChunk()
    expect((await pcmPlaybackObservation(page)).nodes).toHaveLength(0)
    expect(await speechStubState(page)).toEqual([])
  } finally {
    await source.close()
  }
})

test('model preparation places a dismissible small notice below the speech playback button', async ({
  page,
}) => {
  const match = await setup(page, 'default-while-preparing')
  const mp3 = readFileSync(new URL('./fixtures/speech-tone.mp3', import.meta.url))
  let ready = false
  await page.route(`**/api/matches/${match.id}/speech-audio`, (route) =>
    ready
      ? route.fulfill({
          status: 200,
          contentType: 'audio/L16;rate=24000;channels=1',
          body: pcmFixture(),
        })
      : route.fulfill({
          status: 200,
          contentType: 'audio/mpeg',
          body: mp3,
          headers: {
            'X-AgentWolf-Speech-Source': JSON.stringify({
              provider: 'edge-tts',
              voice: 'zh-CN-YunxiNeural',
              reason: 'preparing',
            }),
          },
        }),
  )
  match.publish()
  const notice = page.locator('.aw-audio-notice')
  await expect(notice).toContainText('角色音色准备中，暂用默认语音。')
  await expect(notice).not.toContainText('云希')
  const bubble = page.locator('.aw-speech-bubble').filter({ has: notice })
  await expect(bubble).toHaveCount(1)
  const button = await bubble.locator('.aw-speech-audio-control').boundingBox()
  const box = await notice.boundingBox()
  expect(box!.y).toBeGreaterThanOrEqual(button!.y + button!.height)
  expect(box!.y - button!.y - button!.height).toBeLessThan(10)
  await expect(notice).toHaveCSS('font-size', '12px')
  await expect(notice).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(page.locator('.aw-match-stage > .aw-audio-notice')).toHaveCount(0)
  await page.getByRole('button', { name: '不再提示' }).click()
  await expect(page.locator('.aw-audio-notice')).toBeHidden()
  await expect
    .poll(() => match.resolutions().map((message) => message['outcome']))
    .toEqual(['completed'])
  expect(await speechStubState(page)).toEqual([])
  expect(
    await page.evaluate(() => localStorage.getItem('agentwolf.hide-speech-fallback-notice')),
  ).toBe('true')
  ready = true
  await page
    .getByRole('button', { name: /播放这段发言/ })
    .first()
    .click()
  await expect
    .poll(async () => (await pcmPlaybackObservation(page)).nodes.length)
    .toBeGreaterThan(1)
  await expect(page.locator('.aw-audio-notice')).toBeHidden()
})

for (const status of [403, 404]) {
  test(`HTTP ${status} rejects audio without falling back to system speech`, async ({ page }) => {
    const match = await setup(page, `denied-${status}`)
    await page.route(`**/api/matches/${match.id}/speech-audio`, (route) =>
      route.fulfill({
        status,
        json: { code: 'speech-audio-not-visible', message: '发言不可见' },
      }),
    )
    match.publish()
    await expect
      .poll(() => match.resolutions().map((message) => message['outcome']))
      .toEqual(['skipped'])
    expect(await speechStubState(page)).toEqual([])
    expect(await speechStubRates(page)).toEqual([])
    expect((await pcmPlaybackObservation(page)).nodes).toEqual([])
  })
}
