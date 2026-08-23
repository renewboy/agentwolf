import {
  LiveMessageSchema,
  type LiveMessage,
  type PlayerId,
  type SpeechPlaybackState,
  type SpectatorView,
} from '@agentwolf/contracts'
import type { GameState } from '@agentwolf/game-engine'

export interface LiveSubscriber {
  view: SpectatorView
  send(message: LiveMessage): void
}

export interface LiveConnection {
  receive(message: import('@agentwolf/contracts').LiveClientMessage): void
  close(): void
}

export class LiveHub {
  readonly #subscribers = new Set<LiveSubscriber>()

  public subscribe(subscriber: LiveSubscriber): () => void {
    this.#subscribers.add(subscriber)
    return () => this.#subscribers.delete(subscriber)
  }

  public broadcastSnapshot(project: (subscriber: LiveSubscriber) => LiveMessage): void {
    for (const subscriber of this.#subscribers)
      subscriber.send(LiveMessageSchema.parse(project(subscriber)))
  }

  public broadcastPlaybackState(
    project: (subscriber: LiveSubscriber) => SpeechPlaybackState,
  ): void {
    for (const subscriber of this.#subscribers) {
      subscriber.send(
        LiveMessageSchema.parse({ type: 'speech-playback.state', state: project(subscriber) }),
      )
    }
  }

  public broadcastSpeechChunk(
    state: GameState,
    actorId: PlayerId,
    kind: 'sheriff' | 'day' | 'runoff' | 'last-words' | 'wolf-council',
    text: string,
  ): void {
    for (const subscriber of this.#subscribers) {
      if (!canSeeSpeech(state, subscriber.view, actorId, kind)) continue
      subscriber.send(
        LiveMessageSchema.parse({
          type: 'speech-chunk',
          matchId: state.matchId,
          playerId: actorId,
          text,
        }),
      )
    }
  }
}

function canSeeSpeech(
  state: GameState,
  view: SpectatorView,
  actorId: PlayerId,
  kind: 'sheriff' | 'day' | 'runoff' | 'last-words' | 'wolf-council',
): boolean {
  if (kind !== 'wolf-council') return true
  if (view.kind === 'god') return true
  if (view.kind === 'closed-eye') return false
  const actor = state.players.get(actorId)
  const viewer = state.players.get(view.playerId)
  return actor?.faction === 'werewolf' && viewer?.faction === 'werewolf'
}
