import { waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BrowserMp3Speech } from '../src/hooks/browser-mp3-speech.js'
import {
  FakeMediaSource,
  FakeMp3Audio,
  installMp3Audio,
  revokeMp3Url,
} from './helpers/fake-mp3-audio.js'

const players: BrowserMp3Speech[] = []
beforeEach(installMp3Audio)
afterEach(() => players.splice(0).forEach((player) => player.cancel()))

function setup() {
  const player = new BrowserMp3Speech()
  players.push(player)
  let writer!: ReadableStreamDefaultController<Uint8Array>
  const cancelled = vi.fn()
  const done = player.play(
    new ReadableStream({
      start(value) {
        writer = value
      },
      cancel: cancelled,
    }),
  )
  const completed = vi.fn()
  void done.then(completed, () => undefined)
  return { player, writer, done, completed, cancelled }
}

it('appends the first arrival before EOF and completes only after actual playback ends', async () => {
  const { writer, done, completed } = setup()
  writer.enqueue(new Uint8Array(0))
  writer.enqueue(new Uint8Array([1, 2, 3]))
  const media = FakeMediaSource.all[0]!
  const audio = FakeMp3Audio.all[0]!
  await waitFor(() => expect(media.buffer.appendBuffer).toHaveBeenCalledOnce())
  expect(audio.play).toHaveBeenCalledOnce()
  expect(media.endOfStream).not.toHaveBeenCalled()
  expect(completed).not.toHaveBeenCalled()
  writer.enqueue(new Uint8Array([4, 5]))
  writer.close()
  await waitFor(() => expect(media.endOfStream).toHaveBeenCalledOnce())
  expect(media.buffer.appendBuffer).toHaveBeenCalledTimes(2)
  expect(completed).not.toHaveBeenCalled()
  audio.dispatchEvent(new Event('ended'))
  await done
  expect(revokeMp3Url).toHaveBeenCalledOnce()
})

it.each(['cancel', 'network', 'decode', 'source'] as const)(
  'stops streaming on %s and ignores late ended events',
  async (reason) => {
    const { writer, player, done, completed, cancelled } = setup()
    writer.enqueue(new Uint8Array([1, 2, 3]))
    await waitFor(() => expect(FakeMediaSource.all[0]!.buffer.appendBuffer).toHaveBeenCalledOnce())
    const failed = expect(done).rejects.toBeDefined()
    if (reason === 'cancel') player.cancel()
    else if (reason === 'network') writer.error(new Error('disconnected'))
    else if (reason === 'decode') FakeMp3Audio.all[0]!.dispatchEvent(new Event('error'))
    else FakeMediaSource.all[0]!.dispatchEvent(new Event('sourceclose'))
    await failed
    FakeMp3Audio.all[0]!.dispatchEvent(new Event('ended'))
    expect(completed).not.toHaveBeenCalled()
    expect(FakeMp3Audio.all[0]!.pause).toHaveBeenCalledOnce()
    expect(revokeMp3Url).toHaveBeenCalledOnce()
    if (reason !== 'network') expect(cancelled).toHaveBeenCalledOnce()
  },
)

it('rejects an empty response without claiming completion', async () => {
  const { writer, done } = setup()
  writer.close()
  await expect(done).rejects.toThrow('Empty MP3 audio')
})

it('cancels audio that exceeds the encoded response limit', async () => {
  const { writer, done, cancelled } = setup()
  writer.enqueue(new Uint8Array(16 * 1_024 * 1_024 + 1))
  await expect(done).rejects.toThrow('Encoded speech exceeds size limit')
  expect(cancelled).toHaveBeenCalledOnce()
  expect(FakeMediaSource.all[0]!.buffer.appendBuffer).not.toHaveBeenCalled()
})

it.each(['decode', 'quota'])(
  'releases the stream when the media buffer fails with %s',
  async (reason) => {
    const { writer, done, cancelled } = setup()
    const buffer = FakeMediaSource.all[0]!.buffer
    buffer.appendBuffer.mockImplementation(() => {
      if (reason === 'quota') throw new DOMException('Buffer full', 'QuotaExceededError')
      queueMicrotask(() => buffer.dispatchEvent(new Event('error')))
    })
    writer.enqueue(new Uint8Array([1, 2, 3]))
    await expect(done).rejects.toBeDefined()
    expect(cancelled).toHaveBeenCalledOnce()
    expect(revokeMp3Url).toHaveBeenCalledOnce()
  },
)

it('cleans up when the browser rejects audio activation before data arrives', async () => {
  vi.stubGlobal(
    'Audio',
    class extends FakeMp3Audio {
      override play = vi.fn(async () => {
        throw new DOMException('Gesture required', 'NotAllowedError')
      })
    },
  )
  const { done, cancelled } = setup()
  await expect(done).rejects.toMatchObject({ name: 'NotAllowedError' })
  expect(cancelled).toHaveBeenCalledOnce()
  expect(revokeMp3Url).toHaveBeenCalledOnce()
})
