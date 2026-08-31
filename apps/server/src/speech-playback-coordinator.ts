import {
  PresentationBarrierCoordinator,
  type PresentationControlEvent,
  type PresentationWaitOutcome,
} from '@agent-arena/web-runtime'
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

export type SpeechPlaybackOutcome = PresentationWaitOutcome

export interface SpeechPlaybackCoordinatorOptions {
  readonly isVisible: (item: CommittedSpeechPlaybackItem, view: SpectatorView) => boolean
  readonly onStateChange: () => void
  readonly onControl?: (title: string, input: unknown) => void
}

export class SpeechPlaybackCoordinator {
  readonly #coordinator: PresentationBarrierCoordinator<
    LiveSubscriber,
    SpectatorView,
    CommittedSpeechPlaybackItem,
    number
  >

  public constructor(options: SpeechPlaybackCoordinatorOptions) {
    this.#coordinator = new PresentationBarrierCoordinator({
      key: (item) => item.sequence,
      observer: (subscriber) => subscriber.view,
      isVisible: options.isVisible,
      onStateChange: options.onStateChange,
      ...(options.onControl
        ? { onControl: (event: PresentationControlEvent<number>) => forwardControl(options, event) }
        : {}),
    })
  }

  public stateFor(subscriber: LiveSubscriber): SpeechPlaybackState {
    const state = this.#coordinator.stateFor(subscriber)
    return {
      enabled: state.enabled,
      controlledByThisClient: state.controlledByThisConnection,
      pendingSequence: state.pendingKey,
    }
  }

  public setEnabled(subscriber: LiveSubscriber, enabled: boolean): 'accepted' | 'busy' {
    return this.#coordinator.setEnabled(subscriber, enabled)
  }

  public viewChanged(subscriber: LiveSubscriber): void {
    this.#coordinator.observerChanged(subscriber)
  }

  public waitFor(item: CommittedSpeechPlaybackItem): Promise<SpeechPlaybackOutcome> {
    return this.#coordinator.waitFor(item)
  }

  public resolve(
    subscriber: LiveSubscriber,
    sequence: number,
    outcome: Exclude<SpeechPlaybackOutcome, 'not-required'>,
  ): 'accepted' | 'invalid' {
    return this.#coordinator.resolve(subscriber, sequence, outcome)
  }

  public disconnect(subscriber: LiveSubscriber): void {
    this.#coordinator.disconnect(subscriber)
  }

  public close(): void {
    this.#coordinator.close()
  }
}

function forwardControl(
  options: SpeechPlaybackCoordinatorOptions,
  event: PresentationControlEvent<number>,
): void {
  switch (event.type) {
    case 'presentation.enabled':
      options.onControl?.('playback.enabled', { enabled: event.enabled })
      return
    case 'presentation.resolved':
      options.onControl?.('playback.resolved', {
        sequence: event.key,
        outcome: event.outcome,
      })
      return
    case 'presentation.disconnected':
      options.onControl?.('playback.disconnected', { sequence: event.key })
      return
    default: {
      const exhaustive: never = event
      return exhaustive
    }
  }
}
