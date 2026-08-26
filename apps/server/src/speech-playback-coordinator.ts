import type { GameEvent, SpeechPlaybackState, SpectatorView } from '@agentwolf/contracts'
import type { LiveSubscriber } from './live-hub.js'

export type SpeechCommittedEvent = GameEvent & {
  readonly payload: Extract<GameEvent['payload'], { type: 'speech.committed' }>
}

export interface CommittedSpeechPlaybackItem {
  readonly sequence: number
  readonly playerId: SpeechCommittedEvent['payload']['playerId']
  readonly event: SpeechCommittedEvent | null
}

export type SpeechPlaybackOutcome = 'completed' | 'skipped' | 'not-required'

interface PendingPlayback {
  readonly item: CommittedSpeechPlaybackItem
  readonly resolve: (outcome: Exclude<SpeechPlaybackOutcome, 'not-required'>) => void
}

export interface SpeechPlaybackCoordinatorOptions {
  readonly isVisible: (item: CommittedSpeechPlaybackItem, view: SpectatorView) => boolean
  readonly onStateChange: () => void
  readonly onControl?: (title: string, input: unknown) => void
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
        this.#pending && this.#options.isVisible(this.#pending.item, subscriber.view)
          ? this.#pending.item.sequence
          : null,
    }
  }

  public setEnabled(subscriber: LiveSubscriber, enabled: boolean): 'accepted' | 'busy' {
    if (enabled) {
      if (this.#owner && this.#owner !== subscriber) return 'busy'
      this.#owner = subscriber
      this.#options.onControl?.('playback.enabled', { enabled })
      this.#options.onStateChange()
      return 'accepted'
    }
    if (this.#owner && this.#owner !== subscriber) return 'busy'
    this.#owner = null
    this.#settlePending('skipped')
    this.#options.onControl?.('playback.enabled', { enabled })
    this.#options.onStateChange()
    return 'accepted'
  }

  public viewChanged(subscriber: LiveSubscriber): void {
    if (
      this.#owner === subscriber &&
      this.#pending &&
      !this.#options.isVisible(this.#pending.item, subscriber.view)
    ) {
      this.#settlePending('skipped')
    }
    this.#options.onStateChange()
  }

  public waitFor(item: CommittedSpeechPlaybackItem): Promise<SpeechPlaybackOutcome> {
    if (!this.#owner || !this.#options.isVisible(item, this.#owner.view)) {
      return Promise.resolve('not-required')
    }
    if (this.#pending) throw new Error('A speech playback barrier is already pending')
    return new Promise<Exclude<SpeechPlaybackOutcome, 'not-required'>>((resolve) => {
      this.#pending = { item, resolve }
      this.#options.onStateChange()
    })
  }

  public resolve(
    subscriber: LiveSubscriber,
    sequence: number,
    outcome: Exclude<SpeechPlaybackOutcome, 'not-required'>,
  ): 'accepted' | 'invalid' {
    if (this.#resolvedSequences.has(sequence)) return 'accepted'
    if (this.#owner !== subscriber || this.#pending?.item.sequence !== sequence) return 'invalid'
    this.#options.onControl?.('playback.resolved', { sequence, outcome })
    this.#settlePending(outcome)
    return 'accepted'
  }

  public disconnect(subscriber: LiveSubscriber): void {
    if (this.#owner !== subscriber) return
    this.#options.onControl?.('playback.disconnected', {
      sequence: this.#pending?.item.sequence ?? null,
    })
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
    this.#resolvedSequences.add(pending.item.sequence)
    pending.resolve(outcome)
    this.#options.onStateChange()
  }
}
