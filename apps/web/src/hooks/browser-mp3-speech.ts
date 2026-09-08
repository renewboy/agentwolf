interface Mp3Playback {
  readonly audio: HTMLAudioElement
  readonly media: MediaSource
  readonly url: string
  readonly reader: ReadableStreamDefaultReader<Uint8Array>
  readonly lifetime: AbortController
  readonly resolve: () => void
  readonly reject: (error: unknown) => void
  eof: boolean
}

export class BrowserMp3Speech {
  #playback: Mp3Playback | null = null

  public play(stream: ReadableStream<Uint8Array>): Promise<void> {
    this.cancel()
    return new Promise((resolve, reject) => {
      const media = new MediaSource()
      const audio = new Audio()
      const playback: Mp3Playback = {
        audio,
        media,
        url: URL.createObjectURL(media),
        reader: stream.getReader(),
        lifetime: new AbortController(),
        resolve,
        reject,
        eof: false,
      }
      this.#playback = playback
      const options = { signal: playback.lifetime.signal }
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
