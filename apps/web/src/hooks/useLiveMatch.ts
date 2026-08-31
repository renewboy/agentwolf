import { useCallback, useEffect, useMemo } from 'react'
import { useLiveProjection } from '@agent-arena/react'
import {
  LiveProjectionController,
  type LiveChannel,
  type LiveClientCommand,
  type LiveConnectionState,
  type LiveProjectionTransport,
} from '@agent-arena/web-runtime'
import { getCopy } from '@agentwolf/assets'
import {
  LiveMessageSchema,
  MatchIdSchema,
  type LiveClientMessage,
  type MatchId,
  type MatchView,
  type PlayerId,
  type SpeechPlaybackState,
  type SpectatorView,
} from '@agentwolf/contracts'
import { api, ApiError } from '../api.js'

export type { LiveConnectionState }

interface SpeechChunk {
  readonly playerId: PlayerId
  readonly text: string
}

type SpeechControlCommand =
  | { readonly type: 'set'; readonly enabled: boolean }
  | {
      readonly type: 'resolve'
      readonly sequence: number
      readonly outcome: 'completed' | 'skipped'
    }

interface LiveControlState {
  readonly playback: SpeechPlaybackState
  readonly error: string | null
}

const disabledPlayback: SpeechPlaybackState = {
  enabled: false,
  controlledByThisClient: false,
  pendingSequence: null,
}

const disconnectedControl: LiveControlState = { playback: disabledPlayback, error: null }

export function useLiveMatch(matchIdValue: string | undefined, view: SpectatorView) {
  const parsedMatchId = matchIdValue ? MatchIdSchema.safeParse(matchIdValue) : null
  const matchId = parsedMatchId?.success ? parsedMatchId.data : null
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- view changes are sent through the live observer command without recreating the connection controller.
  const controller = useMemo(() => createController(matchId, view), [matchId])
  const state = useLiveProjection(controller)

  useEffect(() => {
    controller.setObserver(view)
  }, [controller, view])

  const retry = useCallback(() => controller.retry(), [controller])
  const setSpeechPlaybackEnabled = useCallback(
    (enabled: boolean): boolean => controller.sendControl({ type: 'set', enabled }),
    [controller],
  )
  const resolveSpeechPlayback = useCallback(
    (sequence: number, outcome: 'completed' | 'skipped'): boolean =>
      controller.sendControl({ type: 'resolve', sequence, outcome }),
    [controller],
  )

  return {
    match: state.projection,
    error: localizeError(state.error),
    controlError: state.controlState.error,
    retry,
    connectionState: state.connectionState,
    playbackState: state.controlState.playback,
    setSpeechPlaybackEnabled,
    resolveSpeechPlayback,
    viewPending: state.observerPending,
  }
}

function createController(matchId: MatchId | null, observer: SpectatorView) {
  return new LiveProjectionController({
    observer,
    initialControlState: disconnectedControl,
    transport: createTransport(matchId),
    scheduler: {
      set: (delay, callback) => window.setTimeout(callback, delay),
      clear: (handle: number) => window.clearTimeout(handle),
    },
    observerKey: keyForView,
    applyTransient: applySpeechChunk,
    isSettled: isTerminalMatch,
    isUnavailableError: (error) =>
      error instanceof InvalidMatchError || (error instanceof ApiError && error.status === 404),
    disconnectedControlState: () => disconnectedControl,
  })
}

function createTransport(
  matchId: MatchId | null,
): LiveProjectionTransport<
  SpectatorView,
  MatchView,
  SpeechChunk,
  LiveControlState,
  SpeechControlCommand
> {
  return {
    loadSnapshot: async (observer) => {
      if (!matchId) throw new InvalidMatchError()
      return api.getMatch(matchId, observer)
    },
    openChannel: (observer, handlers) => {
      if (!matchId) return closedChannel()
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const url = new URL(`/api/matches/${matchId}/live`, `${protocol}//${window.location.host}`)
      url.searchParams.set('view', observer.kind)
      if (observer.kind === 'player') url.searchParams.set('playerId', observer.playerId)
      const socket = new WebSocket(url)
      let control = disconnectedControl
      socket.addEventListener('open', () => handlers.open())
      socket.addEventListener('message', (event) => {
        try {
          const message = LiveMessageSchema.parse(JSON.parse(String(event.data)))
          switch (message.type) {
            case 'snapshot':
              handlers.event({ type: 'snapshot', observer: message.view, projection: message.data })
              return
            case 'speech-chunk':
              handlers.event({
                type: 'transient',
                value: { playerId: message.playerId, text: message.text },
              })
              return
            case 'speech-playback.state':
              control = {
                playback: message.state,
                error:
                  message.state.controlledByThisClient || !message.state.enabled
                    ? null
                    : control.error,
              }
              handlers.event({ type: 'control', state: control })
              return
            case 'error':
              control = {
                ...control,
                error: localizeLiveError(message.code, message.message),
              }
              handlers.event({ type: 'control', state: control })
              return
            case 'event':
              return
            default: {
              const exhaustive: never = message
              void exhaustive
              return
            }
          }
        } catch (error) {
          handlers.error(error)
        }
      })
      socket.addEventListener('error', () => socket.close())
      socket.addEventListener('close', () => handlers.close())
      return {
        send: (command) => sendCommand(socket, command),
        close: () => socket.close(),
      }
    },
  }
}

function closedChannel(): LiveChannel<SpectatorView, SpeechControlCommand> {
  return { send: () => false, close: () => undefined }
}

function sendCommand(
  socket: WebSocket,
  command: LiveClientCommand<SpectatorView, SpeechControlCommand>,
): boolean {
  if (socket.readyState !== WebSocket.OPEN) return false
  let message: LiveClientMessage
  if (command.type === 'observer.set') {
    message = { type: 'view.set', view: command.observer }
  } else if (command.command.type === 'set') {
    message = { type: 'speech-playback.set', enabled: command.command.enabled }
  } else {
    message = {
      type: 'speech-playback.resolve',
      sequence: command.command.sequence,
      outcome: command.command.outcome,
    }
  }
  socket.send(JSON.stringify(message))
  return true
}

function applySpeechChunk(match: MatchView, message: SpeechChunk): MatchView {
  return {
    ...match,
    activeSpeech: {
      playerId: message.playerId,
      text:
        match.activeSpeech?.playerId === message.playerId
          ? `${match.activeSpeech.text}${message.text}`
          : message.text,
      final: false,
    },
  }
}

function isTerminalMatch(match: MatchView): boolean {
  return (
    match.status === 'ended' &&
    (!match.postgameReview || ['completed', 'skipped'].includes(match.postgameReview.state))
  )
}

function keyForView(view: SpectatorView): string {
  return view.kind === 'player' ? `${view.kind}:${view.playerId}` : view.kind
}

function localizeError(error: Error | null): string | null {
  if (!error) return null
  if (error instanceof InvalidMatchError) return getCopy('errors.invalidMatchId')
  if (error instanceof ApiError && error.status === 404) return getCopy('errors.matchNotFound')
  return error.message
}

function localizeLiveError(code: string | undefined, fallback: string): string {
  if (code === 'speech-playback-controller-busy') return getCopy('match.audioControllerBusy')
  if (code === 'speech-playback-invalid-resolution') {
    return getCopy('match.audioInvalidResolution')
  }
  return fallback
}

class InvalidMatchError extends Error {
  public constructor() {
    super('Invalid Match ID')
    this.name = 'InvalidMatchError'
  }
}
