import { useCallback, useEffect, useRef, useState } from 'react'
import {
  LiveMessageSchema,
  MatchIdSchema,
  type LiveClientMessage,
  type MatchView,
  type SpeechPlaybackState,
  type SpectatorView,
} from '@agentwolf/contracts'
import { getCopy } from '@agentwolf/assets'
import { api, ApiError } from '../api.js'

export type LiveConnectionState = 'connecting' | 'live' | 'reconnecting' | 'settled' | 'unavailable'

type LoadResult = 'loaded' | 'missing' | 'failed'

const disabledPlayback: SpeechPlaybackState = {
  enabled: false,
  controlledByThisClient: false,
  pendingSequence: null,
}

export function useLiveMatch(matchIdValue: string | undefined, view: SpectatorView) {
  const [match, setMatch] = useState<MatchView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [controlError, setControlError] = useState<string | null>(null)
  const [connectionState, setConnectionState] = useState<LiveConnectionState>('connecting')
  const [loadedViewKey, setLoadedViewKey] = useState<string | null>(null)
  const [playbackState, setPlaybackState] = useState<SpeechPlaybackState>(disabledPlayback)
  const terminalRef = useRef(false)
  const socketRef = useRef<WebSocket | null>(null)
  const requestedViewKeyRef = useRef<string | null>(null)
  const viewRef = useRef(view)
  const parsedMatchId = matchIdValue ? MatchIdSchema.safeParse(matchIdValue) : null
  const matchId = parsedMatchId?.success ? parsedMatchId.data : null
  const viewKey = keyForView(view)

  const load = useCallback(async (): Promise<LoadResult> => {
    if (!matchId) return 'missing'
    setError(null)
    try {
      const selectedView = viewRef.current
      const nextMatch = await api.getMatch(matchId, selectedView)
      setMatch(nextMatch)
      setLoadedViewKey(keyForView(selectedView))
      if (isTerminalMatch(nextMatch)) {
        terminalRef.current = true
        setConnectionState('settled')
      }
      return 'loaded'
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) {
        terminalRef.current = true
        setMatch(null)
        setLoadedViewKey(null)
        setConnectionState('unavailable')
        setError(getCopy('errors.matchNotFound'))
        return 'missing'
      }
      setError(cause instanceof Error ? cause.message : String(cause))
      return 'failed'
    }
  }, [matchId])

  const send = useCallback((message: LiveClientMessage): boolean => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return false
    socket.send(JSON.stringify(message))
    return true
  }, [])
  const setSpeechPlaybackEnabled = useCallback(
    (enabled: boolean): boolean => send({ type: 'speech-playback.set', enabled }),
    [send],
  )
  const resolveSpeechPlayback = useCallback(
    (sequence: number, outcome: 'completed' | 'skipped'): boolean =>
      send({ type: 'speech-playback.resolve', sequence, outcome }),
    [send],
  )

  useEffect(() => {
    viewRef.current = view
  }, [view])

  useEffect(() => {
    if (!matchId) {
      terminalRef.current = true
      setConnectionState('unavailable')
      setError(getCopy('errors.invalidMatchId'))
      return undefined
    }
    terminalRef.current = false
    void load()
    let disposed = false
    let reconnectTimer: number | null = null
    let reconnectDelay = 250
    setConnectionState('connecting')
    const connect = (): void => {
      if (terminalRef.current) return
      const selectedView = viewRef.current
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const url = new URL(`/api/matches/${matchId}/live`, `${protocol}//${window.location.host}`)
      url.searchParams.set('view', selectedView.kind)
      if (selectedView.kind === 'player') url.searchParams.set('playerId', selectedView.playerId)
      const socket = new WebSocket(url)
      socketRef.current = socket
      requestedViewKeyRef.current = keyForView(selectedView)
      socket.addEventListener('open', () => {
        if (terminalRef.current) {
          socket.close()
          return
        }
        reconnectDelay = 250
        setConnectionState('live')
      })
      socket.addEventListener('message', (event) => {
        try {
          const message = LiveMessageSchema.parse(JSON.parse(String(event.data)))
          if (message.type === 'snapshot') {
            setMatch(message.data)
            setLoadedViewKey(keyForView(message.view))
            if (isTerminalMatch(message.data)) {
              terminalRef.current = true
              setConnectionState('settled')
              socket.close()
            }
          } else if (message.type === 'speech-chunk') {
            setMatch((current) =>
              current
                ? {
                    ...current,
                    activeSpeech: {
                      playerId: message.playerId,
                      text:
                        current.activeSpeech?.playerId === message.playerId
                          ? `${current.activeSpeech.text}${message.text}`
                          : message.text,
                      final: false,
                    },
                  }
                : current,
            )
          } else if (message.type === 'speech-playback.state') {
            setPlaybackState(message.state)
            if (message.state.controlledByThisClient || !message.state.enabled) {
              setControlError(null)
            }
          } else if (message.type === 'error') {
            setControlError(localizeLiveError(message.code, message.message))
          }
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      })
      socket.addEventListener('error', () => socket.close())
      socket.addEventListener('close', () => {
        if (socketRef.current === socket) socketRef.current = null
        setPlaybackState(disabledPlayback)
        requestedViewKeyRef.current = null
        if (disposed || terminalRef.current) return
        setConnectionState('reconnecting')
        void load().then((result) => {
          if (disposed || terminalRef.current || result === 'missing') return undefined
          reconnectTimer = window.setTimeout(connect, reconnectDelay)
          reconnectDelay = Math.min(reconnectDelay * 2, 5_000)
          return undefined
        })
      })
    }
    connect()
    return () => {
      disposed = true
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [load, matchId])

  useEffect(() => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    if (requestedViewKeyRef.current === viewKey) return
    requestedViewKeyRef.current = viewKey
    send({ type: 'view.set', view })
  }, [send, view, viewKey])

  return {
    match,
    error,
    controlError,
    retry: load,
    connectionState,
    playbackState,
    setSpeechPlaybackEnabled,
    resolveSpeechPlayback,
    viewPending: match !== null && loadedViewKey !== viewKey,
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

function localizeLiveError(code: string | undefined, fallback: string): string {
  if (code === 'speech-playback-controller-busy') return getCopy('match.audioControllerBusy')
  if (code === 'speech-playback-invalid-resolution') {
    return getCopy('match.audioInvalidResolution')
  }
  return fallback
}
