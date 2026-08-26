import { ArrowClockwise, CaretRight, Play, SkipForward, X } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { formatCopy, getCopy } from '@agentwolf/assets'
import type {
  MatchView,
  PlayerId,
  PostgameReviewSubmission,
  PostgameReviewView,
  SeatView,
} from '@agentwolf/contracts'
import { PostgameAwardCard } from './PostgameAwardResults.js'
import { PostgameRadar } from './PostgameRadar.js'

export function PostgameReviewPanel({
  match,
  busy,
  error,
  onStart,
  onSkip,
  onResume,
  open,
  onOpenChange,
}: {
  readonly match: MatchView
  readonly busy: boolean
  readonly error: string | null
  readonly onStart: () => void
  readonly onSkip: () => void
  readonly onResume: () => void
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}) {
  const review = match.postgameReview
  const [mode, setMode] = useState<'result' | 'sheets'>('result')
  const [reviewerId, setReviewerId] = useState<PlayerId | null>(null)
  const [ratingTargetId, setRatingTargetId] = useState<PlayerId | null>(null)
  const [resultPlayerId, setResultPlayerId] = useState<PlayerId | null>(null)
  const openButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const seconds = useCountdown(review?.decisionDeadlineAt ?? null)

  useEffect(() => {
    if (open) closeButtonRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!review) return
    const latest = [...review.submissions]
      .sort((left, right) => Date.parse(left.submittedAt) - Date.parse(right.submittedAt))
      .at(-1)?.reviewerId
    if (!reviewerId || !review.submissions.some((entry) => entry.reviewerId === reviewerId)) {
      setReviewerId(latest ?? null)
    }
  }, [review, reviewerId])

  useEffect(() => {
    if (!reviewerId || !review) return
    const submission = review.submissions.find((entry) => entry.reviewerId === reviewerId)
    if (!submission) return
    if (!ratingTargetId || !submission.ratings.some((entry) => entry.playerId === ratingTargetId)) {
      setRatingTargetId(submission.ratings[0]?.playerId ?? null)
    }
  }, [ratingTargetId, review, reviewerId])

  useEffect(() => {
    if (!review?.result) return
    if (
      !resultPlayerId ||
      !review.result.players.some((entry) => entry.playerId === resultPlayerId)
    ) {
      setResultPlayerId(review.result.mvp.playerId)
    }
  }, [resultPlayerId, review])

  if (!review) return null
  if (review.state === 'countdown') {
    return (
      <section className="aw-postgame-strip aw-postgame-strip--countdown" aria-live="polite">
        <div>
          <small>{getCopy('postgame.title')}</small>
          <h2>{getCopy('postgame.countdownTitle')}</h2>
          <p>{formatCopy(getCopy('postgame.countdownDescription'), { seconds })}</p>
        </div>
        <div
          aria-label={formatCopy(getCopy('postgame.countdownAria'), { seconds })}
          className="aw-postgame-countdown"
          role="timer"
        >
          <strong>{seconds}</strong>
          <span>{getCopy('postgame.countdownUnit')}</span>
        </div>
        <div className="aw-postgame-actions">
          <button
            className="aw-button aw-button--primary"
            disabled={busy}
            type="button"
            onClick={onStart}
          >
            <Play size={17} weight="fill" aria-hidden />
            {getCopy(busy ? 'postgame.starting' : 'postgame.startNow')}
          </button>
          <button className="aw-button" disabled={busy} type="button" onClick={onSkip}>
            <SkipForward size={17} aria-hidden />
            {getCopy('postgame.skip')}
          </button>
        </div>
        {error ? <p className="aw-form-message aw-form-message--error">{error}</p> : null}
      </section>
    )
  }
  if (review.state === 'skipped') {
    return (
      <div className="aw-postgame-strip aw-postgame-strip--compact">
        {getCopy('postgame.skipped')}
      </div>
    )
  }

  const selectedSubmission = review.submissions.find((entry) => entry.reviewerId === reviewerId)
  const showResults = Boolean(review.result) && mode === 'result'
  return (
    <>
      <PostgameSummaryStrip
        busy={busy}
        error={error}
        match={match}
        open={open}
        openButtonRef={openButtonRef}
        review={review}
        onOpenChange={onOpenChange}
        onResume={onResume}
      />
      {open ? (
        <aside
          aria-label={getCopy('postgame.inspector')}
          className="aw-postgame-inspector"
          data-state={review.state}
          id="postgame-review-inspector"
        >
          <PostgameHeader
            closeButtonRef={closeButtonRef}
            match={match}
            review={review}
            onClose={() => {
              onOpenChange(false)
              queueMicrotask(() => openButtonRef.current?.focus())
            }}
          />
          <div className="aw-postgame-toolbar">
            {review.result ? (
              <div className="aw-postgame-mode" aria-label={getCopy('postgame.title')}>
                <button
                  aria-pressed={mode === 'result'}
                  className="aw-button"
                  type="button"
                  onClick={() => setMode('result')}
                >
                  {getCopy('postgame.finalResult')}
                </button>
                <button
                  aria-pressed={mode === 'sheets'}
                  className="aw-button"
                  type="button"
                  onClick={() => setMode('sheets')}
                >
                  {getCopy('postgame.individualSheets')}
                </button>
              </div>
            ) : null}
          </div>
          {showResults && review.result ? (
            <FinalResult
              match={match}
              review={review}
              playerId={resultPlayerId}
              onSelectPlayer={setResultPlayerId}
            />
          ) : (
            <ReviewSheets
              match={match}
              review={review}
              reviewerId={reviewerId}
              ratingTargetId={ratingTargetId}
              submission={selectedSubmission}
              onSelectReviewer={setReviewerId}
              onSelectTarget={setRatingTargetId}
            />
          )}
          {error ? <p className="aw-form-message aw-form-message--error">{error}</p> : null}
        </aside>
      ) : null}
    </>
  )
}

function PostgameSummaryStrip({
  match,
  review,
  busy,
  error,
  open,
  openButtonRef,
  onOpenChange,
  onResume,
}: {
  readonly match: MatchView
  readonly review: PostgameReviewView
  readonly busy: boolean
  readonly error: string | null
  readonly open: boolean
  readonly openButtonRef: RefObject<HTMLButtonElement | null>
  readonly onOpenChange: (open: boolean) => void
  readonly onResume: () => void
}) {
  const current = seatFor(match, review.currentSpeakerId)
  const mvp = seatFor(match, review.result?.mvp.playerId ?? null)
  const svp = seatFor(match, review.result?.svp.playerId ?? null)
  const title =
    review.state === 'collecting'
      ? getCopy('postgame.collectingTitle')
      : review.state === 'completed'
        ? getCopy('postgame.completedTitle')
        : review.state === 'paused'
          ? getCopy('postgame.paused')
          : getCopy('postgame.speakingTitle')
  const detail =
    review.state === 'collecting'
      ? formatCopy(getCopy('postgame.collectingProgress'), {
          submitted: review.submittedCount,
          total: review.totalPlayers,
        })
      : current
        ? formatCopy(getCopy('postgame.speakingPresence'), { player: current.name })
        : review.result && mvp && svp
          ? formatCopy(getCopy('postgame.awardSummary'), {
              mvp: formatCopy(getCopy('postgame.playerShort'), {
                seat: mvp.seat,
                name: mvp.name,
              }),
              svp: formatCopy(getCopy('postgame.playerShort'), {
                seat: svp.seat,
                name: svp.name,
              }),
            })
          : formatCopy(getCopy('postgame.speakingProgress'), {
              completed: review.reflections.length,
              total: review.totalPlayers,
            })
  return (
    <section className="aw-postgame-strip" data-state={review.state}>
      <div className="aw-postgame-strip__summary">
        <span className="aw-postgame-strip__signal" aria-hidden />
        <div>
          <small>{getCopy('postgame.title')}</small>
          <strong>{title}</strong>
          <span>{detail}</span>
        </div>
      </div>
      <div className="aw-postgame-strip__actions">
        {review.state === 'paused' ? (
          <button
            className="aw-button aw-button--primary"
            disabled={busy}
            type="button"
            onClick={onResume}
          >
            <ArrowClockwise size={17} aria-hidden />
            {getCopy('postgame.resume')}
          </button>
        ) : null}
        <button
          aria-controls="postgame-review-inspector"
          aria-expanded={open}
          className="aw-button aw-postgame-inspector-toggle"
          ref={openButtonRef}
          type="button"
          onClick={() => onOpenChange(!open)}
        >
          {getCopy(open ? 'postgame.closeInspector' : 'postgame.openInspector')}
          <CaretRight size={17} aria-hidden />
        </button>
      </div>
      {error ? <p className="aw-form-message aw-form-message--error">{error}</p> : null}
    </section>
  )
}

function PostgameHeader({
  match,
  review,
  closeButtonRef,
  onClose,
}: {
  readonly match: MatchView
  readonly review: PostgameReviewView
  readonly closeButtonRef: RefObject<HTMLButtonElement | null>
  readonly onClose: () => void
}) {
  const current = seatFor(match, review.currentSpeakerId)
  const reflectionCount = review.reflections.length
  return (
    <header className="aw-postgame-heading">
      <div>
        <small>{getCopy('postgame.title')}</small>
        <h2>
          {review.state === 'collecting'
            ? getCopy('postgame.collectingTitle')
            : review.state === 'completed'
              ? getCopy('postgame.completedTitle')
              : getCopy('postgame.speakingTitle')}
        </h2>
      </div>
      <strong>
        {review.state === 'collecting'
          ? formatCopy(getCopy('postgame.collectingProgress'), {
              submitted: review.submittedCount,
              total: review.totalPlayers,
            })
          : current
            ? formatCopy(getCopy('postgame.speakingPresence'), { player: current.name })
            : formatCopy(getCopy('postgame.speakingProgress'), {
                completed: reflectionCount,
                total: review.totalPlayers,
              })}
      </strong>
      <button
        aria-label={getCopy('postgame.closeInspector')}
        className="aw-button aw-button--square aw-postgame-inspector-close"
        ref={closeButtonRef}
        type="button"
        onClick={onClose}
      >
        <X size={17} aria-hidden />
      </button>
    </header>
  )
}

function ReviewSheets({
  match,
  review,
  reviewerId,
  ratingTargetId,
  submission,
  onSelectReviewer,
  onSelectTarget,
}: {
  readonly match: MatchView
  readonly review: PostgameReviewView
  readonly reviewerId: PlayerId | null
  readonly ratingTargetId: PlayerId | null
  readonly submission: PostgameReviewSubmission | undefined
  readonly onSelectReviewer: (playerId: PlayerId) => void
  readonly onSelectTarget: (playerId: PlayerId) => void
}) {
  const submitted = new Set(review.submissions.map((entry) => entry.reviewerId))
  const rating = submission?.ratings.find((entry) => entry.playerId === ratingTargetId)
  const reviewer = seatFor(match, reviewerId)
  return (
    <div className="aw-postgame-content">
      <div className="aw-postgame-player-tabs" aria-label={getCopy('postgame.selectReviewer')}>
        {match.seats.map((seat) => (
          <button
            aria-pressed={reviewerId === seat.playerId}
            className="aw-postgame-player-tab"
            data-submitted={submitted.has(seat.playerId)}
            disabled={!submitted.has(seat.playerId)}
            key={seat.playerId}
            type="button"
            onClick={() => onSelectReviewer(seat.playerId)}
          >
            <span className="aw-postgame-player-tab__seat">{seat.seat}</span>
            <span className="aw-postgame-player-tab__name">{seat.name}</span>
          </button>
        ))}
      </div>
      {!submission || !reviewer ? (
        <p className="aw-postgame-empty">{getCopy('postgame.waitingSheet')}</p>
      ) : (
        <div className="aw-postgame-sheet">
          <h3>{formatCopy(getCopy('postgame.reviewerSheet'), { player: reviewer.name })}</h3>
          <div className="aw-postgame-nominations">
            <Nomination
              label={getCopy('postgame.mvpNomination')}
              seat={seatFor(match, submission.mvpPlayerId)}
            />
            <Nomination
              label={getCopy('postgame.svpNomination')}
              seat={seatFor(match, submission.svpPlayerId)}
            />
          </div>
          <div className="aw-postgame-rating-layout">
            <div className="aw-postgame-targets" aria-label={getCopy('postgame.ratingTarget')}>
              {submission.ratings.map((entry) => {
                const seat = seatFor(match, entry.playerId)
                return seat ? (
                  <button
                    aria-pressed={ratingTargetId === entry.playerId}
                    key={entry.playerId}
                    type="button"
                    onClick={() => onSelectTarget(entry.playerId)}
                  >
                    {seat.seat} · {seat.name}
                  </button>
                ) : null
              })}
            </div>
            {rating ? <PostgameRadar scores={rating.scores} /> : null}
          </div>
        </div>
      )}
    </div>
  )
}

function FinalResult({
  match,
  review,
  playerId,
  onSelectPlayer,
}: {
  readonly match: MatchView
  readonly review: PostgameReviewView
  readonly playerId: PlayerId | null
  readonly onSelectPlayer: (playerId: PlayerId) => void
}) {
  const result = review.result!
  const selected = result.players.find((entry) => entry.playerId === playerId) ?? result.players[0]
  const reflection = review.reflections.find((entry) => entry.playerId === selected?.playerId)
  return (
    <div className="aw-postgame-content">
      <div className="aw-postgame-awards">
        <PostgameAwardCard award="mvp" result={result} seats={match.seats} />
        <PostgameAwardCard award="svp" result={result} seats={match.seats} />
      </div>
      <div className="aw-postgame-player-tabs" aria-label={getCopy('postgame.finalResult')}>
        {result.players.map((entry) => {
          const seat = seatFor(match, entry.playerId)
          return seat ? (
            <button
              aria-pressed={selected?.playerId === entry.playerId}
              className="aw-postgame-player-tab"
              key={entry.playerId}
              type="button"
              onClick={() => onSelectPlayer(entry.playerId)}
            >
              <span>{seat.seat}</span>
              {entry.overall.toFixed(1)}
            </button>
          ) : null
        })}
      </div>
      {selected ? (
        <div className="aw-postgame-final-player">
          <PostgameRadar overall={selected.overall} scores={selected.scores} />
          <div>
            <p>{formatCopy(getCopy('postgame.ratingCount'), { count: selected.ratingCount })}</p>
            <h3>{getCopy('postgame.reflection')}</h3>
            <p>{reflection?.text ?? getCopy('postgame.reflectionPending')}</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Nomination({ label, seat }: { readonly label: string; readonly seat: SeatView | null }) {
  return (
    <div>
      <small>{label}</small>
      <strong>{seat ? `${seat.seat} · ${seat.name}` : getCopy('common.none')}</strong>
    </div>
  )
}

function seatFor(match: MatchView, playerId: PlayerId | null): SeatView | null {
  return playerId ? (match.seats.find((seat) => seat.playerId === playerId) ?? null) : null
}

function useCountdown(deadline: string | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!deadline) return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [deadline])
  return useMemo(
    () => (deadline ? Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1_000)) : 0),
    [deadline, now],
  )
}
