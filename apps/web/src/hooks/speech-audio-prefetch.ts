import type { PlaybackPreparation } from '@agent-arena/web-runtime'
import type { PlayerId, SpeechId } from '@agentwolf/contracts'
import { api } from '../api.js'
import type { SpeechAudioIdentity } from './browser-model-speech.js'

type AudioResponse = Awaited<ReturnType<typeof api.speechAudio>>
type Unit = PlaybackPreparation<PlayerId, SpeechId>
const maxBufferedBytes = 32 * 1_024 * 1_024
const maxResponseBytes = 16 * 1_024 * 1_024

interface PreparedAudio {
  readonly unit: Unit
  readonly identity: SpeechAudioIdentity
  readonly abort: AbortController
  readonly ready: Promise<AudioResponse>
  readonly resolve: (response: AudioResponse) => void
  readonly reject: (error: unknown) => void
  readonly readers: ReadableStreamDefaultReader<Uint8Array>[]
  received: number
  consumed: number
  started: boolean
  failed: boolean
}

export class SpeechAudioPrefetch {
  readonly #jobs = new Map<number, PreparedAudio>()
  #order: readonly number[] = []
  #active: PreparedAudio | null = null

  public synchronize(units: readonly Unit[], identity: SpeechAudioIdentity): void {
    const wanted = new Map(units.map((unit) => [unit.context.unitId, unit]))
    for (const [id, job] of this.#jobs) {
      const unit = wanted.get(id)
      if (unit && unit.text === job.unit.text && unit.context.key === job.unit.context.key) continue
      this.#jobs.delete(id)
      this.#abort(job)
    }
    for (const unit of units) {
      if (this.#jobs.has(unit.context.unitId)) continue
      let resolve!: PreparedAudio['resolve']
      let reject!: PreparedAudio['reject']
      const ready = new Promise<AudioResponse>((done, fail) => {
        resolve = done
        reject = fail
      })
      void ready.catch(() => undefined)
      this.#jobs.set(unit.context.unitId, {
        unit,
        identity,
        ready,
        resolve,
        reject,
        abort: new AbortController(),
        readers: [],
        received: 0,
        consumed: 0,
        started: false,
        failed: false,
      })
    }
    this.#order = units.map((unit) => unit.context.unitId)
    this.#pump()
  }

  public open(unitId: number): Promise<AudioResponse> {
    const job = this.#jobs.get(unitId)
    return job ? job.ready : Promise.reject(new Error('Speech preparation is no longer available'))
  }

  public cancel(): void {
    this.#order = []
    for (const job of this.#jobs.values()) this.#abort(job)
    this.#jobs.clear()
  }

  #pump(): void {
    if (this.#active) return
    const jobs = this.#order.map((id) => this.#jobs.get(id)!)
    if (jobs.some((job) => job.failed)) return
    const buffered = jobs.reduce((sum, job) => sum + Math.max(0, job.received - job.consumed), 0)
    if (buffered >= maxBufferedBytes) return
    const next = jobs.find((job) => !job.started)
    if (!next) return
    next.started = true
    this.#active = next
    void this.#run(next)
  }

  async #run(job: PreparedAudio): Promise<void> {
    try {
      await this.#generate(job)
    } catch (error) {
      job.failed = true
      this.#abort(job, error)
    } finally {
      this.#active = null
      this.#pump()
    }
  }

  async #generate(job: PreparedAudio): Promise<void> {
    if (!job.identity.matchId) throw new Error('Speech identity is missing')
    const response = await api.speechAudio(
      job.identity.matchId,
      {
        speechId: job.unit.context.key,
        view: job.identity.view,
        text: job.unit.text,
      },
      job.abort.signal,
    )
    if (job.abort.signal.aborted) {
      await response.stream.cancel()
      job.abort.signal.throwIfAborted()
    }
    const [playback, completion] = response.stream.tee()
    const reader = playback.getReader()
    const drain = completion.getReader()
    job.readers.push(reader, drain)
    const stream = new ReadableStream<Uint8Array>(
      {
        pull: async (controller) => {
          try {
            job.abort.signal.throwIfAborted()
            const chunk = await reader.read()
            job.abort.signal.throwIfAborted()
            if (chunk.done) controller.close()
            else {
              job.consumed += chunk.value.length
              controller.enqueue(chunk.value)
              this.#pump()
            }
          } catch (error) {
            controller.error(error)
          }
        },
        cancel: () => {
          this.#abort(job)
        },
      },
      { highWaterMark: 0 },
    )
    job.resolve({ ...response, stream })
    for (;;) {
      const chunk = await drain.read()
      job.abort.signal.throwIfAborted()
      if (chunk.done) return
      job.received += chunk.value.length
      if (job.received > maxResponseBytes) throw new Error('Prepared speech exceeds size limit')
    }
  }

  #abort(
    job: PreparedAudio,
    reason: unknown = new DOMException('Speech preparation cancelled', 'AbortError'),
  ): void {
    job.abort.abort(reason)
    job.reject(reason)
    for (const reader of job.readers) void reader.cancel(reason).catch(() => undefined)
  }
}
