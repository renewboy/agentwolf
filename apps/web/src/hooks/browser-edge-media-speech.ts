import { BrowserMediaAudioPlayer } from '@agent-arena/react'
import type { PlaybackCallbacks, PlaybackContext, PlaybackPort } from '@agent-arena/web-runtime'
import type { PlayerId, SpeechId } from '@agentwolf/contracts'
import { api } from '../api.js'
import type { SpeechAudioIdentity } from './browser-model-speech.js'

export class BrowserEdgeMediaSpeech implements PlaybackPort<PlayerId, SpeechId> {
  readonly #identity: () => SpeechAudioIdentity
  readonly #onDefault: () => void
  #request: AbortController | null = null
  readonly #player = new BrowserMediaAudioPlayer()
  #generation = 0

  public constructor(identity: () => SpeechAudioIdentity, onDefault: () => void) {
    this.#identity = identity
    this.#onDefault = onDefault
  }
  public get supported(): boolean {
    return this.#player.supported
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
        if (!current()) return undefined
        return this.#player.play(new Blob([bytes], { type: 'audio/mpeg' }), callbacks)
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
    this.#player.cancel()
  }
}
