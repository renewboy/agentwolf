import { waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserPcmSpeech } from '../src/hooks/browser-pcm-speech.js'
import { FakePcmContext, installPcmAudio, pcmSamples } from './helpers/fake-pcm-audio.js'

const players: BrowserPcmSpeech[] = []

async function playback() {
  const player = new BrowserPcmSpeech()
  players.push(player)
  await player.prepare()
  let writer!: ReadableStreamDefaultController<Uint8Array>
  const cancelled = vi.fn()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      writer = controller
    },
    cancel: cancelled,
  })
  const done = player.play(stream)
  void done.catch(() => undefined)
  const completed = vi.fn()
  void done.then(completed, () => undefined)
  const send = async (samples: number) => {
    writer.enqueue(pcmSamples(samples))
    await Promise.resolve()
    await Promise.resolve()
  }
  return { player, writer, done, completed, cancelled, send, audio: FakePcmContext.instances[0]! }
}

beforeEach(installPcmAudio)
afterEach(() => {
  for (const player of players.splice(0)) player.dispose()
})

describe('BrowserPcmSpeech buffering', () => {
  it('waits for 600ms across separate arrivals, then appends immediately while scheduled audio remains', async () => {
    const { send, audio, writer, done, completed } = await playback()
    await send(4_800)
    expect(audio.sources).toHaveLength(0)
    await send(4_800)
    expect(audio.sources).toHaveLength(0)
    await send(4_800)
    expect(audio.sources).toHaveLength(6)
    for (const [index, source] of audio.sources.entries()) {
      expect(source.start.mock.calls[0]?.[0]).toBeCloseTo(0.025 + index * 0.1)
      expect(source.playbackRate.value).toBe(1)
    }
    audio.currentTime = 0.62
    await send(2_400)
    expect(audio.sources).toHaveLength(7)
    expect(audio.sources[6]?.start.mock.calls[0]?.[0]).toBeCloseTo(0.625)
    const samples = audio.sources.flatMap((source) => [...source.buffer!.data])
    expect(samples).toHaveLength(16_800)
    expect(samples.every((value, index) => value === (index % 2 ? -1 : 0.5))).toBe(true)
    writer.close()
    for (const source of audio.sources.slice(0, -1)) source.finish()
    expect(completed).not.toHaveBeenCalled()
    audio.sources.at(-1)!.finish()
    await done
    expect(completed).toHaveBeenCalledOnce()
  })

  it('buffers another 600ms after the scheduled queue has drained instead of restarting every small arrival', async () => {
    const { send, audio, writer, done } = await playback()
    await send(14_400)
    for (const source of audio.sources) source.finish()
    audio.currentTime = 1
    await send(4_800)
    expect(audio.sources).toHaveLength(6)
    await send(4_800)
    expect(audio.sources).toHaveLength(6)
    await send(4_800)
    expect(audio.sources).toHaveLength(12)
    expect(audio.sources[6]?.start.mock.calls[0]?.[0]).toBeCloseTo(1.025)
    writer.close()
    for (const source of audio.sources.slice(6)) source.finish()
    await done
  })

  it('recognizes an exhausted schedule even before delayed ended callbacks are delivered', async () => {
    const { send, audio, writer, done } = await playback()
    await send(14_400)
    audio.currentTime = 0.7
    await send(4_800)
    expect(audio.sources).toHaveLength(6)
    await send(9_600)
    expect(audio.sources).toHaveLength(12)
    expect(audio.sources[6]?.start.mock.calls[0]?.[0]).toBeCloseTo(0.725)
    for (const source of audio.sources.slice(0, 6)) source.finish()
    writer.close()
    for (const source of audio.sources.slice(6)) source.finish()
    await done
  })

  it('flushes a short EOF tail while rebuffering and waits for that tail to actually end', async () => {
    const { send, audio, writer, done, completed } = await playback()
    await send(14_400)
    for (const source of audio.sources) source.finish()
    audio.currentTime = 1
    await send(1_800)
    expect(audio.sources).toHaveLength(6)
    writer.close()
    await waitFor(() => expect(audio.sources).toHaveLength(7))
    expect(audio.sources[6]?.buffer?.data).toHaveLength(1_800)
    expect(completed).not.toHaveBeenCalled()
    audio.sources[6]!.finish()
    await done
  })

  it.each(['initial', 'recovery'] as const)(
    'discards buffered samples on cancellation during %s buffering',
    async (stage) => {
      const { player, send, audio, done, cancelled } = await playback()
      if (stage === 'recovery') {
        await send(14_400)
        for (const source of audio.sources) source.finish()
        audio.currentTime = 1
      }
      const before = audio.sources.length
      await send(4_800)
      expect(audio.sources).toHaveLength(before)
      const rejected = expect(done).rejects.toMatchObject({ name: 'AbortError' })
      player.cancel()
      await rejected
      expect(cancelled).toHaveBeenCalledOnce()
      const next = player.play(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([0x10, 0]))
            controller.close()
          },
        }),
      )
      await waitFor(() => expect(audio.sources).toHaveLength(before + 1))
      expect(audio.sources.at(-1)?.buffer?.data).toEqual(new Float32Array([0.125]))
      audio.sources.at(-1)!.finish()
      await next
    },
  )
})
