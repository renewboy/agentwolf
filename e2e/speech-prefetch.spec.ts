import { readFileSync } from 'node:fs'
import { expect, test } from './fixtures/test.js'
import { thinkingMatchFixture } from './fixtures/matches.js'
import {
  installSpeechSynthesisStub,
  observeNativePcmPlayback,
  pcmPlaybackObservation,
  speechTimelineItem,
} from './fixtures/speech.js'

for (const format of ['pcm', 'mp3'] as const) {
  test(`prepares the next ${format} sentence while the current sentence is still playing`, async ({
    page,
  }) => {
    await installSpeechSynthesisStub(page, { nativePcm: true })
    await observeNativePcmPlayback(page)
    const match = { ...thinkingMatchFixture(), id: `match-prefetch-${format}`, activeSpeech: null }
    const sentences = ['第一句话。', '第二句话。']
    const requested: string[] = []
    const resolutions: unknown[] = []
    let releaseNextSentence!: () => void
    const nextSentenceResponse = new Promise<void>((resolve) => {
      releaseNextSentence = resolve
    })
    let publish!: () => void
    await page.route(`**/api/matches/${match.id}?*`, (route) => route.fulfill({ json: match }))
    await page.routeWebSocket(`**/api/matches/${match.id}/live?*`, (socket) => {
      socket.send(JSON.stringify({ type: 'snapshot', view: { kind: 'closed-eye' }, data: match }))
      socket.send(
        JSON.stringify({
          type: 'speech-playback.state',
          state: { enabled: false, controlledByThisClient: false, pendingSequence: null },
        }),
      )
      socket.onMessage((value) => {
        const message = JSON.parse(String(value))
        if (message.type === 'speech-playback.set')
          socket.send(
            JSON.stringify({
              type: 'speech-playback.state',
              state: { enabled: true, controlledByThisClient: true, pendingSequence: null },
            }),
          )
        if (message.type === 'speech-playback.resolve') resolutions.push(message)
      })
      publish = () => {
        socket.send(
          JSON.stringify({
            type: 'snapshot',
            view: { kind: 'closed-eye' },
            data: {
              ...match,
              lastSequence: 31,
              timeline: [...match.timeline, speechTimelineItem(31, 'player-1', sentences.join(''))],
            },
          }),
        )
        socket.send(
          JSON.stringify({
            type: 'speech-playback.state',
            state: { enabled: true, controlledByThisClient: true, pendingSequence: 31 },
          }),
        )
      }
    })
    const bytes =
      format === 'pcm'
        ? Buffer.alloc(48_000 * 3)
        : readFileSync(new URL('./fixtures/speech-tone.mp3', import.meta.url))
    if (format === 'pcm')
      for (let index = 0; index < bytes.length; index += 2) bytes.writeInt16BE(512, index)
    await page.route(`**/api/matches/${match.id}/speech-audio`, async (route) => {
      const text = route.request().postDataJSON().text
      requested.push(text)
      // Keep every observed audio node attributable to the first sentence.
      if (text === sentences[1]) await nextSentenceResponse
      await route.fulfill({
        body: bytes,
        contentType: format === 'pcm' ? 'audio/L16;rate=24000;channels=1' : 'audio/mpeg',
        headers: {
          'X-AgentWolf-Speech-Source': JSON.stringify(
            format === 'pcm'
              ? { provider: 'qwen3-tts-0.6b' }
              : { provider: 'edge-tts', voice: 'zh-CN-YunxiNeural', reason: 'disabled' },
          ),
        },
      })
    })
    await page.goto(`/matches/${match.id}`)
    await page.getByRole('button', { name: '语音播报已关闭' }).click()
    await expect(page.getByRole('button', { name: '语音播报已开启' })).toBeVisible()
    publish()
    try {
      await expect.poll(() => requested).toEqual(sentences)
      expect(resolutions).toEqual([])
      await expect(page.getByRole('button', { name: /跳过自动播报/ })).toBeVisible()
      // Earlier PCM blocks may have ended; the first sentence must not have drained.
      await expect
        .poll(async () => {
          const audio = await pcmPlaybackObservation(page)
          return audio.nodes.some((node) => node.endedAt === null && !node.stopped)
        })
        .toBe(true)
    } finally {
      releaseNextSentence()
    }
    await expect.poll(() => resolutions).toHaveLength(1)
    expect(resolutions[0]).toMatchObject({ sequence: 31, outcome: 'completed' })
    expect(requested).toEqual(sentences)
  })
}
