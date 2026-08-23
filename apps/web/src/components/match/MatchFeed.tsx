import {
  ArrowDown,
  CaretDown,
  ChatCenteredText,
  MoonStars,
  Play,
  Scales,
  SkipForward,
  Stop,
} from '@phosphor-icons/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { formatCopy, getCopy } from '@agentwolf/assets'
import type { MatchView, PlayerId, SeatView, TimelineItem } from '@agentwolf/contracts'

interface TimelineGroup {
  readonly key: string
  readonly label: string
  readonly items: readonly TimelineItem[]
}

export interface SpeechAudioControls {
  readonly supported: boolean
  readonly automaticSequence: number | null
  readonly automaticBusy: boolean
  readonly manualSequence: number | null
  readonly play: (item: TimelineItem) => void
  readonly stop: () => void
  readonly skip: () => void
}

export function MatchFeed({
  timeline,
  seats,
  activeSpeech,
  audio,
}: {
  readonly timeline: readonly TimelineItem[]
  readonly seats: readonly SeatView[]
  readonly activeSpeech: MatchView['activeSpeech']
  readonly audio: SpeechAudioControls
}) {
  const groups = useMemo(() => groupTimeline(timeline), [timeline])
  const latestKey = groups.at(-1)?.key ?? null
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(
    () => new Set(latestKey ? [latestKey] : []),
  )
  const scrollRef = useRef<HTMLDivElement>(null)
  const followingLatest = useRef(true)
  const [hasNewActivity, setHasNewActivity] = useState(false)
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
    if (!followingLatest.current) {
      setHasNewActivity(true)
      return undefined
    }
    const frame = window.requestAnimationFrame(() => {
      scroller.scrollTo({
        top: scroller.scrollHeight,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      })
      setHasNewActivity(false)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [lastSequence, liveLength])

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
    followingLatest.current = true
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' })
    setHasNewActivity(false)
  }

  return (
    <section className="aw-feed-shell" aria-label={getCopy('match.timeline')}>
      <h2 className="aw-visually-hidden">{getCopy('match.timeline')}</h2>
      <div
        className="aw-feed-scroll"
        ref={scrollRef}
        role="log"
        aria-live="polite"
        onScroll={(event) => {
          const element = event.currentTarget
          followingLatest.current =
            element.scrollHeight - element.scrollTop - element.clientHeight < 96
          if (followingLatest.current) setHasNewActivity(false)
        }}
      >
        {groups.length === 0 ? (
          <div className="aw-feed-empty">
            <ChatCenteredText size={30} aria-hidden />
            <p>{getCopy('match.eventEmpty')}</p>
          </div>
        ) : (
          groups.map((group) => {
            const open = openGroups.has(group.key)
            return (
              <section className="aw-day-group" data-open={open} key={group.key}>
                <button
                  className="aw-day-group__toggle"
                  aria-expanded={open}
                  aria-label={formatCopy(getCopy(open ? 'match.collapseDay' : 'match.expandDay'), {
                    day: group.label,
                  })}
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                >
                  <span>{group.label}</span>
                  <small>
                    {formatCopy(getCopy('match.eventCount'), { count: group.items.length })}
                  </small>
                  <CaretDown size={17} aria-hidden />
                </button>
                {open ? (
                  <div className="aw-day-group__items">
                    {group.items.map((item) => (
                      <FeedItem audio={audio} item={item} key={item.sequence} seats={seats} />
                    ))}
                  </div>
                ) : null}
              </section>
            )
          })
        )}
        {activeSpeech && !activeSpeech.final ? (
          <SpeechBubble
            live
            playerId={activeSpeech.playerId}
            seats={seats}
            text={activeSpeech.text}
          />
        ) : null}
      </div>
      {hasNewActivity ? (
        <button className="aw-feed-latest" type="button" onClick={returnToLatest}>
          <ArrowDown size={17} aria-hidden />
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

  const tone = eventTone(item.kind)
  return (
    <article
      className="aw-feed-item aw-system-event"
      data-sequence={item.sequence}
      data-tone={tone}
    >
      <span className="aw-system-event__icon" aria-hidden>
        {tone === 'night' ? <MoonStars size={19} /> : <ChatCenteredText size={19} />}
      </span>
      <div>
        <p>{item.title}</p>
        {item.detail ? <small>{item.detail}</small> : null}
      </div>
      <time dateTime={item.occurredAt}>{formatEventTime(item.occurredAt)}</time>
    </article>
  )
}

function SpeechBubble({
  playerId,
  seats,
  text,
  item,
  audio,
  live = false,
}: {
  readonly playerId: PlayerId
  readonly seats: readonly SeatView[]
  readonly text: string
  readonly item?: TimelineItem
  readonly audio?: SpeechAudioControls
  readonly live?: boolean
}) {
  const playerIndex = seats.findIndex((seat) => seat.playerId === playerId)
  const player = seats[playerIndex]
  if (!player) return null
  const side = playerIndex < Math.ceil(seats.length / 2) ? 'left' : 'right'
  const playerLabel = formatCopy(getCopy('narration.playerLabel'), {
    seat: player.seat,
    name: player.name,
  })
  const playback =
    item?.sequence === audio?.automaticSequence
      ? 'automatic'
      : item?.sequence === audio?.manualSequence
        ? 'manual'
        : 'idle'
  return (
    <article
      className="aw-feed-item aw-speech-bubble"
      data-live={live}
      data-playback={playback}
      data-sequence={item?.sequence}
      data-side={side}
    >
      <span className="aw-speech-bubble__avatar" aria-hidden>
        {Array.from(player.name)[0] ?? player.seat}
      </span>
      <div className="aw-speech-bubble__body">
        <header>
          <strong>{playerLabel}</strong>
          {live ? (
            <span>{getCopy('sessionStatuses.thinking')}</span>
          ) : item && audio ? (
            <SpeechAudioButton
              audio={audio}
              item={item}
              playback={playback}
              playerLabel={playerLabel}
            />
          ) : null}
        </header>
        <p>{text || getCopy('match.noSpeech')}</p>
        {live ? <span className="aw-stream-cursor" aria-hidden /> : null}
      </div>
    </article>
  )
}

function SpeechAudioButton({
  audio,
  item,
  playback,
  playerLabel,
}: {
  readonly audio: SpeechAudioControls
  readonly item: TimelineItem
  readonly playback: 'automatic' | 'manual' | 'idle'
  readonly playerLabel: string
}) {
  if (playback === 'automatic') {
    return (
      <button
        className="aw-speech-audio-control aw-speech-audio-control--skip"
        aria-label={formatCopy(getCopy('match.audioSkipSpeech'), { player: playerLabel })}
        type="button"
        onClick={() => audio.skip()}
      >
        <SkipForward size={15} aria-hidden />
        <span>{getCopy('match.audioSkip')}</span>
      </button>
    )
  }
  if (playback === 'manual') {
    return (
      <button
        className="aw-speech-audio-control"
        aria-label={formatCopy(getCopy('match.audioStopSpeech'), { player: playerLabel })}
        type="button"
        onClick={() => audio.stop()}
      >
        <Stop size={14} weight="fill" aria-hidden />
        <span>{getCopy('match.audioStop')}</span>
      </button>
    )
  }
  return (
    <button
      className="aw-speech-audio-control"
      aria-label={formatCopy(getCopy('match.audioPlaySpeech'), { player: playerLabel })}
      disabled={!audio.supported || audio.automaticBusy}
      title={getCopy(audio.supported ? 'match.audioPlay' : 'match.audioUnsupported')}
      type="button"
      onClick={() => audio.play(item)}
    >
      <Play size={14} weight="fill" aria-hidden />
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
      className="aw-feed-item aw-vote-result"
      data-sequence={item.sequence}
      data-selected-player={selectedSeat?.playerId}
    >
      <header>
        <Scales size={24} aria-hidden />
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

function groupTimeline(timeline: readonly TimelineItem[]): TimelineGroup[] {
  const groups: Array<{ key: string; label: string; items: TimelineItem[] }> = [
    { key: 'setup', label: getCopy('match.setupGroup'), items: [] },
  ]
  let cycle = 0
  let current = groups[0]!
  for (const item of timeline) {
    if (item.kind === 'night.started') {
      cycle += 1
      current = {
        key: `day-${cycle}`,
        label: formatCopy(getCopy('match.dayGroup'), { day: cycle }),
        items: [],
      }
      groups.push(current)
    } else if (item.kind === 'day.started' && cycle === 0) {
      cycle = 1
      current = {
        key: `day-${cycle}`,
        label: formatCopy(getCopy('match.dayGroup'), { day: cycle }),
        items: [],
      }
      groups.push(current)
    }
    current.items.push(item)
  }
  return groups.filter((group) => group.items.length > 0)
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
