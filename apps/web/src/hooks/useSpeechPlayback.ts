import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

interface StreamJob {
  readonly id: number
  readonly playerId: PlayerId
  observedText: string
  consumedLength: number
  nextUnit: number
  pendingUnits: number
  finalSequence: number | null
  outcome: 'completed' | 'skipped'
}

type PlaybackUnit =
  | {
      readonly key: string
      readonly source: 'committed'
      readonly text: string
      readonly item: TimelineItem
    }
  | {
      readonly key: string
      readonly source: 'stream'
      readonly text: string
      readonly streamId: number
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
  const supported = supportsSpeechSynthesis()
  const [queue, setQueue] = useState<readonly PlaybackUnit[]>([])
  const [automaticSequence, setAutomaticSequence] = useState<number | null>(null)
  const [automaticPlayerId, setAutomaticPlayerId] = useState<PlayerId | null>(null)
  const [manualSequence, setManualSequence] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [streamingActive, setStreamingActive] = useState(false)
  const operationRef = useRef(0)
  const currentUnitRef = useRef<PlaybackUnit | null>(null)
  const interruptedSequenceRef = useRef<number | null>(null)
  const seenSequencesRef = useRef(new Set<number>())
  const outcomesRef = useRef(new Map<number, 'completed' | 'skipped'>())
  const resolvedBarriersRef = useRef(new Set<number>())
  const controlledRef = useRef(false)
  const projectionRef = useRef(projectionKey)
  const barrierSequenceRef = useRef(playbackState.pendingSequence)
  const activeStreamRef = useRef<StreamJob | null>(null)
  const streamJobsRef = useRef(new Map<number, StreamJob>())
  const nextStreamIdRef = useRef(1)
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

  const finishSequence = useCallback(
    (sequence: number, outcome: 'completed' | 'skipped'): void => {
      outcomesRef.current.set(sequence, outcome)
      setAutomaticSequence((current) => (current === sequence ? null : current))
      if (barrierSequenceRef.current === sequence) resolveBarrier(sequence, outcome)
    },
    [resolveBarrier],
  )

  const clearAutomatic = useCallback((): void => {
    currentUnitRef.current = null
    activeStreamRef.current = null
    streamJobsRef.current.clear()
    setQueue([])
    setAutomaticSequence(null)
    setAutomaticPlayerId(null)
    setStreamingActive(false)
  }, [])

  const enqueueCommitted = useCallback((item: TimelineItem): void => {
    const unit: PlaybackUnit = {
      key: `committed:${item.sequence}`,
      source: 'committed',
      text: item.title,
      item,
    }
    setQueue((current) => mergePlaybackQueue(current, [unit]))
  }, [])

  const enqueueStreamText = useCallback(
    (job: StreamJob, text: string, flushTail: boolean): void => {
      if (job.outcome === 'skipped') {
        job.observedText = text
        job.consumedLength = text.length
        return
      }
      const unconsumed = text.slice(Math.min(job.consumedLength, text.length))
      const extracted = completeSentences(unconsumed)
      const segments = [...extracted.segments]
      let consumed = extracted.consumedLength
      if (flushTail) {
        const tail = unconsumed.slice(consumed).trim()
        if (tail) segments.push(tail)
        consumed = unconsumed.length
      }
      if (segments.length > 0) {
        const units = segments.map<PlaybackUnit>((segment) => ({
          key: `stream:${job.id}:${job.nextUnit++}`,
          source: 'stream',
          text: segment,
          streamId: job.id,
        }))
        job.pendingUnits += units.length
        setQueue((current) => mergePlaybackQueue(current, units))
      }
      job.consumedLength = Math.min(text.length, job.consumedLength + consumed)
      job.observedText = text
    },
    [],
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
        clearAutomatic()
        interruptedSequenceRef.current = null
        seenSequencesRef.current.clear()
        outcomesRef.current.clear()
        resolvedBarriersRef.current.clear()
      }
      controlledRef.current = false
      return
    }
    if (!controlledRef.current) {
      controlledRef.current = true
      projectionRef.current = projectionKey
      seenSequencesRef.current = new Set(speechItems.map((item) => item.sequence))
      clearAutomatic()
      return
    }
    if (viewPending || projectionRef.current === projectionKey) return

    projectionRef.current = projectionKey
    const replaySequence = playbackState.pendingSequence ?? interruptedSequenceRef.current
    interruptedSequenceRef.current = null
    seenSequencesRef.current = new Set(speechItems.map((item) => item.sequence))
    outcomesRef.current.clear()
    resolvedBarriersRef.current.clear()
    clearAutomatic()
    const replay = speechItems.find((item) => item.sequence === replaySequence)
    if (replay) {
      seenSequencesRef.current.delete(replay.sequence)
      enqueueCommitted(replay)
      seenSequencesRef.current.add(replay.sequence)
    }
  }, [
    cancelEngine,
    clearAutomatic,
    controlled,
    enqueueCommitted,
    playbackState.pendingSequence,
    projectionKey,
    speechItems,
    viewPending,
  ])

  useEffect(() => {
    if (!controlled || viewPending) return

    const additions = speechItems.filter((item) => !seenSequencesRef.current.has(item.sequence))
    for (const item of additions) {
      seenSequencesRef.current.add(item.sequence)
      const job = [...streamJobsRef.current.values()].find(
        (candidate) => candidate.finalSequence === null && candidate.playerId === item.playerIds[0],
      )
      if (!job) {
        enqueueCommitted(item)
        continue
      }
      enqueueStreamText(job, item.title, true)
      job.finalSequence = item.sequence
      if (activeStreamRef.current?.id === job.id) {
        activeStreamRef.current = null
        setStreamingActive(false)
      }
      const current = currentUnitRef.current
      if (current?.source === 'stream' && current.streamId === job.id) {
        setAutomaticSequence(item.sequence)
        setAutomaticPlayerId(job.playerId)
      }
      if (job.pendingUnits === 0) {
        streamJobsRef.current.delete(job.id)
        finishSequence(item.sequence, job.outcome)
      }
    }

    if (activeSpeech && !activeSpeech.final) {
      let job = activeStreamRef.current
      if (
        !job ||
        job.finalSequence !== null ||
        job.playerId !== activeSpeech.playerId ||
        !activeSpeech.text.startsWith(job.observedText)
      ) {
        job = {
          id: nextStreamIdRef.current++,
          playerId: activeSpeech.playerId,
          observedText: '',
          consumedLength: 0,
          nextUnit: 0,
          pendingUnits: 0,
          finalSequence: null,
          outcome: 'completed',
        }
        activeStreamRef.current = job
        streamJobsRef.current.set(job.id, job)
      }
      setStreamingActive(true)
      enqueueStreamText(job, activeSpeech.text, false)
    }

    const pendingSequence = playbackState.pendingSequence
    if (
      pendingSequence !== null &&
      !outcomesRef.current.has(pendingSequence) &&
      !sequenceInFlight(pendingSequence, currentUnitRef.current, queue, streamJobsRef.current)
    ) {
      const pending = speechItems.find((item) => item.sequence === pendingSequence)
      if (pending) {
        seenSequencesRef.current.add(pending.sequence)
        enqueueCommitted(pending)
      }
    }
  }, [
    activeSpeech,
    controlled,
    enqueueCommitted,
    enqueueStreamText,
    finishSequence,
    playbackState.pendingSequence,
    queue,
    speechItems,
    viewPending,
  ])

  useEffect(() => {
    if (!controlled || !viewPending) return
    interruptedSequenceRef.current = automaticSequence
    cancelEngine()
    clearAutomatic()
  }, [automaticSequence, cancelEngine, clearAutomatic, controlled, viewPending])

  const finishUnit = useCallback(
    (unit: PlaybackUnit, outcome: 'completed' | 'skipped'): void => {
      if (currentUnitRef.current?.key !== unit.key) return
      currentUnitRef.current = null
      setAutomaticSequence(null)
      setAutomaticPlayerId(null)
      setQueue((current) => current.filter((entry) => entry.key !== unit.key))
      if (unit.source === 'committed') {
        finishSequence(unit.item.sequence, outcome)
        return
      }
      const job = streamJobsRef.current.get(unit.streamId)
      if (!job) return
      job.pendingUnits = Math.max(0, job.pendingUnits - 1)
      if (outcome === 'skipped') job.outcome = 'skipped'
      if (job.pendingUnits === 0 && job.finalSequence !== null) {
        streamJobsRef.current.delete(job.id)
        finishSequence(job.finalSequence, job.outcome)
      }
    },
    [finishSequence],
  )

  const nextUnit = queue[0] ?? null
  useEffect(() => {
    if (!controlled || viewPending || !nextUnit || currentUnitRef.current) return undefined
    cancelEngine()
    setManualSequence(null)
    currentUnitRef.current = nextUnit
    setNotice(null)
    setAutomaticSequence(sequenceForUnit(nextUnit, streamJobsRef.current))
    setAutomaticPlayerId(playerForUnit(nextUnit, streamJobsRef.current))
    if (!supported) {
      setNotice(getCopy('match.audioUnsupportedSkipped'))
      finishUnit(nextUnit, 'skipped')
      return undefined
    }
    const operation = operationRef.current
    const utterance = createUtterance(nextUnit.text)
    utterance.addEventListener('end', () => {
      if (operationRef.current === operation) finishUnit(nextUnit, 'completed')
    })
    utterance.addEventListener('error', () => {
      if (operationRef.current !== operation) return
      setNotice(getCopy('match.audioPlaybackFailedSkipped'))
      finishUnit(nextUnit, 'skipped')
    })
    try {
      window.speechSynthesis.speak(utterance)
    } catch {
      if (operationRef.current === operation) {
        setNotice(getCopy('match.audioPlaybackFailedSkipped'))
        finishUnit(nextUnit, 'skipped')
      }
    }
    return () => {
      if (currentUnitRef.current?.key === nextUnit.key) cancelEngine()
    }
  }, [cancelEngine, controlled, finishUnit, nextUnit, supported, viewPending])

  useEffect(
    () => () => {
      cancelEngine()
    },
    [cancelEngine],
  )

  const playManual = useCallback(
    (item: TimelineItem): void => {
      if (!supported || streamingActive || queue.length > 0 || currentUnitRef.current) return
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
    [cancelEngine, queue.length, streamingActive, supported],
  )

  const stopManual = useCallback((): void => {
    cancelEngine()
    setManualSequence(null)
  }, [cancelEngine])

  const skipAutomatic = useCallback((): void => {
    const current = currentUnitRef.current
    if (!current) return
    cancelEngine()
    if (current.source === 'committed') {
      finishUnit(current, 'skipped')
      return
    }
    const job = streamJobsRef.current.get(current.streamId)
    if (!job) return
    currentUnitRef.current = null
    job.pendingUnits = 0
    job.outcome = 'skipped'
    setQueue((entries) =>
      entries.filter((entry) => entry.source !== 'stream' || entry.streamId !== job.id),
    )
    setAutomaticSequence(null)
    setAutomaticPlayerId(null)
    if (job.finalSequence !== null) {
      streamJobsRef.current.delete(job.id)
      finishSequence(job.finalSequence, 'skipped')
    }
  }, [cancelEngine, finishSequence, finishUnit])

  const cancelAll = useCallback((): void => {
    cancelEngine()
    clearAutomatic()
    setManualSequence(null)
  }, [cancelEngine, clearAutomatic])

  return {
    supported,
    automaticSequence,
    automaticPlayerId,
    automaticBusy:
      streamingActive || automaticSequence !== null || queue.length > 0 || Boolean(manualSequence),
    manualSequence,
    notice,
    playManual,
    stopManual,
    skipAutomatic,
    cancelAll,
  }
}

function mergePlaybackQueue(
  current: readonly PlaybackUnit[],
  additions: readonly PlaybackUnit[],
): PlaybackUnit[] {
  const merged = new Map(current.map((unit) => [unit.key, unit]))
  additions.forEach((unit) => merged.set(unit.key, unit))
  return [...merged.values()]
}

function sequenceForUnit(unit: PlaybackUnit, jobs: ReadonlyMap<number, StreamJob>): number | null {
  return unit.source === 'committed'
    ? unit.item.sequence
    : (jobs.get(unit.streamId)?.finalSequence ?? null)
}

function playerForUnit(unit: PlaybackUnit, jobs: ReadonlyMap<number, StreamJob>): PlayerId | null {
  return unit.source === 'committed'
    ? (unit.item.playerIds[0] ?? null)
    : (jobs.get(unit.streamId)?.playerId ?? null)
}

function sequenceInFlight(
  sequence: number,
  current: PlaybackUnit | null,
  queue: readonly PlaybackUnit[],
  jobs: ReadonlyMap<number, StreamJob>,
): boolean {
  const matches = (unit: PlaybackUnit): boolean => sequenceForUnit(unit, jobs) === sequence
  return (
    [...jobs.values()].some((job) => job.finalSequence === sequence) ||
    (current ? matches(current) : false) ||
    queue.some(matches)
  )
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
