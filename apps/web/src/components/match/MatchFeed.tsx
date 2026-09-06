import { GameIcon } from '../GameIcon.js'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFollowLatest } from '@agent-arena/react'
import { FollowLatestController, type PresentationPlaybackMode } from '@agent-arena/web-runtime'
import { formatCopy, getCopy } from '@agentwolf/assets'
import type {
  MatchView,
  PlayerId,
  PostgameReviewView,
  SeatView,
  SpeechId,
  TimelineItem,
} from '@agentwolf/contracts'
import { characterPortraitUrl } from '../../character-portraits.js'
import { gameArt } from '../../game-art.js'
import { groupMatchTimeline } from '../../match-timeline.js'
import { PostgameFeedAwards } from './PostgameAwardResults.js'

export interface SpeechAudioControls {
  readonly supported: boolean
  readonly mode: PresentationPlaybackMode
  readonly activeSpeechId: SpeechId | null
  readonly automaticSequence: number | null
  readonly automaticPlayerId: PlayerId | null
  readonly automaticBusy: boolean
  readonly manualSequence: number | null
  readonly play: (item: TimelineItem) => void
  readonly stop: () => void
  readonly skip: (speechId: SpeechId) => void
}

export interface FeedJumpRequest {
  readonly day: number
  readonly requestId: number
}

export function MatchFeed({
  timeline,
  seats,
  activeSpeech,
  audio,
  postgameReview,
  jumpToDay = null,
}: {
  readonly timeline: readonly TimelineItem[]
  readonly seats: readonly SeatView[]
  readonly activeSpeech: MatchView['activeSpeech']
  readonly audio: SpeechAudioControls
  readonly postgameReview: PostgameReviewView | null
  readonly jumpToDay?: FeedJumpRequest | null
}) {
  const postgameStartedAt = postgameReview?.startedAt ?? null
  const postgameResultAt = postgameReview?.result?.completedAt ?? null
  const groups = useMemo(
    () => groupMatchTimeline(timeline, postgameStartedAt !== null),
    [postgameStartedAt, timeline],
  )
  const latestKey = groups.at(-1)?.key ?? null
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(
    () => new Set(latestKey ? [latestKey] : []),
  )
  const scrollRef = useRef<HTMLDivElement>(null)
  const followController = useMemo(() => new FollowLatestController(), [])
  const followState = useFollowLatest(followController)
  const pendingScrollFrame = useRef<number | null>(null)
  const handledJumpRequest = useRef<number | null>(null)
  const lastSequence = timeline.at(-1)?.sequence ?? 0
  const liveLength = activeSpeech && !activeSpeech.final ? activeSpeech.text.length : 0

  useEffect(() => {
    if (!latestKey) return undefined
    setOpenGroups((current) => {
      if (current.has(latestKey)) return current
      return new Set([...current, latestKey])
    })
    return undefined
  }, [latestKey])

  useLayoutEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return undefined
    if (!followController.contentChanged()) return undefined
    const frame = window.requestAnimationFrame(() => {
      pendingScrollFrame.current = null
      if (!followController.snapshot().following) return
      scroller.scrollTo({
        top: scroller.scrollHeight,
        behavior: 'auto',
      })
      followController.returnToLatest()
    })
    pendingScrollFrame.current = frame
    return () => {
      if (pendingScrollFrame.current !== frame) return
      window.cancelAnimationFrame(frame)
      pendingScrollFrame.current = null
    }
  }, [followController, lastSequence, liveLength, postgameResultAt, postgameStartedAt])

  useLayoutEffect(() => {
    if (!jumpToDay) {
      handledJumpRequest.current = null
      return undefined
    }
    if (handledJumpRequest.current === jumpToDay.requestId) return undefined
    const key = `day-${jumpToDay.day}`
    if (!groups.some((group) => group.key === key)) return undefined
    followController.detach()
    if (pendingScrollFrame.current !== null) {
      window.cancelAnimationFrame(pendingScrollFrame.current)
      pendingScrollFrame.current = null
    }
    if (!openGroups.has(key)) {
      setOpenGroups((current) => new Set([...current, key]))
      return undefined
    }
    const frame = window.requestAnimationFrame(() => {
      const scroller = scrollRef.current
      const group = scroller?.querySelector<HTMLElement>(`[data-day-key="${key}"]`)
      if (!scroller || !group) return
      const top =
        group.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop
      scroller.scrollTo({ top: Math.max(0, top), behavior: 'auto' })
      handledJumpRequest.current = jumpToDay.requestId
    })
    return () => window.cancelAnimationFrame(frame)
  }, [followController, groups, jumpToDay, openGroups])

  const toggleGroup = (key: string): void => {
    setOpenGroups((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const returnToLatest = (): void => {
    const scroller = scrollRef.current
    if (!scroller) return
    followController.returnToLatest()
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' })
  }

  const stopFollowingLatest = (): void => {
    followController.detach()
    if (pendingScrollFrame.current === null) return
    window.cancelAnimationFrame(pendingScrollFrame.current)
    pendingScrollFrame.current = null
  }

  return (
    <section className="aw-feed-shell" aria-label={getCopy('match.timeline')}>
      <h2 className="aw-feed-title">{getCopy('match.timeline')}</h2>
      <div
        className="aw-feed-scroll"
        ref={scrollRef}
        role="log"
        aria-live="polite"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp' || event.key === 'PageUp' || event.key === 'Home') {
            stopFollowingLatest()
          }
        }}
        onPointerDown={stopFollowingLatest}
        onScroll={(event) => {
          const element = event.currentTarget
          const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight
          followController.observeDistance(distanceFromBottom, 96)
        }}
        onWheel={(event) => {
          if (event.deltaY < 0) stopFollowingLatest()
        }}
      >
        {groups.length === 0 ? (
          <div className="aw-feed-empty">
            <GameIcon name="text" size={30} />
            <p>{getCopy('match.eventEmpty')}</p>
          </div>
        ) : (
          groups.map((group) => {
            const open = openGroups.has(group.key)
            const postgameRecordCount =
              group.key === 'postgame'
                ? Number(postgameStartedAt !== null) + Number(Boolean(postgameReview?.result))
                : 0
            return (
              <section
                className="aw-day-group"
                data-open={open}
                data-day-key={group.key}
                key={group.key}
              >
                <button
                  className="aw-disclosure-row aw-etched-divider aw-day-group__toggle"
                  aria-expanded={open}
                  aria-label={formatCopy(getCopy(open ? 'match.collapseDay' : 'match.expandDay'), {
                    day: group.label,
                  })}
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                >
                  <span className="aw-disclosure-row__title">{group.label}</span>
                  <small className="aw-disclosure-row__meta">
                    {formatCopy(getCopy('match.eventCount'), {
                      count: group.items.length + postgameRecordCount,
                    })}
                  </small>
                  <GameIcon className="aw-disclosure-row__icon" name="down" size={17} />
                </button>
                {open ? (
                  <div className="aw-day-group__items">
                    {group.key === 'postgame' && postgameStartedAt ? (
                      <SystemEvent
                        detail={getCopy('postgame.startedTimelineDetail')}
                        kind="postgame.started"
                        occurredAt={postgameStartedAt}
                        title={getCopy('postgame.startedTimelineTitle')}
                      />
                    ) : null}
                    {group.key === 'postgame' && postgameReview?.result ? (
                      <PostgameFeedAwards result={postgameReview.result} seats={seats} />
                    ) : null}
                    {group.items.map((item) => (
                      <FeedItem
                        audio={audio}
                        item={item}
                        key={`${item.kind}:${item.sequence}`}
                        seats={seats}
                      />
                    ))}
                  </div>
                ) : null}
              </section>
            )
          })
        )}
        {activeSpeech && !activeSpeech.final ? (
          <SpeechBubble
            audio={audio}
            live
            playerId={activeSpeech.playerId}
            seats={seats}
            speechId={activeSpeech.speechId}
            text={activeSpeech.text}
          />
        ) : null}
      </div>
      {followState.hasNewActivity ? (
        <button
          className="aw-button aw-button--compact aw-feed-latest"
          type="button"
          onClick={returnToLatest}
        >
          <GameIcon name="down" size={17} />
          {getCopy('match.backLatest')}
        </button>
      ) : null}
    </section>
  )
}

function FeedItem({
  item,
  seats,
  audio,
}: {
  readonly item: TimelineItem
  readonly seats: readonly SeatView[]
  readonly audio: SpeechAudioControls
}) {
  if (item.kind === 'speech.committed' && item.playerIds[0]) {
    return (
      <SpeechBubble
        audio={audio}
        item={item}
        playerId={item.playerIds[0]}
        seats={seats}
        text={item.title}
      />
    )
  }
  if (item.kind === 'vote.resolved') return <VoteResult item={item} seats={seats} />

  return (
    <SystemEvent
      kind={item.kind}
      occurredAt={item.occurredAt}
      sequence={item.sequence}
      title={item.title}
      {...(item.detail ? { detail: item.detail } : {})}
    />
  )
}

function SystemEvent({
  kind,
  title,
  detail,
  occurredAt,
  sequence,
}: {
  readonly kind: string
  readonly title: string
  readonly detail?: string
  readonly occurredAt: string
  readonly sequence?: number
}) {
  const tone = eventTone(kind)
  return (
    <article className="aw-feed-item aw-system-event" data-sequence={sequence} data-tone={tone}>
      <span className="aw-system-event__icon" aria-hidden>
        {tone === 'night' ? <GameIcon name="moon" size={19} /> : <GameIcon name="text" size={19} />}
      </span>
      <div>
        {kind === 'match.paused' ? (
          <>
            <p>{getCopy('match.paused')}</p>
            <details className="aw-system-event__details">
              <summary>{getCopy('tableDesign.errorDetails')}</summary>
              <p>{title}</p>
              {detail ? <small>{detail}</small> : null}
            </details>
          </>
        ) : (
          <>
            <p>{title}</p>
            {detail ? <small>{detail}</small> : null}
          </>
        )}
      </div>
      <time dateTime={occurredAt}>{formatEventTime(occurredAt)}</time>
    </article>
  )
}

function SpeechBubble({
  playerId,
  seats,
  text,
  item,
  audio,
  speechId,
  live = false,
}: {
  readonly playerId: PlayerId
  readonly seats: readonly SeatView[]
  readonly text: string
  readonly item?: TimelineItem
  readonly audio?: SpeechAudioControls
  readonly speechId?: SpeechId
  readonly live?: boolean
}) {
  const playerIndex = seats.findIndex((seat) => seat.playerId === playerId)
  const player = seats[playerIndex]
  if (!player) return null
  const playerLabel = formatCopy(getCopy('narration.playerLabel'), {
    seat: player.seat,
    name: player.name,
  })
  const playbackSpeechId = item ? (item.speechId ?? (item.sequence as SpeechId)) : speechId
  const playback =
    audio?.activeSpeechId !== undefined &&
    audio.activeSpeechId !== null &&
    audio.activeSpeechId === playbackSpeechId
      ? audio.mode === 'manual'
        ? 'manual'
        : audio.mode === 'automatic'
          ? 'automatic'
          : 'idle'
      : 'idle'
  return (
    <article
      className="aw-feed-item aw-speech-bubble"
      data-side={playerIndex < Math.ceil(seats.length / 2) ? 'left' : 'right'}
      data-live={live}
      data-playback={playback}
      data-sequence={item?.sequence}
    >
      <span className="aw-speech-bubble__avatar" aria-hidden>
        <img
          className="aw-speech-bubble__portrait"
          src={
            player.character
              ? characterPortraitUrl(player.character.portraitAssetId)
              : gameArt.defaultPlayer
          }
          alt=""
        />
      </span>
      <div className="aw-speech-bubble__body">
        <header>
          <strong className="aw-player-name">{playerLabel}</strong>
          {item ? <time dateTime={item.occurredAt}>{formatEventTime(item.occurredAt)}</time> : null}
          {playback === 'automatic' && audio ? (
            <SpeechAudioButton
              audio={audio}
              item={item}
              playback={playback}
              playerLabel={playerLabel}
              speechId={playbackSpeechId}
            />
          ) : live ? (
            <span>{getCopy('sessionStatuses.thinking')}</span>
          ) : item && audio ? (
            <SpeechAudioButton
              audio={audio}
              item={item}
              playback={playback}
              playerLabel={playerLabel}
              speechId={playbackSpeechId}
            />
          ) : null}
        </header>
        <div className="aw-speech-bubble__message">
          <span className="aw-speech-bubble__pointer" aria-hidden />
          <span className="aw-speech-bubble__landscape" aria-hidden />
          <p>
            {text || getCopy('match.noSpeech')}
            {live ? <span className="aw-stream-cursor" aria-hidden /> : null}
          </p>
        </div>
      </div>
    </article>
  )
}

function SpeechAudioButton({
  audio,
  item,
  playback,
  playerLabel,
  speechId,
}: {
  readonly audio: SpeechAudioControls
  readonly item: TimelineItem | undefined
  readonly playback: 'automatic' | 'manual' | 'idle'
  readonly playerLabel: string
  readonly speechId: SpeechId | undefined
}) {
  if (playback === 'automatic') {
    return (
      <button
        className="aw-button aw-button--compact aw-speech-audio-control"
        aria-label={formatCopy(getCopy('match.audioSkipSpeech'), { player: playerLabel })}
        type="button"
        onClick={() => {
          if (speechId !== undefined) audio.skip(speechId)
        }}
      >
        <GameIcon name="skip" size={15} />
        <span>{getCopy('match.audioSkip')}</span>
      </button>
    )
  }
  if (playback === 'manual') {
    return (
      <button
        className="aw-button aw-button--compact aw-speech-audio-control"
        aria-label={formatCopy(getCopy('match.audioStopSpeech'), { player: playerLabel })}
        type="button"
        onClick={() => audio.stop()}
      >
        <GameIcon name="stop" size={14} />
        <span>{getCopy('match.audioStop')}</span>
      </button>
    )
  }
  if (!item) return null
  return (
    <button
      className="aw-button aw-button--compact aw-speech-audio-control"
      aria-label={formatCopy(getCopy('match.audioPlaySpeech'), { player: playerLabel })}
      disabled={!audio.supported}
      aria-description={getCopy(audio.supported ? 'match.audioPlay' : 'match.audioUnsupported')}
      type="button"
      onClick={() => audio.play(item)}
    >
      <GameIcon name="play" size={14} />
      <span>{getCopy('match.audioPlay')}</span>
    </button>
  )
}

function VoteResult({
  item,
  seats,
}: {
  readonly item: TimelineItem
  readonly seats: readonly SeatView[]
}) {
  const selected = item.playerIds.at(-1)
  const selectedSeat = seats.find((seat) => seat.playerId === selected)
  return (
    <article
      className="aw-panel aw-feed-item aw-vote-result"
      data-sequence={item.sequence}
      data-selected-player={selectedSeat?.playerId}
    >
      <header>
        <GameIcon name="scales" size={24} />
        <div>
          <small>{getCopy('match.voteResult')}</small>
          <h3>{item.title}</h3>
        </div>
      </header>
      {item.detail ? (
        <div className="aw-vote-result__detail">
          {item.detail.split('\n').map((line) => (
            <VoteDetailLine key={line} line={line} />
          ))}
        </div>
      ) : null}
    </article>
  )
}

function VoteDetailLine({ line }: { readonly line: string }) {
  const separator = line.indexOf('：')
  if (separator < 0) return <span>{line}</span>
  return (
    <span>
      <strong>{line.slice(0, separator)}：</strong>
      <span>{line.slice(separator + 1)}</span>
    </span>
  )
}

function eventTone(kind: string): 'system' | 'night' | 'result' | 'warning' {
  if (
    kind === 'night.started' ||
    kind === 'night.attack-selected' ||
    kind === 'guard.protected' ||
    kind === 'witch.potion-used' ||
    kind === 'seer.inspected' ||
    kind === 'death.pending' ||
    kind === 'player.saved'
  ) {
    return 'night'
  }
  if (
    kind === 'public.announcement' ||
    kind === 'role.revealed' ||
    kind === 'sheriff.elected' ||
    kind === 'sheriff.transferred' ||
    kind === 'hunter.shot' ||
    kind === 'idiot.revealed' ||
    kind === 'match.ended'
  ) {
    return 'result'
  }
  if (kind === 'match.paused') return 'warning'
  return 'system'
}

function formatEventTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(value),
  )
}
