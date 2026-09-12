import type { BrowserAudioStatus } from '@agent-arena/react'

interface Mp3Playback {
  readonly audio: HTMLAudioElement
  readonly media: MediaSource
  readonly url: string
  readonly reader: ReadableStreamDefaultReader<Uint8Array>
  readonly lifetime: AbortController
  readonly resolve: () => void
  readonly reject: (error: unknown) => void
  readonly source: MediaElementAudioSourceNode | null
  eof: boolean
}

export class BrowserMp3Speech {
  #playback: Mp3Playback | null = null
  #context: AudioContext | null = null
  #analyser: AnalyserNode | null = null
  #wave: Float32Array<ArrayBuffer> | null = null
  #playing = false

  public async prepare(): Promise<void> {
    if (typeof AudioContext === 'undefined') return
    if (!this.#context) {
      this.#context = new AudioContext()
      this.#analyser = this.#context.createAnalyser()
      this.#analyser.fftSize = 1024
      this.#wave = new Float32Array(this.#analyser.fftSize)
      this.#analyser.connect(this.#context.destination)
    }
    if (this.#context.state !== 'running') await this.#context.resume()
  }

  public readLevel = (): number => {
    if (!this.#playing || this.#context?.state !== 'running' || !this.#analyser || !this.#wave)
      return 0
    this.#analyser.getFloatTimeDomainData(this.#wave)
    let power = 0
    for (const sample of this.#wave) power += sample * sample
    return Math.min(1, Math.sqrt(power / this.#wave.length))
  }

  public dispose(): void {
    this.cancel()
    this.#analyser?.disconnect()
    const context = this.#context
    this.#context = null
    this.#analyser = null
    this.#wave = null
    if (context && context.state !== 'closed') void context.close().catch(() => undefined)
  }

  public play(
    stream: ReadableStream<Uint8Array>,
    onStatus?: (status: BrowserAudioStatus) => void,
  ): Promise<void> {
    this.cancel()
    return new Promise((resolve, reject) => {
      const media = new MediaSource()
      const audio = new Audio()
      const source = this.#context?.createMediaElementSource(audio) ?? null
      if (source) source.connect(this.#analyser!)
      const playback: Mp3Playback = {
        audio,
        media,
        url: URL.createObjectURL(media),
        reader: stream.getReader(),
        lifetime: new AbortController(),
        resolve,
        reject,
        source,
        eof: false,
      }
      this.#playback = playback
      const options = { signal: playback.lifetime.signal }
      audio.addEventListener(
        'playing',
        () => {
          this.#playing = true
          onStatus?.('playing')
        },
        options,
      )
      audio.addEventListener(
        'waiting',
        () => {
          this.#playing = false
          onStatus?.('buffering')
        },
        options,
      )
      audio.addEventListener(
        'error',
        () => this.#settle(playback, new Error('MP3 decoding failed')),
        options,
      )
      audio.addEventListener(
        'ended',
        () => {
          if (playback.eof) this.#settle(playback)
        },
        options,
      )
      media.addEventListener(
        'sourceclose',
        () => this.#settle(playback, new Error('MP3 source closed')),
        options,
      )
      const opened = mediaEvent(media, 'sourceopen', playback.lifetime.signal)
      onStatus?.('preparing')
      audio.src = playback.url
      audio.playbackRate = 1
      void this.#read(playback, opened).catch((error: unknown) => this.#settle(playback, error))
      void audio.play().catch((error: unknown) => this.#settle(playback, error))
    })
  }

  public cancel(): void {
    if (this.#playback)
      this.#settle(this.#playback, new DOMException('Playback cancelled', 'AbortError'))
  }

  async #read(playback: Mp3Playback, opened: Promise<void>): Promise<void> {
    await opened
    const { media, reader, lifetime } = playback
    lifetime.signal.throwIfAborted()
    const buffer = media.addSourceBuffer('audio/mpeg')
    let bytes = 0
    for (;;) {
      const chunk = await reader.read()
      lifetime.signal.throwIfAborted()
      if (chunk.done) break
      bytes += chunk.value.length
      if (bytes > 16 * 1_024 * 1_024) throw new Error('Encoded speech exceeds size limit')
      if (chunk.value.length === 0) continue
      const appended = mediaEvent(buffer, 'updateend', lifetime.signal)
      try {
        buffer.appendBuffer(new Uint8Array(chunk.value).buffer)
      } catch (error) {
        this.#settle(playback, error)
      }
      await appended
    }
    if (bytes === 0 || buffer.buffered.length === 0) throw new Error('Empty MP3 audio')
    playback.eof = true
    media.endOfStream()
    if (playback.audio.ended) this.#settle(playback)
  }

  #settle(playback: Mp3Playback, error?: unknown): void {
    if (this.#playback !== playback) return
    this.#playback = null
    this.#playing = false
    playback.source?.disconnect()
    playback.lifetime.abort()
    void playback.reader.cancel().catch(() => undefined)
    playback.audio.pause()
    playback.audio.removeAttribute('src')
    playback.audio.load()
    URL.revokeObjectURL(playback.url)
    if (error === undefined) playback.resolve()
    else playback.reject(error)
  }
}

function mediaEvent(target: EventTarget, name: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener(name, done)
      target.removeEventListener('error', failed)
      signal.removeEventListener('abort', cancelled)
    }
    const done = () => {
      cleanup()
      resolve()
    }
    const failed = () => {
      cleanup()
      reject(new Error('MP3 stream is invalid'))
    }
    const cancelled = () => {
      cleanup()
      reject(signal.reason)
    }
    target.addEventListener(name, done, { once: true })
    target.addEventListener('error', failed, { once: true })
    signal.addEventListener('abort', cancelled, { once: true })
    if (signal.aborted) cancelled()
  })
}
