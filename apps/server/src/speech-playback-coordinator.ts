import type { GameEvent, SpeechPlaybackState, SpectatorView } from '@agentwolf/contracts'
import type { LiveSubscriber } from './live-hub.js'

export type SpeechCommittedEvent = GameEvent & {
  readonly payload: Extract<GameEvent['payload'], { type: 'speech.committed' }>
}

export type SpeechPlaybackOutcome = 'completed' | 'skipped' | 'not-required'

interface PendingPlayback {
  readonly event: SpeechCommittedEvent
  readonly resolve: (outcome: Exclude<SpeechPlaybackOutcome, 'not-required'>) => void
}

export interface SpeechPlaybackCoordinatorOptions {
  readonly isVisible: (event: SpeechCommittedEvent, view: SpectatorView) => boolean
  readonly onStateChange: () => void
}

export class SpeechPlaybackCoordinator {
  readonly #options: SpeechPlaybackCoordinatorOptions
  readonly #resolvedSequences = new Set<number>()
  #owner: LiveSubscriber | null = null
  #pending: PendingPlayback | null = null

  public constructor(options: SpeechPlaybackCoordinatorOptions) {
    this.#options = options
  }

  public stateFor(subscriber: LiveSubscriber): SpeechPlaybackState {
    return {
      enabled: this.#owner !== null,
      controlledByThisClient: this.#owner === subscriber,
      pendingSequence:
        this.#pending && this.#options.isVisible(this.#pending.event, subscriber.view)
          ? this.#pending.event.sequence
          : null,
    }
  }

  public setEnabled(subscriber: LiveSubscriber, enabled: boolean): 'accepted' | 'busy' {
    if (enabled) {
      if (this.#owner && this.#owner !== subscriber) return 'busy'
      this.#owner = subscriber
      this.#options.onStateChange()
      return 'accepted'
    }
    if (this.#owner && this.#owner !== subscriber) return 'busy'
    this.#owner = null
    this.#settlePending('skipped')
    this.#options.onStateChange()
    return 'accepted'
  }

  public viewChanged(subscriber: LiveSubscriber): void {
    if (
      this.#owner === subscriber &&
      this.#pending &&
      !this.#options.isVisible(this.#pending.event, subscriber.view)
    ) {
      this.#settlePending('skipped')
    }
    this.#options.onStateChange()
  }

  public waitFor(event: SpeechCommittedEvent): Promise<SpeechPlaybackOutcome> {
    if (!this.#owner || !this.#options.isVisible(event, this.#owner.view)) {
      return Promise.resolve('not-required')
    }
    if (this.#pending) throw new Error('A speech playback barrier is already pending')
    return new Promise<Exclude<SpeechPlaybackOutcome, 'not-required'>>((resolve) => {
      this.#pending = { event, resolve }
      this.#options.onStateChange()
    })
  }

  public resolve(
    subscriber: LiveSubscriber,
    sequence: number,
    outcome: Exclude<SpeechPlaybackOutcome, 'not-required'>,
  ): 'accepted' | 'invalid' {
    if (this.#resolvedSequences.has(sequence)) return 'accepted'
    if (this.#owner !== subscriber || this.#pending?.event.sequence !== sequence) return 'invalid'
    this.#settlePending(outcome)
    return 'accepted'
  }

  public disconnect(subscriber: LiveSubscriber): void {
    if (this.#owner !== subscriber) return
    this.#owner = null
    this.#settlePending('skipped')
    this.#options.onStateChange()
  }

  public close(): void {
    this.#owner = null
    this.#settlePending('skipped')
  }

  #settlePending(outcome: Exclude<SpeechPlaybackOutcome, 'not-required'>): void {
    const pending = this.#pending
    if (!pending) return
    this.#pending = null
    this.#resolvedSequences.add(pending.event.sequence)
    pending.resolve(outcome)
    this.#options.onStateChange()
  }
}
