import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getCopy } from '@agentwolf/assets'
import type { SpeechPlaybackState, TimelineItem } from '@agentwolf/contracts'

export interface SpeechPlaybackController {
  readonly supported: boolean
  readonly automaticSequence: number | null
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
  playbackState,
  projectionKey,
  viewPending,
  resolveAutomatic,
}: {
  readonly timeline: readonly TimelineItem[]
  readonly playbackState: SpeechPlaybackState
  readonly projectionKey: string
  readonly viewPending: boolean
  readonly resolveAutomatic: (sequence: number, outcome: 'completed' | 'skipped') => boolean
}): SpeechPlaybackController {
  const supported = supportsSpeechSynthesis()
  const [queue, setQueue] = useState<readonly TimelineItem[]>([])
  const [automaticSequence, setAutomaticSequence] = useState<number | null>(null)
  const [manualSequence, setManualSequence] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const operationRef = useRef(0)
  const currentAutomaticRef = useRef<TimelineItem | null>(null)
  const interruptedSequenceRef = useRef<number | null>(null)
  const seenSequencesRef = useRef(new Set<number>())
  const outcomesRef = useRef(new Map<number, 'completed' | 'skipped'>())
  const resolvedBarriersRef = useRef(new Set<number>())
  const controlledRef = useRef(false)
  const projectionRef = useRef(projectionKey)
  const barrierSequenceRef = useRef(playbackState.pendingSequence)
  const controlled = playbackState.controlledByThisClient
  const speechItems = useMemo(
    () => timeline.filter((item) => item.kind === 'speech.committed'),
    [timeline],
  )

  useEffect(() => {
    barrierSequenceRef.current = playbackState.pendingSequence
  }, [playbackState.pendingSequence])

  const cancelEngine = useCallback((): void => {
    operationRef.current += 1
    if (supportsSpeechSynthesis()) window.speechSynthesis.cancel()
  }, [])

  const resolveBarrier = useCallback(
    (sequence: number, outcome: 'completed' | 'skipped'): void => {
      if (resolvedBarriersRef.current.has(sequence)) return
      resolvedBarriersRef.current.add(sequence)
      resolveAutomatic(sequence, outcome)
    },
    [resolveAutomatic],
  )

  const finishAutomatic = useCallback(
    (item: TimelineItem, outcome: 'completed' | 'skipped'): void => {
      if (currentAutomaticRef.current?.sequence !== item.sequence) return
      currentAutomaticRef.current = null
      outcomesRef.current.set(item.sequence, outcome)
      setAutomaticSequence(null)
      setQueue((current) => current.filter((entry) => entry.sequence !== item.sequence))
      if (barrierSequenceRef.current === item.sequence) resolveBarrier(item.sequence, outcome)
    },
    [resolveBarrier],
  )

  useEffect(() => {
    const pendingSequence = playbackState.pendingSequence
    if (pendingSequence === null) return
    const outcome = outcomesRef.current.get(pendingSequence)
    if (outcome) resolveBarrier(pendingSequence, outcome)
  }, [playbackState.pendingSequence, resolveBarrier])

  useEffect(() => {
    if (!controlled) {
      if (controlledRef.current) {
        cancelEngine()
        currentAutomaticRef.current = null
        interruptedSequenceRef.current = null
        seenSequencesRef.current.clear()
        outcomesRef.current.clear()
        resolvedBarriersRef.current.clear()
        setQueue([])
        setAutomaticSequence(null)
      }
      controlledRef.current = false
      return
    }
    if (!controlledRef.current) {
      controlledRef.current = true
      projectionRef.current = projectionKey
      const existing = speechItems.map((item) => item.sequence)
      seenSequencesRef.current = new Set(existing)
      setQueue([])
      return
    }
    if (viewPending) return

    if (projectionRef.current !== projectionKey) {
      projectionRef.current = projectionKey
      const replaySequence = playbackState.pendingSequence ?? interruptedSequenceRef.current
      interruptedSequenceRef.current = null
      seenSequencesRef.current = new Set(speechItems.map((item) => item.sequence))
      outcomesRef.current.clear()
      resolvedBarriersRef.current.clear()
      const replay = speechItems.find((item) => item.sequence === replaySequence)
      if (replay) {
        seenSequencesRef.current.delete(replay.sequence)
        setQueue([replay])
        seenSequencesRef.current.add(replay.sequence)
      } else {
        setQueue([])
      }
      return
    }

    const additions = speechItems.filter((item) => !seenSequencesRef.current.has(item.sequence))
    if (additions.length > 0) {
      additions.forEach((item) => seenSequencesRef.current.add(item.sequence))
      setQueue((current) => mergeSpeechQueue(current, additions))
    }
    const pendingSequence = playbackState.pendingSequence
    if (
      pendingSequence !== null &&
      !outcomesRef.current.has(pendingSequence) &&
      currentAutomaticRef.current?.sequence !== pendingSequence
    ) {
      const pending = speechItems.find((item) => item.sequence === pendingSequence)
      if (pending) {
        seenSequencesRef.current.add(pending.sequence)
        setQueue((current) => mergeSpeechQueue(current, [pending]))
      }
    }
  }, [
    cancelEngine,
    controlled,
    playbackState.pendingSequence,
    projectionKey,
    speechItems,
    viewPending,
  ])

  useEffect(() => {
    if (!controlled || !viewPending) return
    const current = currentAutomaticRef.current
    interruptedSequenceRef.current = current?.sequence ?? null
    cancelEngine()
    currentAutomaticRef.current = null
    setAutomaticSequence(null)
    setQueue([])
  }, [cancelEngine, controlled, viewPending])

  const nextItem = queue[0] ?? null
  useEffect(() => {
    if (!controlled || viewPending || !nextItem || currentAutomaticRef.current) return undefined
    cancelEngine()
    setManualSequence(null)
    currentAutomaticRef.current = nextItem
    setAutomaticSequence(nextItem.sequence)
    setNotice(null)
    if (!supported) {
      setNotice(getCopy('match.audioUnsupportedSkipped'))
      finishAutomatic(nextItem, 'skipped')
      return undefined
    }
    const operation = operationRef.current
    const utterance = createUtterance(nextItem.title)
    utterance.addEventListener('end', () => {
      if (operationRef.current === operation) finishAutomatic(nextItem, 'completed')
    })
    utterance.addEventListener('error', () => {
      if (operationRef.current !== operation) return
      setNotice(getCopy('match.audioPlaybackFailedSkipped'))
      finishAutomatic(nextItem, 'skipped')
    })
    try {
      window.speechSynthesis.speak(utterance)
    } catch {
      if (operationRef.current === operation) {
        setNotice(getCopy('match.audioPlaybackFailedSkipped'))
        finishAutomatic(nextItem, 'skipped')
      }
    }
    return () => {
      if (currentAutomaticRef.current?.sequence === nextItem.sequence) cancelEngine()
    }
  }, [cancelEngine, controlled, finishAutomatic, nextItem, supported, viewPending])

  useEffect(
    () => () => {
      cancelEngine()
    },
    [cancelEngine],
  )

  const playManual = useCallback(
    (item: TimelineItem): void => {
      if (!supported || queue.length > 0 || currentAutomaticRef.current) return
      cancelEngine()
      setManualSequence(item.sequence)
      setNotice(null)
      const operation = operationRef.current
      const utterance = createUtterance(item.title)
      const settle = (): void => {
        if (operationRef.current === operation) setManualSequence(null)
      }
      utterance.addEventListener('end', settle)
      utterance.addEventListener('error', settle)
      try {
        window.speechSynthesis.speak(utterance)
      } catch {
        settle()
        setNotice(getCopy('match.audioPlaybackFailed'))
      }
    },
    [cancelEngine, queue.length, supported],
  )

  const stopManual = useCallback((): void => {
    cancelEngine()
    setManualSequence(null)
  }, [cancelEngine])

  const skipAutomatic = useCallback((): void => {
    const current = currentAutomaticRef.current
    if (!current) return
    cancelEngine()
    finishAutomatic(current, 'skipped')
  }, [cancelEngine, finishAutomatic])

  const cancelAll = useCallback((): void => {
    cancelEngine()
    currentAutomaticRef.current = null
    setManualSequence(null)
    setAutomaticSequence(null)
    setQueue([])
  }, [cancelEngine])

  return {
    supported,
    automaticSequence,
    automaticBusy: automaticSequence !== null || queue.length > 0,
    manualSequence,
    notice,
    playManual,
    stopManual,
    skipAutomatic,
    cancelAll,
  }
}

function mergeSpeechQueue(
  current: readonly TimelineItem[],
  additions: readonly TimelineItem[],
): TimelineItem[] {
  const merged = new Map(current.map((item) => [item.sequence, item]))
  additions.forEach((item) => merged.set(item.sequence, item))
  return [...merged.values()].sort((left, right) => left.sequence - right.sequence)
}

function supportsSpeechSynthesis(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined'
  )
}

function createUtterance(text: string): SpeechSynthesisUtterance {
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'
  utterance.rate = 1
  return utterance
}
