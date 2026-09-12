import type {
  PlaybackCallbacks,
  PlaybackContext,
  PlaybackPort,
  PlaybackPreparation,
} from '@agent-arena/web-runtime'
import type { MatchId, PlayerId, SpectatorView, SpeechId } from '@agentwolf/contracts'
import { api, SpeechAudioUnavailableError } from '../api.js'
import { AudioActivationError, BrowserPcmSpeech } from './browser-pcm-speech.js'
import { subtitlePages } from './speech-subtitles.js'
import { SpeechAudioPrefetch } from './speech-audio-prefetch.js'

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
  readonly #prefetch = new SpeechAudioPrefetch()
  readonly #listeners = new Set<() => void>()
  #notice: ModelSpeechNotice | null = null
  #speechId: SpeechId | null = null
  #request: AbortController | null = null
  #generation = 0
  #portraitActors = new Set<PlayerId>()
  #captionCapacity = 24
  #nextPageId = 1
  readonly #preparedPages = new Map<number, readonly PlaybackPreparation<PlayerId, SpeechId>[]>()

  public setPortraitActors(actors: readonly PlayerId[]): void {
    this.#portraitActors = new Set(actors)
  }

  public setCaptionCapacity = (capacity: number): void => {
    this.#captionCapacity = Math.max(8, Math.min(24, capacity))
  }

  public readLevel = (): number => this.#pcm.readLevel()

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
      this.cancel()
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

  public prefetch(units: readonly PlaybackPreparation<PlayerId, SpeechId>[]): void {
    const wanted = new Set(units.map((unit) => unit.context.unitId))
    for (const id of this.#preparedPages.keys()) {
      if (!wanted.has(id)) this.#preparedPages.delete(id)
    }
    const pages = units.flatMap((unit) => {
      let prepared = this.#preparedPages.get(unit.context.unitId)
      if (!prepared) {
        prepared = this.#pages(unit.text, unit.context.actor).map((text) => ({
          text,
          context: { ...unit.context, unitId: this.#nextPageId++ },
        }))
        this.#preparedPages.set(unit.context.unitId, prepared)
      }
      return prepared
    })
    this.#prefetch.synchronize(pages, this.#identity)
  }

  public speak(
    text: string,
    callbacks: PlaybackCallbacks,
    context?: PlaybackContext<PlayerId, SpeechId>,
  ): void {
    if (context?.unitId === undefined) this.cancel()
    else {
      this.#generation += 1
      this.#request?.abort()
      this.#request = null
      this.#pcm.cancel()
    }
    this.#speechId = context?.key ?? null
    this.#setNotice(null)
    const generation = this.#generation
    const identity = this.#identity
    const current = () => this.#generation === generation
    const prepared =
      context?.unitId === undefined ? undefined : this.#preparedPages.get(context.unitId)
    const pages = prepared?.map((page) => page.text) ?? this.#pages(text, context?.actor)
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
    if (!identity.matchId || !context) {
      this.#setNotice('unavailable')
      guarded.error(new Error('Character speech identity is missing'))
      return
    }
    const request = new AbortController()
    this.#request = request
    const load = async (page: string, index: number) => {
      try {
        const response = await (prepared
          ? this.#prefetch.open(prepared[index]!.context.unitId)
          : api.speechAudio(
              identity.matchId!,
              { speechId: context.key, view: identity.view, text: page },
              request.signal,
            ))
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
      let pending = load(pages[0] ?? text, 0)
      for (let index = 0; index < pages.length; index += 1) {
        const loaded = await pending
        if (!current()) return
        if ('error' in loaded) throw loaded.error
        const { stream, format, source } = loaded.response
        const page = pages[index]!
        if (pages[index + 1] !== undefined) pending = load(pages[index + 1]!, index + 1)
        this.#setNotice(source.provider === 'edge-tts' ? `default-${source.reason}` : null)
        await this.#pcm.play(stream, format, (status) =>
          guarded.update?.({ status, text: page, nextText: pages[index + 1] ?? null }),
        )
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
    this.#prefetch.cancel()
    this.#preparedPages.clear()
    this.#pcm.cancel()
  }

  public dispose(): void {
    this.cancel()
    this.#pcm.dispose()
    this.#listeners.clear()
  }

  #pages(text: string, actor: PlayerId | null | undefined): readonly string[] {
    return actor && this.#portraitActors.has(actor)
      ? subtitlePages(text, this.#captionCapacity)
      : [text]
  }

  #setNotice(notice: ModelSpeechNotice | null): void {
    if (this.#notice === notice) return
    this.#notice = notice
    for (const listener of this.#listeners) listener()
  }
}
