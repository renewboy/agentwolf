import { BrowserAudioPlayer, type BrowserAudioStatus } from '@agent-arena/react'
import { BrowserMp3Speech } from './browser-mp3-speech.js'
export { AudioActivationError } from '@agent-arena/react'

export class BrowserPcmSpeech {
  readonly #player = new BrowserAudioPlayer({ bufferingSeconds: 0.6 })
  readonly #mp3 = new BrowserMp3Speech()

  public get supported(): boolean {
    return (
      this.#player.supported || (typeof Audio !== 'undefined' && typeof MediaSource !== 'undefined')
    )
  }
  public async prepare(): Promise<void> {
    await this.#player.prepare()
    await this.#mp3.prepare()
  }
  public cancel(): void {
    this.#player.cancel()
    this.#mp3.cancel()
  }
  public dispose(): void {
    this.#mp3.dispose()
    this.#player.dispose()
  }
  public readLevel = (): number => Math.max(this.#player.readLevel(), this.#mp3.readLevel())

  public play(
    stream: ReadableStream<Uint8Array>,
    format: 'pcm' | 'mp3' = 'pcm',
    onStatus?: (status: BrowserAudioStatus) => void,
  ): Promise<void> {
    this.cancel()
    if (format === 'mp3') return this.#mp3.play(stream, onStatus)
    return this.#player.play(
      stream,
      { encoding: 'pcm16', sampleRate: 24_000, channels: 1, byteOrder: 'big' },
      onStatus,
    )
  }
}
