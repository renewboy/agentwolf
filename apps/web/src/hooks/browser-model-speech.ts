import type { PlaybackCallbacks, PlaybackContext, PlaybackPort } from '@agent-arena/web-runtime'
import type { MatchId, PlayerId, SpectatorView, SpeechId } from '@agentwolf/contracts'
import { api, SpeechAudioUnavailableError } from '../api.js'
import { BrowserEdgeMediaSpeech } from './browser-edge-media-speech.js'
import { AudioActivationError, BrowserPcmSpeech } from './browser-pcm-speech.js'
import { subtitlePages } from './speech-subtitles.js'

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
  | 'default-browser'

export interface SpeechAudioIdentity {
  readonly matchId: MatchId | null
  readonly view: SpectatorView
}

export class BrowserModelSpeech implements PlaybackPort<PlayerId, SpeechId> {
  readonly #fallback: PlaybackPort
  #identity: SpeechAudioIdentity
  readonly #pcm = new BrowserPcmSpeech()
  readonly #listeners = new Set<() => void>()
  #notice: ModelSpeechNotice | null = null
  #speechId: SpeechId | null = null
  #request: AbortController | null = null
  #generation = 0
  #portraitActors = new Set<PlayerId>()
  #captionCapacity = 24

  public setPortraitActors(actors: readonly PlayerId[]): void {
    this.#portraitActors = new Set(actors)
  }

  public setCaptionCapacity = (capacity: number): void => {
    this.#captionCapacity = Math.max(8, Math.min(24, capacity))
  }

  public readLevel = (): number => this.#pcm.readLevel()

  public constructor(
    fallback?: PlaybackPort,
    identity: SpeechAudioIdentity = { matchId: null, view: { kind: 'god' } },
  ) {
    this.#fallback =
      fallback ??
      new BrowserEdgeMediaSpeech(
        () => this.#identity,
        () => this.#setNotice('default-browser'),
      )
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
    return this.#pcm.supported || this.#fallback.supported
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
    const pages =
      context?.actor && this.#portraitActors.has(context.actor)
        ? subtitlePages(text, this.#captionCapacity)
        : [text]
    const guarded: PlaybackCallbacks = {
      end: () => {
        if (current()) callbacks.end()
      },
      error: (error) => {
        if (current()) callbacks.error(error)
      },
      update: (output) => {
        if (current()) callbacks.update?.(output)
      },
    }
    if (!this.#pcm.supported) {
      this.#setNotice('default-browser')
      const playPage = (index: number): void => {
        if (!current()) return
        const page = pages[index]
        if (page === undefined) {
          guarded.end()
          return
        }
        this.#fallback.speak(
          page,
          {
            end: () => playPage(index + 1),
            update: (output) => guarded.update?.({ ...output, text: page }),
            error: (error) => {
              if (current()) this.#setNotice('default-unavailable')
              guarded.error(error)
            },
          },
          context,
        )
      }
      playPage(0)
      return
    }
    if (!identity.matchId || !context) {
      this.#setNotice('unavailable')
      guarded.error(new Error('Character speech identity is missing'))
      return
    }
    const request = new AbortController()
    this.#request = request
    const load = async (page: string) => {
      try {
        const response = await api.speechAudio(
          identity.matchId!,
          {
            speechId: context.key,
            view: identity.view,
            text: page,
          },
          request.signal,
        )
        if (!current()) {
          await response.stream.cancel()
          throw new DOMException('Playback cancelled', 'AbortError')
        }
        return { response } as const
      } catch (error) {
        return { error } as const
      }
    }
    const play = async (): Promise<void> => {
      let pending = load(pages[0] ?? text)
      for (let index = 0; index < pages.length; index += 1) {
        const loaded = await pending
        if (!current()) return
        if ('error' in loaded) throw loaded.error
        const { stream, format, source } = loaded.response
        const page = pages[index]!
        if (pages[index + 1] !== undefined) pending = load(pages[index + 1]!)
        this.#setNotice(source.provider === 'edge-tts' ? `default-${source.reason}` : null)
        await this.#pcm.play(stream, format, (status) => guarded.update?.({ status, text: page }))
        if (!current()) return
      }
      guarded.end()
    }
    void play()
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
        request.abort()
        if (this.#request === request) this.#request = null
      })
  }

  public cancel(): void {
    this.#generation += 1
    this.#request?.abort()
    this.#request = null
    this.#pcm.cancel()
    this.#fallback.cancel()
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
