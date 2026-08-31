import {
  LiveMessageSchema,
  type LiveMessage,
  type PlayerId,
  type SpeechPlaybackState,
  type SpectatorView,
} from '@agentwolf/contracts'
import { LiveSubscriptionHub } from '@agent-arena/web-runtime'
import type { GameState } from '@agentwolf/game-engine'

export interface LiveSubscriber {
  view: SpectatorView
  send(message: LiveMessage): void
}

export interface LiveConnection {
  receive(message: import('@agentwolf/contracts').LiveClientMessage): void
  close(): void
}

export type StreamedSpeechKind =
  | 'sheriff'
  | 'day'
  | 'runoff'
  | 'last-words'
  | 'wolf-council'
  | 'postgame'

export class LiveHub {
  readonly #hub = new LiveSubscriptionHub<LiveSubscriber, LiveMessage>()

  public subscribe(subscriber: LiveSubscriber): () => void {
    return this.#hub.subscribe({
      observer: subscriber,
      send: (message) => subscriber.send(message),
    })
  }

  public broadcastSnapshot(project: (subscriber: LiveSubscriber) => LiveMessage): void {
    this.#hub.broadcast(({ observer }) => LiveMessageSchema.parse(project(observer)))
  }

  public broadcastPlaybackState(
    project: (subscriber: LiveSubscriber) => SpeechPlaybackState,
  ): void {
    this.#hub.broadcast(({ observer }) =>
      LiveMessageSchema.parse({ type: 'speech-playback.state', state: project(observer) }),
    )
  }

  public broadcastSpeechChunk(
    state: GameState,
    actorId: PlayerId,
    kind: StreamedSpeechKind,
    text: string,
  ): void {
    this.#hub.broadcast(({ observer }) => {
      if (!canSeeSpeech(state, observer.view, actorId, kind)) return null
      return LiveMessageSchema.parse({
        type: 'speech-chunk',
        matchId: state.matchId,
        playerId: actorId,
        text,
      })
    })
  }
}

function canSeeSpeech(
  state: GameState,
  view: SpectatorView,
  actorId: PlayerId,
  kind: StreamedSpeechKind,
): boolean {
  if (kind !== 'wolf-council') return true
  if (view.kind === 'god') return true
  if (view.kind === 'closed-eye') return false
  const actor = state.players.get(actorId)
  const viewer = state.players.get(view.playerId)
  return actor?.faction === 'werewolf' && viewer?.faction === 'werewolf'
}
