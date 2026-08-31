import { useCallback, useMemo } from 'react'
import { createBrowserSpeechPort, usePresentationPlayback } from '@agent-arena/react'
import { PresentationPlaybackController, type PlaybackNotice } from '@agent-arena/web-runtime'
import { getCopy } from '@agentwolf/assets'
import type { MatchView, PlayerId, SpeechPlaybackState, TimelineItem } from '@agentwolf/contracts'
import { completeSentences } from './speech-playback-text.js'

export interface SpeechPlaybackController {
  readonly supported: boolean
  readonly automaticSequence: number | null
  readonly automaticPlayerId: PlayerId | null
  readonly automaticBusy: boolean
  readonly manualSequence: number | null
  readonly notice: string | null
  readonly playManual: (item: TimelineItem) => void
  readonly stopManual: () => void
  readonly skipAutomatic: () => void
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
  const port = useMemo(() => createBrowserSpeechPort({ lang: 'zh-CN', rate: 1 }), [])
  const controller = useMemo(
    () =>
      new PresentationPlaybackController<TimelineItem, PlayerId>({
        port,
        isPresentable: (item) => item.kind === 'speech.committed',
        sequence: (item) => item.sequence,
        actor: (item) => item.playerIds[0] ?? null,
        text: (item) => item.title,
        segment: completeSentences,
        sameActor: (left, right) => left === right,
        resolve: resolveAutomatic,
      }),
    [port, resolveAutomatic],
  )
  const update = useMemo(
    () => ({
      items: timeline,
      activeStream:
        activeSpeech && !activeSpeech.final
          ? { actor: activeSpeech.playerId, text: activeSpeech.text, final: false as const }
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
  const skipAutomatic = useCallback(() => controller.skipAutomatic(), [controller])
  const cancelAll = useCallback(() => controller.cancelAll(), [controller])
  return {
    supported: state.supported,
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
