import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { PlayerIdSchema, type PlayerId, type SpectatorView } from '@agentwolf/contracts'
import { useLiveMatch } from './useLiveMatch.js'
import { useSpeechPlayback, type SpeechPlaybackController } from './useSpeechPlayback.js'
import { useVoicePreference } from './useVoicePreference.js'

type LiveMatchSession = ReturnType<typeof useLiveMatch>

export interface MatchSessionContextValue extends LiveMatchSession {
  readonly viewKind: SpectatorView['kind']
  readonly playerId: PlayerId
  readonly projectionKey: string
  readonly speechPlayback: SpeechPlaybackController
  readonly voiceEnabled: boolean
  readonly setViewKind: (kind: SpectatorView['kind']) => void
  readonly setPlayerId: (playerId: PlayerId) => void
  readonly toggleVoice: () => void
}

const MatchSessionContext = createContext<MatchSessionContextValue | null>(null)

export function MatchSessionProvider({
  matchId,
  children,
}: {
  readonly matchId: string | undefined
  readonly children: ReactNode
}) {
  const [viewKind, setViewKind] = useState<SpectatorView['kind']>('god')
  const [playerId, setPlayerId] = useState<PlayerId>(PlayerIdSchema.parse('player-1'))
  const [voiceEnabled, setVoiceEnabled] = useVoicePreference()
  const view = useMemo<SpectatorView>(
    () => (viewKind === 'player' ? { kind: 'player', playerId } : { kind: viewKind }),
    [playerId, viewKind],
  )
  const live = useLiveMatch(matchId, view)
  const projectionKey = view.kind === 'player' ? `${view.kind}:${view.playerId}` : view.kind
  const speechPlayback = useSpeechPlayback({
    timeline: live.match?.timeline ?? [],
    activeSpeech: live.match?.activeSpeech ?? null,
    playbackState: live.playbackState,
    projectionKey,
    viewPending: live.viewPending,
    resolveAutomatic: live.resolveSpeechPlayback,
  })
  const requestedState = useRef<boolean | null>(null)

  useEffect(() => {
    if (live.connectionState !== 'live') {
      requestedState.current = null
      return
    }
    if (voiceEnabled) {
      if (live.playbackState.enabled) {
        requestedState.current = null
        return
      }
      if (requestedState.current !== true && live.setSpeechPlaybackEnabled(true)) {
        requestedState.current = true
      }
      return
    }
    if (!live.playbackState.controlledByThisClient) {
      requestedState.current = null
      return
    }
    if (requestedState.current !== false && live.setSpeechPlaybackEnabled(false)) {
      requestedState.current = false
    }
  }, [live, voiceEnabled])

  useEffect(() => {
    if (!voiceEnabled && speechPlayback.mode === 'automatic') {
      if (speechPlayback.activeSpeechId !== null) {
        speechPlayback.skipAutomatic(speechPlayback.activeSpeechId)
      }
    }
  }, [speechPlayback, voiceEnabled])

  const toggleVoice = useCallback((): void => {
    const next = !voiceEnabled
    requestedState.current = null
    setVoiceEnabled(next)
  }, [setVoiceEnabled, voiceEnabled])

  const value = useMemo<MatchSessionContextValue>(
    () => ({
      ...live,
      viewKind,
      playerId,
      projectionKey,
      speechPlayback,
      voiceEnabled,
      setViewKind,
      setPlayerId,
      toggleVoice,
    }),
    [live, playerId, projectionKey, speechPlayback, toggleVoice, viewKind, voiceEnabled],
  )

  return <MatchSessionContext.Provider value={value}>{children}</MatchSessionContext.Provider>
}

export function useMatchSession(): MatchSessionContextValue {
  const session = useContext(MatchSessionContext)
  if (!session) throw new Error('useMatchSession must be used within MatchSessionProvider')
  return session
}
