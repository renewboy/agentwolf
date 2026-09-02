import { ArrowClockwise, Trash } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatCopy, getCopy } from '@agentwolf/assets'
import type { MatchView, SeatView } from '@agentwolf/contracts'
import { api } from '../api.js'
import { ConfirmDialog } from '../components/ConfirmDialog.js'
import { ErrorState } from '../components/AsyncState.js'
import { MatchFeed, type SpeechAudioControls } from '../components/match/MatchFeed.js'
import { MatchHeader } from '../components/match/MatchHeader.js'
import {
  deriveMatchPresenceState,
  MatchMotionController,
  type MatchPresenceState,
} from '../components/match/MatchMotionController.js'
import { PlayerRail } from '../components/match/PlayerRail.js'
import { PostgameReviewPanel } from '../components/match/PostgameReviewPanel.js'
import { RoleEffectController } from '../components/match/RoleEffectController.js'
import type { LiveConnectionState } from '../hooks/useLiveMatch.js'
import { useMatchSession } from '../hooks/useMatchSession.js'
import { useRoleEffectMode } from '../hooks/useRoleEffectMode.js'

export function MatchPage() {
  const navigate = useNavigate()
  const stageRef = useRef<HTMLElement>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [effectMode, setEffectMode] = useRoleEffectMode()
  const {
    match,
    error,
    controlError,
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
  const feedAudio = useMemo<SpeechAudioControls>(
    () => ({
      supported: speechPlayback.supported,
      mode: speechPlayback.mode,
      activeSpeechId: speechPlayback.activeSpeechId,
      automaticSequence: speechPlayback.automaticSequence,
      automaticPlayerId: speechPlayback.automaticPlayerId,
      automaticBusy: speechPlayback.automaticBusy,
      manualSequence: speechPlayback.manualSequence,
      play: speechPlayback.playManual,
      stop: speechPlayback.stopManual,
      skip: speechPlayback.skipAutomatic,
    }),
    [speechPlayback],
  )
  const presenceState = deriveMatchPresenceState(
    match,
    connectionState,
    viewPending,
    speechPlayback.automaticPlayerId !== null,
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
  const deleteMatch = async (): Promise<void> => {
    if (!match) return
    setActionBusy(true)
    setActionError(null)
    try {
      await api.deleteMatch(match.id)
      void navigate('/')
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause))
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
  if (!match) return <MatchLoadingStage />
  const splitIndex = Math.ceil(match.seats.length / 2)
  const leftSeats = match.seats.slice(0, splitIndex)
  const rightSeats = match.seats.slice(splitIndex)
  const thinkingPlayer = match.seats.find((seat) => seat.sessionStatus === 'thinking') ?? null
  const narratingPlayer = match.seats.find(
    (seat) => seat.playerId === speechPlayback.automaticPlayerId,
  )
  const thinkingCount = match.seats.filter((seat) => seat.sessionStatus === 'thinking').length
  const lastSequence = match.lastSequence
  const sheriffId = match.seats.find((seat) => seat.sheriff)?.playerId ?? null
  const sessionStateKey = match.seats
    .map((seat) => `${seat.playerId}:${seat.sessionStatus}`)
    .join('|')
  return (
    <main
      className="aw-match-shell"
      data-presence-state={presenceState}
      data-phase={match.phaseId}
      ref={stageRef}
    >
      <MatchMotionController
        lastSequence={lastSequence}
        phaseId={match.phaseId}
        presenceState={presenceState}
        scope={stageRef}
        sheriffId={sheriffId}
        sessionStateKey={sessionStateKey}
      />
      <RoleEffectController
        cues={match.effectCues}
        lastSequence={match.lastSequence}
        mode={effectMode}
        projectionKey={projectionKey}
        scope={stageRef}
      />
      <AmbientField />
      <MatchHeader
        audioBusyElsewhere={playbackState.enabled && !playbackState.controlledByThisClient}
        audioEnabled={voiceEnabled}
        audioSupported={speechPlayback.supported}
        connectionState={connectionState}
        effectMode={effectMode}
        match={match}
        onToggleAudio={toggleVoice}
        playerId={playerId}
        setPlayerId={setPlayerId}
        setEffectMode={setEffectMode}
        setViewKind={setViewKind}
        viewKind={viewKind}
      />
      <section className="aw-stage-frame">
        <div className="aw-mobile-roster">
          <PlayerRail
            compact
            phaseId={match.phaseId}
            postgameReview={match.postgameReview}
            seats={match.seats}
            side="mobile"
          />
        </div>
        <div className="aw-stage-grid" aria-hidden={viewPending} inert={viewPending || undefined}>
          <PlayerRail
            phaseId={match.phaseId}
            postgameReview={match.postgameReview}
            seats={leftSeats}
            side="left"
          />
          <section
            className="aw-match-stage"
            data-review-open={reviewOpen}
            aria-label={getCopy('match.timeline')}
          >
            <PresenceStage
              activePlayer={
                presenceState === 'narrating'
                  ? (narratingPlayer ?? null)
                  : presenceState === 'streaming'
                    ? activePlayer
                    : thinkingPlayer
              }
              connectionState={connectionState}
              match={match}
              state={presenceState}
              thinkingCount={thinkingCount}
            />
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
            {speechPlayback.notice || controlError ? (
              <p className="aw-audio-notice" role="status">
                {speechPlayback.notice ?? controlError}
              </p>
            ) : null}
            <MatchFeed
              activeSpeech={match.activeSpeech}
              audio={feedAudio}
              postgameReview={match.postgameReview}
              seats={match.seats}
              timeline={match.timeline}
            />
          </section>
          <PlayerRail
            phaseId={match.phaseId}
            postgameReview={match.postgameReview}
            seats={rightSeats}
            side="right"
          />
        </div>
        {viewPending ? (
          <div className="aw-projection-veil" role="status">
            <span className="aw-presence__orb" aria-hidden />
            <strong>{getCopy('match.projectionPending')}</strong>
          </div>
        ) : null}
      </section>
      {match.status === 'paused' ? (
        <div className="aw-pause-overlay" role="alert">
          <div className="aw-pause-dialog aw-panel">
            <h2>{getCopy('match.paused')}</h2>
            <p>{match.pausedReason}</p>
            {actionError ? (
              <p className="aw-form-message aw-form-message--error">{actionError}</p>
            ) : null}
            <div className="aw-pause-actions">
              <button
                className="aw-button aw-button--primary"
                disabled={actionBusy}
                type="button"
                onClick={() => void resumeMatch()}
              >
                <ArrowClockwise
                  className={actionBusy ? 'aw-spin' : undefined}
                  size={18}
                  aria-hidden
                />
                {getCopy(actionBusy ? 'match.resuming' : 'match.resume')}
              </button>
              <button
                className="aw-button aw-button--danger"
                disabled={actionBusy}
                type="button"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash size={18} aria-hidden />
                {getCopy('match.delete')}
              </button>
              <Link className="aw-button" to="/">
                {getCopy('match.backLobby')}
              </Link>
            </div>
          </div>
        </div>
      ) : null}
      <ConfirmDialog
        busy={actionBusy}
        confirmLabel={getCopy('match.delete')}
        description={getCopy('match.deleteConfirm')}
        open={deleteOpen}
        title={getCopy('match.deleteTitle')}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void deleteMatch()}
      />
    </main>
  )
}

function PresenceStage({
  state,
  match,
  activePlayer,
  connectionState,
  thinkingCount,
}: {
  readonly state: MatchPresenceState
  readonly match: MatchView
  readonly activePlayer: SeatView | null
  readonly connectionState: LiveConnectionState
  readonly thinkingCount: number
}) {
  const label = presenceLabel(state, match, activePlayer, thinkingCount)
  return (
    <section className="aw-presence" data-state={state} aria-live="polite">
      <div className="aw-presence__orb" aria-hidden>
        <span />
      </div>
      <div className="aw-presence__copy">
        <small>{match.phaseLabel || getCopy('match.presenceLive')}</small>
        <strong>{label}</strong>
      </div>
      <span className="aw-presence__signal" aria-hidden />
      <span className="aw-presence__wave" aria-hidden>
        <span />
        <span />
        <span />
        <span />
        <span />
      </span>
      <span className="aw-visually-hidden">
        {connectionState === 'live'
          ? getCopy('match.connectionLive')
          : connectionState === 'settled'
            ? getCopy('match.connectionSettled')
            : label}
      </span>
    </section>
  )
}

function presenceLabel(
  state: MatchPresenceState,
  match: MatchView,
  activePlayer: SeatView | null,
  thinkingCount: number,
): string {
  const review = match.postgameReview
  if (review && !['completed', 'skipped'].includes(review.state)) {
    if (review.state === 'paused') return getCopy('postgame.paused')
    if (review.state === 'countdown') return getCopy('postgame.countdownTitle')
    if (review.state === 'collecting') return getCopy('postgame.collectingPresence')
    const speaker = match.seats.find((seat) => seat.playerId === review.currentSpeakerId)
    if (speaker) {
      return formatCopy(getCopy('postgame.speakingPresence'), { player: speaker.name })
    }
  }
  const orderingSheriff =
    match.phaseId === 'phase-day-speech-order'
      ? match.seats.find((seat) => seat.sheriff && seat.alive)
      : undefined
  switch (state) {
    case 'starting':
      return getCopy('match.presenceStarting')
    case 'thinking':
      if (orderingSheriff) {
        return formatCopy(getCopy('match.presenceSheriffOrdering'), {
          seat: orderingSheriff.seat,
          player: orderingSheriff.name,
        })
      }
      if (thinkingCount > 1) {
        return formatCopy(getCopy('match.presenceThinkingMany'), { count: thinkingCount })
      }
      return activePlayer
        ? formatCopy(getCopy('match.presenceThinking'), { player: activePlayer.name })
        : getCopy('match.presenceAwaiting')
    case 'streaming':
      return activePlayer
        ? formatCopy(getCopy('match.presenceStreaming'), { player: activePlayer.name })
        : getCopy('match.presenceAwaiting')
    case 'narrating':
      return activePlayer
        ? formatCopy(getCopy('match.presenceNarrating'), { player: activePlayer.name })
        : getCopy('match.presenceNarratingFallback')
    case 'resolving':
      return getCopy('match.presenceResolving')
    case 'reconnecting':
      return getCopy('match.presenceReconnecting')
    case 'recovering-agents':
      return getCopy('match.presenceRecoveringAgents')
    case 'switching-view':
      return getCopy('match.presenceSwitchingView')
    case 'paused':
      return getCopy('match.presencePaused')
    case 'ended':
      if (!match.winner) return getCopy('match.presenceEnded')
      const factionWinnerIds = match.seats
        .filter((seat) => seat.faction === match.winner)
        .map((seat) => seat.playerId)
        .sort()
      const explicitWinnerIds = [...match.winningPlayerIds].sort()
      const hasDynamicWinners =
        explicitWinnerIds.length > 0 &&
        (explicitWinnerIds.length !== factionWinnerIds.length ||
          explicitWinnerIds.some((playerId, index) => playerId !== factionWinnerIds[index]))
      if (!hasDynamicWinners) {
        return formatCopy(getCopy('match.winner'), { faction: getCopy(`factions.${match.winner}`) })
      }
      const winningPlayers = match.seats
        .filter((seat) => match.winningPlayerIds.includes(seat.playerId))
        .map((seat) =>
          formatCopy(getCopy('postgame.playerShort'), { seat: seat.seat, name: seat.name }),
        )
        .join('、')
      return winningPlayers
        ? formatCopy(getCopy('match.winnerWithPlayers'), {
            faction: getCopy(`factions.${match.winner}`),
            players: winningPlayers,
          })
        : formatCopy(getCopy('match.winner'), { faction: getCopy(`factions.${match.winner}`) })
    case 'initial-loading':
      return getCopy('match.syncing')
    case 'awaiting-actions':
      if (orderingSheriff) {
        return formatCopy(getCopy('match.presenceSheriffOrderPending'), {
          seat: orderingSheriff.seat,
          player: orderingSheriff.name,
        })
      }
      return getCopy(
        match.phaseId.includes('vote') ? 'match.presenceVotePending' : 'match.presenceAwaiting',
      )
    default:
      return getCopy('match.presenceAwaiting')
  }
}

function MatchLoadingStage() {
  return (
    <main className="aw-match-shell aw-match-loading" data-presence-state="initial-loading">
      <AmbientField />
      <div className="aw-match-loading__brand">{getCopy('brand')}</div>
      <div className="aw-match-loading__grid" role="status">
        <div className="aw-match-loading__rail" />
        <div className="aw-match-loading__center">
          <span className="aw-presence__orb" aria-hidden />
          <strong>{getCopy('match.syncing')}</strong>
        </div>
        <div className="aw-match-loading__rail" />
      </div>
    </main>
  )
}

function AmbientField() {
  return (
    <div className="aw-lunar-field" aria-hidden>
      <span className="aw-lunar-field__glow" />
      <span className="aw-lunar-field__haze" />
      <span className="aw-lunar-field__grain" />
    </div>
  )
}
