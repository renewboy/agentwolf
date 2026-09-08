import type { PlaybackCallbacks, PlaybackContext, PlaybackPort } from '@agent-arena/web-runtime'
import type { MatchId, PlayerId, SpectatorView, SpeechId } from '@agentwolf/contracts'
import { api, SpeechAudioUnavailableError } from '../api.js'
import { AudioActivationError, BrowserPcmSpeech } from './browser-pcm-speech.js'

export type ModelSpeechNotice =
  | 'unavailable'
  | 'no-voice'
  | 'activation-required'
  | 'default-preparing'
  | 'default-loading'
  | 'default-error'
  | 'default-disabled'
  | 'default-no-voice'
  | 'default-unavailable'

export interface SpeechAudioIdentity {
  readonly matchId: MatchId | null
  readonly view: SpectatorView
}

export class BrowserModelSpeech implements PlaybackPort<PlayerId, SpeechId> {
  #identity: SpeechAudioIdentity
  readonly #pcm = new BrowserPcmSpeech()
  readonly #listeners = new Set<() => void>()
  #notice: ModelSpeechNotice | null = null
  #speechId: SpeechId | null = null
  #request: AbortController | null = null
  #generation = 0

  public constructor(identity: SpeechAudioIdentity = { matchId: null, view: { kind: 'god' } }) {
    this.#identity = identity
  }

  public setIdentity(identity: SpeechAudioIdentity): void {
    if (
      identity.matchId !== this.#identity.matchId ||
      identity.view.kind !== this.#identity.view.kind ||
      (identity.view.kind === 'player' &&
        this.#identity.view.kind === 'player' &&
        identity.view.playerId !== this.#identity.view.playerId)
    ) {
      this.#speechId = null
      this.#setNotice(null)
    }
    this.#identity = identity
  }

  public get lastSpeechId(): SpeechId | null {
    return this.#speechId
  }

  public get supported(): boolean {
    return this.#pcm.supported
  }

  public snapshot = (): ModelSpeechNotice | null => this.#notice
  public subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  public prepare = (): void => {
    void this.#pcm.prepare().catch(() => this.#setNotice('activation-required'))
  }

  public speak(
    text: string,
    callbacks: PlaybackCallbacks,
    context?: PlaybackContext<PlayerId, SpeechId>,
  ): void {
    this.cancel()
    this.#speechId = context?.key ?? null
    this.#setNotice(null)
    const generation = this.#generation
    const identity = this.#identity
    const current = () => this.#generation === generation
    const guarded: PlaybackCallbacks = {
      end: () => {
        if (current()) callbacks.end()
      },
      error: (error) => {
        if (current()) callbacks.error(error)
      },
    }
    if (!identity.matchId || !context) {
      this.#setNotice('unavailable')
      guarded.error(new Error('Character speech identity is missing'))
      return
    }
    const request = new AbortController()
    this.#request = request
    void api
      .speechAudio(
        identity.matchId,
        {
          speechId: context.key,
          view: identity.view,
          text,
        },
        request.signal,
      )
      .then(async ({ stream, format, source }) => {
        if (!current()) {
          await stream.cancel()
          return undefined
        }
        this.#setNotice(source.provider === 'edge-tts' ? `default-${source.reason}` : null)
        await this.#pcm.play(stream, format)
        return guarded.end()
      })
      .catch((error: unknown) => {
        if (!current()) return
        if (error instanceof SpeechAudioUnavailableError) {
          this.#setNotice(
            error.code === 'tts-default-unavailable'
              ? 'default-unavailable'
              : error.code === 'tts-no-voice'
                ? 'no-voice'
                : 'unavailable',
          )
        }
        if (error instanceof AudioActivationError) this.#setNotice('activation-required')
        else if (this.#notice?.startsWith('default-')) this.#setNotice('default-unavailable')
        guarded.error(error)
      })
      .finally(() => {
        if (this.#request === request) this.#request = null
      })
  }

  public cancel(): void {
    this.#generation += 1
    this.#request?.abort()
    this.#request = null
    this.#pcm.cancel()
  }

  public dispose(): void {
    this.cancel()
    this.#pcm.dispose()
    this.#listeners.clear()
  }

  #setNotice(notice: ModelSpeechNotice | null): void {
    if (this.#notice === notice) return
    this.#notice = notice
    for (const listener of this.#listeners) listener()
  }
}
