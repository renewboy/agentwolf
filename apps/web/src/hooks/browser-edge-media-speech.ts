import type { PlaybackCallbacks, PlaybackContext, PlaybackPort } from '@agent-arena/web-runtime'
import type { PlayerId, SpeechId } from '@agentwolf/contracts'
import { api } from '../api.js'
import type { SpeechAudioIdentity } from './browser-model-speech.js'

export class BrowserEdgeMediaSpeech implements PlaybackPort<PlayerId, SpeechId> {
  readonly #identity: () => SpeechAudioIdentity
  readonly #onDefault: () => void
  #request: AbortController | null = null
  #audio: HTMLAudioElement | null = null
  #url: string | null = null
  #generation = 0

  public constructor(identity: () => SpeechAudioIdentity, onDefault: () => void) {
    this.#identity = identity
    this.#onDefault = onDefault
  }
  public get supported(): boolean {
    return typeof Audio !== 'undefined'
  }

  public speak(
    text: string,
    callbacks: PlaybackCallbacks,
    context?: PlaybackContext<PlayerId, SpeechId>,
  ): void {
    this.cancel()
    const identity = this.#identity()
    if (!identity.matchId || !context) {
      callbacks.error(new Error('Speech identity is missing'))
      return
    }
    const request = new AbortController()
    this.#request = request
    const generation = this.#generation
    const current = () => this.#generation === generation
    void api
      .speechAudio(
        identity.matchId,
        { speechId: context.key, view: identity.view, text, preferDefault: true },
        request.signal,
      )
      .then(async ({ stream, format }) => {
        if (format !== 'mp3') {
          await stream.cancel()
          throw new Error('Default speech format is invalid')
        }
        const bytes = await new Response(stream).arrayBuffer()
        if (!current()) return undefined
        this.#onDefault()
        const audio = new Audio()
        this.#audio = audio
        this.#url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }))
        audio.src = this.#url
        audio.addEventListener(
          'ended',
          () => {
            if (current()) {
              this.cancel()
              callbacks.end()
            }
          },
          { once: true, signal: request.signal },
        )
        audio.addEventListener(
          'error',
          () => {
            if (current()) {
              this.cancel()
              callbacks.error(new Error('Default speech playback failed'))
            }
          },
          { once: true, signal: request.signal },
        )
        return audio.play()
      })
      .catch((error: unknown) => {
        if (current()) {
          this.cancel()
          callbacks.error(error)
        }
      })
  }

  public cancel(): void {
    this.#generation += 1
    this.#request?.abort()
    this.#request = null
    if (this.#audio) {
      this.#audio.pause()
      this.#audio.removeAttribute('src')
      this.#audio.load()
      this.#audio = null
    }
    if (this.#url) URL.revokeObjectURL(this.#url)
    this.#url = null
  }
}
