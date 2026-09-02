import { useCallback, useMemo } from 'react'
import { createBrowserSpeechPort, usePresentationPlayback } from '@agent-arena/react'
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

export interface SpeechPlaybackController {
  readonly supported: boolean
  readonly mode: PresentationPlaybackMode
  readonly activeSpeechId: SpeechId | null
  readonly automaticSequence: number | null
  readonly automaticPlayerId: PlayerId | null
  readonly automaticBusy: boolean
  readonly manualSequence: number | null
  readonly notice: string | null
  readonly playManual: (item: TimelineItem) => void
  readonly stopManual: () => void
  readonly skipAutomatic: (speechId: SpeechId) => void
  readonly cancelAll: () => void
}

export function useSpeechPlayback({
  timeline,
  activeSpeech,
  playbackState,
  projectionKey,
  viewPending,
  resolveAutomatic,
}: {
  readonly timeline: readonly TimelineItem[]
  readonly activeSpeech: MatchView['activeSpeech']
  readonly playbackState: SpeechPlaybackState
  readonly projectionKey: string
  readonly viewPending: boolean
  readonly resolveAutomatic: (sequence: number, outcome: 'completed' | 'skipped') => boolean
}): SpeechPlaybackController {
  const port = useMemo(() => createBrowserSpeechPort({ lang: 'zh-CN', rate: 2 }), [])
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
  const playManual = useCallback((item: TimelineItem) => controller.playManual(item), [controller])
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
    notice: localizeNotice(state.notice),
    playManual,
    stopManual,
    skipAutomatic,
    cancelAll,
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
