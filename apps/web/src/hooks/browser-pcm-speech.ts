const sampleRate = 24_000
const blockBytes = 4_800
const bufferingBytes = 28_800

export class AudioActivationError extends Error {
  public constructor() {
    super('AudioContext requires a user gesture')
    this.name = 'AudioActivationError'
  }
}

interface Playback {
  readonly reader: ReadableStreamDefaultReader<Uint8Array>
  readonly sources: Set<AudioBufferSourceNode>
  readonly buffered: Uint8Array[]
  readonly resolve: () => void
  readonly reject: (error: unknown) => void
  eof: boolean
  samples: number
  nextStart: number
  bufferedBytes: number
  buffering: boolean
}

export class BrowserPcmSpeech {
  #context: AudioContext | null = null
  #playback: Playback | null = null

  public get supported(): boolean {
    return typeof AudioContext !== 'undefined'
  }

  public async prepare(): Promise<void> {
    if (!this.supported) return
    this.#context ??= new AudioContext()
    if (this.#context.state !== 'running') await this.#context.resume()
  }

  public play(stream: ReadableStream<Uint8Array>, format: 'pcm' | 'mp3' = 'pcm'): Promise<void> {
    this.cancel()
    const context = this.#context
    if (!context || context.state !== 'running') {
      void stream.cancel().catch(() => undefined)
      return Promise.reject(new AudioActivationError())
    }
    return new Promise<void>((resolve, reject) => {
      const playback: Playback = {
        reader: stream.getReader(),
        sources: new Set(),
        buffered: [],
        resolve,
        reject,
        eof: false,
        samples: 0,
        nextStart: context.currentTime + 0.025,
        bufferedBytes: 0,
        buffering: true,
      }
      this.#playback = playback
      void (
        format === 'mp3' ? this.#readEncoded(playback, context) : this.#read(playback, context)
      ).catch((error: unknown) => this.#fail(playback, error))
    })
  }

  public cancel(): void {
    const playback = this.#playback
    if (playback) this.#fail(playback, new DOMException('Playback cancelled', 'AbortError'))
  }

  public dispose(): void {
    this.cancel()
    const context = this.#context
    this.#context = null
    if (context && context.state !== 'closed') void context.close().catch(() => undefined)
  }

  async #readEncoded(playback: Playback, context: AudioContext): Promise<void> {
    const chunks: Uint8Array[] = []
    let bytes = 0
    while (this.#playback === playback) {
      const chunk = await playback.reader.read()
      if (this.#playback !== playback) return
      if (chunk.done) break
      bytes += chunk.value.length
      if (bytes > 16 * 1_024 * 1_024) throw new Error('Encoded speech exceeds size limit')
      chunks.push(chunk.value)
    }
    if (bytes === 0) throw new Error('Empty speech audio')
    const encoded = new Uint8Array(bytes)
    let offset = 0
    for (const chunk of chunks) {
      encoded.set(chunk, offset)
      offset += chunk.length
    }
    const buffer = await context.decodeAudioData(encoded.buffer)
    if (this.#playback !== playback) return
    playback.eof = true
    playback.reader.releaseLock()
    if (buffer.length === 0) throw new Error('Empty decoded speech audio')
    this.#scheduleBuffer(playback, context, buffer)
    this.#finish(playback)
  }

  async #read(playback: Playback, context: AudioContext): Promise<void> {
    let pending = new Uint8Array(0)
    while (this.#playback === playback) {
      const chunk = await playback.reader.read()
      if (this.#playback !== playback) return
      if (chunk.done) {
        if (pending.length % 2 !== 0) throw new Error('Truncated PCM sample')
        if (pending.length > 0) this.#buffer(playback, pending)
        playback.eof = true
        this.#pump(playback, context)
        if (playback.samples === 0) throw new Error('Empty speech audio')
        playback.reader.releaseLock()
        this.#finish(playback)
        return
      }
      const bytes = new Uint8Array(pending.length + chunk.value.length)
      bytes.set(pending)
      bytes.set(chunk.value, pending.length)
      let offset = 0
      for (; offset + blockBytes <= bytes.length; offset += blockBytes) {
        this.#buffer(playback, bytes.subarray(offset, offset + blockBytes))
      }
      pending = bytes.slice(offset)
      this.#pump(playback, context)
    }
  }

  #buffer(playback: Playback, bytes: Uint8Array): void {
    playback.buffered.push(bytes)
    playback.bufferedBytes += bytes.length
  }

  #pump(playback: Playback, context: AudioContext): void {
    if (playback.sources.size === 0 || playback.nextStart <= context.currentTime) {
      playback.buffering = true
    }
    if (playback.buffering && !playback.eof && playback.bufferedBytes < bufferingBytes) return
    playback.buffering = false
    for (const bytes of playback.buffered) this.#schedule(playback, context, bytes)
    playback.buffered.length = 0
    playback.bufferedBytes = 0
  }

  #schedule(playback: Playback, context: AudioContext, bytes: Uint8Array): void {
    if (context.state !== 'running') throw new AudioActivationError()
    const samples = bytes.length / 2
    const buffer = context.createBuffer(1, samples, sampleRate)
    const channel = buffer.getChannelData(0)
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    for (let index = 0; index < samples; index += 1) {
      channel[index] = view.getInt16(index * 2, false) / 32768
    }
    this.#scheduleBuffer(playback, context, buffer)
  }

  #scheduleBuffer(playback: Playback, context: AudioContext, buffer: AudioBuffer): void {
    if (context.state !== 'running') throw new AudioActivationError()
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    playback.sources.add(source)
    source.addEventListener(
      'ended',
      () => {
        source.disconnect()
        playback.sources.delete(source)
        this.#finish(playback)
      },
      { once: true },
    )
    const start =
      playback.nextStart > context.currentTime ? playback.nextStart : context.currentTime + 0.025
    source.start(start)
    playback.nextStart = start + buffer.duration
    playback.samples += buffer.getChannelData(0).length
  }

  #finish(playback: Playback): void {
    if (
      this.#playback !== playback ||
      !playback.eof ||
      playback.buffered.length !== 0 ||
      playback.sources.size !== 0
    )
      return
    this.#playback = null
    playback.resolve()
  }

  #fail(playback: Playback, error: unknown): void {
    if (this.#playback !== playback) return
    this.#playback = null
    void playback.reader.cancel().catch(() => undefined)
    for (const source of playback.sources) {
      source.stop()
      source.disconnect()
    }
    playback.sources.clear()
    playback.buffered.length = 0
    playback.bufferedBytes = 0
    playback.reject(error)
  }
}
