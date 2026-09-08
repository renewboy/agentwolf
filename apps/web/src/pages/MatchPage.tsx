import { useEffect, useMemo, useRef, useState } from 'react'
import { getCopy } from '@agentwolf/assets'
import type { MatchId } from '@agentwolf/contracts'
import { api } from '../api.js'
import { ErrorState } from '../components/AsyncState.js'
import {
  MatchFeed,
  type FeedJumpRequest,
  type SpeechAudioControls,
} from '../components/match/MatchFeed.js'
import { MatchHeader } from '../components/match/MatchHeader.js'
import {
  deriveMatchPresenceState,
  MatchMotionController,
} from '../components/match/MatchMotionController.js'
import { PlayerRail } from '../components/match/PlayerRail.js'
import { PostgameReviewPanel } from '../components/match/PostgameReviewPanel.js'
import { PresenceStage } from '../components/match/MatchPresence.js'
import { MatchRecoveryPanel } from '../components/match/MatchRecoveryPanel.js'
import { gameArt } from '../game-art.js'
import { RoleEffectController } from '../components/match/RoleEffectController.js'
import { useMatchSession } from '../hooks/useMatchSession.js'
import { useRoleEffectMode } from '../hooks/useRoleEffectMode.js'
import { useMotionEnvironment } from '../hooks/useMotionEnvironment.js'
import { InkActivity } from '../components/match/InkActivity.js'
import { matchTimelineDays } from '../match-timeline.js'

interface ScopedFeedJumpRequest extends FeedJumpRequest {
  readonly matchId: MatchId
  readonly projectionKey: string
}

export function MatchPage() {
  const stageRef = useRef<HTMLElement>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [feedJump, setFeedJump] = useState<ScopedFeedJumpRequest | null>(null)
  const [effectMode] = useRoleEffectMode()
  const motion = useMotionEnvironment(effectMode)
  const {
    match,
    error,
    retry,
    connectionState,
    playbackState,
    viewPending,
    projectionKey,
    speechPlayback,
    voiceEnabled,
    viewKind,
    playerId,
    setViewKind,
    setPlayerId,
    toggleVoice,
  } = useMatchSession()
  const visibleDays = useMemo(() => matchTimelineDays(match?.timeline ?? []), [match?.timeline])
  const activeFeedJump =
    !viewPending &&
    feedJump?.matchId === match?.id &&
    feedJump?.projectionKey === projectionKey &&
    visibleDays.includes(feedJump.day)
      ? feedJump
      : null
  useEffect(() => {
    setFeedJump((current) =>
      current &&
      (viewPending ||
        current.matchId !== match?.id ||
        current.projectionKey !== projectionKey ||
        !visibleDays.includes(current.day))
        ? null
        : current,
    )
  }, [match?.id, projectionKey, viewPending, visibleDays])
  const feedAudio = useMemo<SpeechAudioControls>(
    () => ({
      supported: speechPlayback.supported,
      mode: speechPlayback.mode,
      activeSpeechId: speechPlayback.activeSpeechId,
      automaticSequence: speechPlayback.automaticSequence,
      automaticPlayerId: speechPlayback.automaticPlayerId,
      automaticBusy: speechPlayback.automaticBusy,
      manualSequence: speechPlayback.manualSequence,
      notice: {
        speechId: speechPlayback.noticeSpeechId,
        title: speechPlayback.noticeTitle,
        message: speechPlayback.notice,
        kind: speechPlayback.noticeKind,
      },
      play: speechPlayback.playManual,
      stop: speechPlayback.stopManual,
      skip: speechPlayback.skipAutomatic,
    }),
    [speechPlayback],
  )
  const playbackPlayerId =
    speechPlayback.mode === 'manual'
      ? (match?.timeline.find((item) => item.sequence === speechPlayback.manualSequence)
          ?.playerIds[0] ?? null)
      : speechPlayback.automaticPlayerId
  const presenceState = deriveMatchPresenceState(
    match,
    connectionState,
    viewPending,
    playbackPlayerId !== null,
  )
  const postgameReviewState = match?.postgameReview?.state
  useEffect(() => {
    if (
      !postgameReviewState ||
      postgameReviewState === 'countdown' ||
      postgameReviewState === 'skipped'
    ) {
      setReviewOpen(false)
    }
  }, [match?.id, postgameReviewState])
  const activePlayer = useMemo(
    () => match?.seats.find((seat) => seat.playerId === match.activeSpeech?.playerId) ?? null,
    [match],
  )
  const resumeMatch = async (): Promise<void> => {
    if (!match) return
    setActionBusy(true)
    setActionError(null)
    try {
      await api.resumeMatch(match.id)
      await retry()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setActionBusy(false)
    }
  }
  const runPostgameAction = async (
    action: (id: NonNullable<typeof match>['id']) => Promise<unknown>,
  ): Promise<void> => {
    if (!match) return
    setActionBusy(true)
    setActionError(null)
    try {
      await action(match.id)
      await retry()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setActionBusy(false)
    }
  }
  if (error && !match) return <ErrorState message={error} retry={() => void retry()} />
  if (!match) return <MatchLoadingStage mode={motion.mode} hidden={motion.hidden} />
  const thinkingPlayer = match.seats.find((seat) => seat.sessionStatus === 'thinking') ?? null
  const narratingPlayer = match.seats.find((seat) => seat.playerId === playbackPlayerId)
  const activityPlayer =
    presenceState === 'narrating'
      ? (narratingPlayer ?? null)
      : presenceState === 'streaming'
        ? activePlayer
        : thinkingPlayer
  const thinkingCount = match.seats.filter((seat) => seat.sessionStatus === 'thinking').length
  const lastSequence = match.lastSequence
  const sheriffId = match.seats.find((seat) => seat.sheriff)?.playerId ?? null
  const streamingPlayerId =
    match.activeSpeech && !match.activeSpeech.final ? match.activeSpeech.playerId : null
  const motionMode = viewPending ? 'off' : motion.mode
  return (
    <main
      className="aw-match-shell"
      data-presence-state={presenceState}
      data-phase={match.phaseId}
      data-motion-mode={motionMode}
      data-motion-suspended={motion.hidden}
      ref={stageRef}
    >
      <MatchMotionController
        key={`motion:${match.id}`}
        lastSequence={lastSequence}
        phaseId={match.phaseId}
        scope={stageRef}
        sheriffId={sheriffId}
        mode={motionMode}
        suspended={motion.hidden}
      />
      <RoleEffectController
        cues={match.effectCues}
        lastSequence={match.lastSequence}
        mode={motion.hidden || match.status === 'paused' ? 'off' : motionMode}
        projectionKey={`${match.id}:${projectionKey}`}
        key={match.id}
        scope={stageRef}
      />
      <MatchHeader
        audioBusyElsewhere={playbackState.enabled && !playbackState.controlledByThisClient}
        audioEnabled={voiceEnabled}
        audioSupported={speechPlayback.supported}
        audioError={speechPlayback.noticeSpeechId === null ? speechPlayback.notice : null}
        connectionState={connectionState}
        match={match}
        onToggleAudio={toggleVoice}
        onSelectDay={(day) => {
          if (viewPending || !visibleDays.includes(day)) return
          setReviewOpen(false)
          setFeedJump((current) => ({
            day,
            requestId: (current?.requestId ?? 0) + 1,
            matchId: match.id,
            projectionKey,
          }))
        }}
        selectedDay={activeFeedJump?.day}
        playerId={playerId}
        setPlayerId={setPlayerId}
        setViewKind={setViewKind}
        viewKind={viewKind}
        viewPending={viewPending}
      />
      <section className="aw-stage-frame">
        <div
          className="aw-match-projection"
          aria-hidden={viewPending}
          inert={viewPending || undefined}
        >
          <div className="aw-stage-grid">
            <PlayerRail
              side="left"
              phaseId={match.phaseId}
              postgameReview={match.postgameReview}
              streamingPlayerId={streamingPlayerId}
              narratingPlayerId={playbackPlayerId}
              suspended={match.status === 'paused' || viewPending}
              seats={match.seats.slice(0, Math.ceil(match.seats.length / 2))}
            />
            <section className="aw-panel aw-match-stage" data-review-open={reviewOpen}>
              {match.status !== 'paused' && !match.postgameReview ? (
                <PresenceStage
                  activePlayer={activityPlayer}
                  connectionState={connectionState}
                  match={match}
                  state={presenceState}
                  thinkingCount={thinkingCount}
                />
              ) : null}
              {match.status === 'paused' ? (
                <MatchRecoveryPanel
                  busy={actionBusy}
                  error={actionError}
                  reason={match.pausedReason}
                  onResume={() => void resumeMatch()}
                />
              ) : null}
              <div className="aw-match-records" data-review-open={reviewOpen}>
                <PostgameReviewPanel
                  busy={actionBusy}
                  error={actionError}
                  match={match}
                  open={reviewOpen}
                  onOpenChange={setReviewOpen}
                  onResume={() => void runPostgameAction((id) => api.resumePostgameReview(id))}
                  onSkip={() => void runPostgameAction((id) => api.skipPostgameReview(id))}
                  onStart={() => void runPostgameAction((id) => api.startPostgameReview(id))}
                />
                <MatchFeed
                  activeSpeech={match.activeSpeech}
                  jumpToDay={activeFeedJump}
                  audio={feedAudio}
                  postgameReview={match.postgameReview}
                  seats={match.seats}
                  timeline={match.timeline}
                />
              </div>
            </section>
            <PlayerRail
              side="right"
              phaseId={match.phaseId}
              postgameReview={match.postgameReview}
              seats={match.seats.slice(Math.ceil(match.seats.length / 2))}
              streamingPlayerId={streamingPlayerId}
              narratingPlayerId={playbackPlayerId}
              suspended={match.status === 'paused' || viewPending}
            />
          </div>
        </div>
        {viewPending ? (
          <div className="aw-projection-veil" role="status">
            <img src={gameArt.emblem} alt="" />
            <strong>{getCopy('match.projectionPending')}</strong>
          </div>
        ) : null}
      </section>
    </main>
  )
}

function MatchLoadingStage({
  mode,
  hidden,
}: {
  readonly mode: 'full' | 'reduced' | 'off'
  readonly hidden: boolean
}) {
  return (
    <main
      className="aw-match-shell aw-match-loading"
      data-presence-state="initial-loading"
      data-motion-mode={mode}
      data-motion-suspended={hidden}
    >
      <img src={gameArt.emblem} alt="" />
      <div className="aw-match-loading__brand">{getCopy('brand')}</div>
      <strong role="status">{getCopy('match.syncing')}</strong>
      <InkActivity state="starting" />
    </main>
  )
}
