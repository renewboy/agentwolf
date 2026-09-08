import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { usePresentationPlayback } from '@agent-arena/react'
import {
  PresentationPlaybackController,
  type PlaybackNotice,
  type PresentationPlaybackMode,
} from '@agent-arena/web-runtime'
import { getCopy } from '@agentwolf/assets'
import {
  SpeechIdSchema,
  type MatchView,
  type PlayerId,
  type SpeechId,
  type SpeechPlaybackState,
  type TimelineItem,
} from '@agentwolf/contracts'
import { completeSentences } from './speech-playback-text.js'
import {
  BrowserModelSpeech,
  type ModelSpeechNotice,
  type SpeechAudioIdentity,
} from './browser-model-speech.js'

export interface SpeechPlaybackController {
  readonly supported: boolean
  readonly mode: PresentationPlaybackMode
  readonly activeSpeechId: SpeechId | null
  readonly automaticSequence: number | null
  readonly automaticPlayerId: PlayerId | null
  readonly automaticBusy: boolean
  readonly manualSequence: number | null
  readonly notice: string | null
  readonly noticeSpeechId: SpeechId | null
  readonly noticeTitle: string
  readonly noticeKind: 'fallback' | 'error'
  readonly playManual: (item: TimelineItem) => void
  readonly stopManual: () => void
  readonly skipAutomatic: (speechId: SpeechId) => void
  readonly cancelAll: () => void
  readonly prepareAudio: () => void
}

export function useSpeechPlayback({
  timeline,
  activeSpeech,
  playbackState,
  projectionKey,
  viewPending,
  resolveAutomatic,
  audioIdentity,
}: {
  readonly timeline: readonly TimelineItem[]
  readonly activeSpeech: MatchView['activeSpeech']
  readonly playbackState: SpeechPlaybackState
  readonly projectionKey: string
  readonly viewPending: boolean
  readonly resolveAutomatic: (sequence: number, outcome: 'completed' | 'skipped') => boolean
  readonly audioIdentity?: SpeechAudioIdentity
}): SpeechPlaybackController {
  const port = useMemo(() => new BrowserModelSpeech(), [])
  useEffect(() => {
    port.setIdentity(audioIdentity ?? { matchId: null, view: { kind: 'god' } })
  }, [audioIdentity, port])
  const modelNotice = useSyncExternalStore(port.subscribe, port.snapshot, port.snapshot)
  const lifecycle = useRef(0)
  useEffect(() => {
    lifecycle.current += 1
    return () => {
      const cleanup = ++lifecycle.current
      queueMicrotask(() => {
        if (lifecycle.current === cleanup) port.dispose()
      })
    }
  }, [port])
  const controller = useMemo(
    () =>
      new PresentationPlaybackController<TimelineItem, PlayerId, SpeechId>({
        port,
        isPresentable: (item) => item.kind === 'speech.committed',
        key: speechIdForItem,
        sequence: (item) => item.sequence,
        actor: (item) => item.playerIds[0] ?? null,
        text: (item) => item.title,
        segment: completeSentences,
        resolve: resolveAutomatic,
      }),
    [port, resolveAutomatic],
  )
  const update = useMemo(
    () => ({
      items: timeline,
      activeStream:
        activeSpeech && !activeSpeech.final
          ? {
              key: activeSpeech.speechId,
              actor: activeSpeech.playerId,
              text: activeSpeech.text,
              final: false as const,
            }
          : null,
      controlled: playbackState.controlledByThisClient,
      pendingSequence: playbackState.pendingSequence,
      projectionKey,
      observerPending: viewPending,
    }),
    [
      activeSpeech,
      playbackState.controlledByThisClient,
      playbackState.pendingSequence,
      projectionKey,
      timeline,
      viewPending,
    ],
  )
  const state = usePresentationPlayback(controller, update)
  const playManual = useCallback(
    (item: TimelineItem) => {
      port.prepare()
      controller.playManual(item)
    },
    [controller, port],
  )
  const stopManual = useCallback(() => controller.stopManual(), [controller])
  const skipAutomatic = useCallback(
    (speechId: SpeechId) => controller.skipAutomatic(speechId),
    [controller],
  )
  const cancelAll = useCallback(() => controller.cancelAll(), [controller])
  return {
    supported: state.supported,
    mode: state.mode,
    activeSpeechId: state.activeKey,
    automaticSequence: state.automaticSequence,
    automaticPlayerId: state.automaticActor,
    automaticBusy: state.automaticBusy,
    manualSequence: state.manualSequence,
    noticeSpeechId: port.lastSpeechId,
    noticeTitle: getCopy(
      modelNotice === 'default-unavailable'
        ? 'match.audioDefaultFailedTitle'
        : modelNotice?.startsWith('default-')
          ? 'match.audioDefaultTitle'
          : 'match.audioNoticeTitle',
    ),
    noticeKind:
      modelNotice?.startsWith('default-') && modelNotice !== 'default-unavailable'
        ? ('fallback' as const)
        : ('error' as const),
    notice: localizeModelNotice(modelNotice) ?? localizeNotice(state.notice),
    playManual,
    stopManual,
    skipAutomatic,
    cancelAll,
    prepareAudio: port.prepare,
  }
}

function localizeModelNotice(notice: ModelSpeechNotice | null): string | null {
  switch (notice) {
    case null:
      return null
    case 'unavailable':
      return getCopy('match.audioModelUnavailable')
    case 'no-voice':
      return getCopy('match.audioCharacterVoiceUnavailable')
    case 'default-preparing':
      return getCopy('match.audioDefaultPreparing')
    case 'default-loading':
      return getCopy('match.audioDefaultLoading')
    case 'default-error':
      return getCopy('match.audioDefaultError')
    case 'default-disabled':
      return getCopy('match.audioDefaultDisabled')
    case 'default-no-voice':
      return getCopy('match.audioDefaultNoVoice')
    case 'default-browser':
      return getCopy('match.audioDefaultBrowser')
    case 'default-unavailable':
      return getCopy('match.audioDefaultUnavailable')
    case 'activation-required':
      return getCopy('match.audioActivationRequired')
    default: {
      const exhaustive: never = notice
      return exhaustive
    }
  }
}

function speechIdForItem(item: TimelineItem): SpeechId {
  return item.speechId ?? SpeechIdSchema.parse(item.sequence)
}

function localizeNotice(notice: PlaybackNotice | null): string | null {
  switch (notice) {
    case null:
      return null
    case 'automatic-unsupported-skipped':
      return getCopy('match.audioUnsupportedSkipped')
    case 'automatic-failed-skipped':
      return getCopy('match.audioPlaybackFailedSkipped')
    case 'manual-failed':
      return getCopy('match.audioPlaybackFailed')
    default: {
      const exhaustive: never = notice
      return exhaustive
    }
  }
}
