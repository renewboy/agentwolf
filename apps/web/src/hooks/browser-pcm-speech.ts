import { BrowserAudioPlayer, type BrowserAudioStatus } from '@agent-arena/react'
export { AudioActivationError } from '@agent-arena/react'

export class BrowserPcmSpeech {
  readonly #player = new BrowserAudioPlayer({ bufferingSeconds: 0.6 })
  public get supported(): boolean {
    return this.#player.supported
  }
  public prepare(): Promise<void> {
    return this.#player.prepare()
  }
  public cancel(): void {
    this.#player.cancel()
  }
  public dispose(): void {
    this.#player.dispose()
  }
  public readLevel = (): number => this.#player.readLevel()

  public play(
    stream: ReadableStream<Uint8Array>,
    format: 'pcm' | 'mp3' = 'pcm',
    onStatus?: (status: BrowserAudioStatus) => void,
  ): Promise<void> {
    return this.#player.play(
      stream,
      format === 'mp3'
        ? { encoding: 'encoded' }
        : {
            encoding: 'pcm16',
            sampleRate: 24_000,
            channels: 1,
            byteOrder: 'big',
          },
      onStatus,
    )
  }
}
