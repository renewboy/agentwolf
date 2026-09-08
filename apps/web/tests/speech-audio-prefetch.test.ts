import { waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { PlaybackPreparation } from '@agent-arena/web-runtime'
import { MatchIdSchema, PlayerIdSchema, SpeechIdSchema } from '@agentwolf/contracts'
import { SpeechAudioPrefetch } from '../src/hooks/speech-audio-prefetch.js'
import { pcmResponse, pcmSamples } from './helpers/fake-pcm-audio.js'

const fetchMock = vi.fn<typeof fetch>()
const queues: SpeechAudioPrefetch[] = []
const identity = {
  matchId: MatchIdSchema.parse('match-prefetch-test'),
  view: { kind: 'god' as const },
}
const units = [1, 2, 3].map((unitId) => ({
  text: unitId === 3 ? '下一段。' : '相同的句子。',
  context: { unitId, key: SpeechIdSchema.parse(17), actor: PlayerIdSchema.parse('player-1') },
})) satisfies readonly PlaybackPreparation[]

function controlledAudio() {
  let writer!: ReadableStreamDefaultController<Uint8Array>
  const cancelled = vi.fn()
  const response = pcmResponse(
    new ReadableStream({
      start(value) {
        writer = value
      },
      cancel: cancelled,
    }),
  )
  return { writer, response, cancelled }
}
function queue() {
  const value = new SpeechAudioPrefetch()
  queues.push(value)
  return value
}
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => queues.splice(0).forEach((value) => value.cancel()))

it('starts each next inference at EOF while preceding audio remains completely unplayed', async () => {
  const first = controlledAudio(),
    second = controlledAudio(),
    third = controlledAudio()
  fetchMock
    .mockResolvedValueOnce(first.response)
    .mockResolvedValueOnce(second.response)
    .mockResolvedValueOnce(third.response)
  const value = queue()
  value.synchronize(units, identity)
  const audio = await value.open(1)
  first.writer.enqueue(pcmSamples(24_000))
  await Promise.resolve()
  expect(fetchMock).toHaveBeenCalledOnce()
  first.writer.close()
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  expect(audio.stream.locked).toBe(false)
  second.writer.enqueue(pcmSamples(24_000))
  second.writer.close()
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
  value.synchronize(units, identity)
  expect(fetchMock).toHaveBeenCalledTimes(3)
  expect(JSON.parse(fetchMock.mock.calls[1]![1]!.body as string)).toEqual({
    speechId: 17,
    text: '相同的句子。',
    view: { kind: 'god' },
  })
  expect(new Uint8Array(await new Response(audio.stream).arrayBuffer())).toEqual(pcmSamples(24_000))
  third.writer.enqueue(pcmSamples())
  third.writer.close()
})

it('aborts pending and buffered inference and releases a late response after cancellation', async () => {
  const late = controlledAudio()
  let respond!: (response: Response) => void
  fetchMock.mockImplementation(
    () =>
      new Promise((resolve) => {
        respond = resolve
      }),
  )
  const value = queue()
  value.synchronize(units, identity)
  const waiting = value.open(1)
  value.cancel()
  await expect(waiting).rejects.toMatchObject({ name: 'AbortError' })
  expect(fetchMock.mock.calls[0]![1]!.signal!.aborted).toBe(true)
  respond(late.response)
  await waitFor(() => expect(late.cancelled).toHaveBeenCalledOnce())
  expect(fetchMock).toHaveBeenCalledOnce()
})

it('holds a failed prepared unit for its playback error and resumes only when the queue removes it', async () => {
  fetchMock.mockResolvedValueOnce(
    Response.json({ code: 'tts-unavailable', message: 'Unavailable' }, { status: 503 }),
  )
  const value = queue()
  value.synchronize(units, identity)
  await expect(value.open(1)).rejects.toMatchObject({ code: 'tts-unavailable' })
  expect(fetchMock).toHaveBeenCalledOnce()
  const next = controlledAudio()
  fetchMock.mockResolvedValueOnce(next.response)
  value.synchronize([units[2]!], identity)
  await value.open(3)
  expect(fetchMock).toHaveBeenCalledTimes(2)
  next.writer.enqueue(pcmSamples())
  next.writer.close()
})

it('bounds unplayed buffering and resumes inference as soon as playback consumes buffered data', async () => {
  const large = () =>
    pcmResponse(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(16 * 1_024 * 1_024))
          controller.close()
        },
      }),
    )
  const third = controlledAudio()
  fetchMock
    .mockResolvedValueOnce(large())
    .mockResolvedValueOnce(large())
    .mockResolvedValueOnce(third.response)
  const value = queue()
  value.synchronize(units, identity)
  const first = await value.open(1)
  await value.open(2)
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(fetchMock).toHaveBeenCalledTimes(2)
  const reader = first.stream.getReader()
  await reader.read()
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
  await reader.cancel()
})

it('rejects oversized inference and cancels its transport', async () => {
  const input = controlledAudio()
  fetchMock.mockResolvedValue(input.response)
  const value = queue()
  value.synchronize([units[0]!], identity)
  const audio = await value.open(1)
  input.writer.enqueue(new Uint8Array(16 * 1_024 * 1_024 + 1))
  await waitFor(() => expect(fetchMock.mock.calls[0]![1]!.signal!.aborted).toBe(true))
  await expect(audio.stream.getReader().read()).rejects.toThrow(
    'Prepared speech exceeds size limit',
  )
})
