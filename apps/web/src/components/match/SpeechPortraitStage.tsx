import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { characterPerformance, formatCopy, getCopy } from '@agentwolf/assets'
import type { PresentationOutput } from '@agent-arena/web-runtime'
import type { PlayerId, SeatView, SpeechId } from '@agentwolf/contracts'
import type { SpeechPlaybackController } from '../../hooks/useSpeechPlayback.js'
import { subtitleWidth } from '../../hooks/speech-subtitles.js'
import { CharacterPortrait, loadPortraitImages } from './CharacterPortrait.js'
import { SpeechAudioNotice } from './SpeechAudioNotice.js'

export function SpeechPortraitStage({
  playback,
  seats,
  blocked,
  motion,
  jumpRequest,
  children,
}: {
  readonly playback: SpeechPlaybackController
  readonly seats: readonly SeatView[]
  readonly blocked: boolean
  readonly motion: boolean
  readonly jumpRequest: number | undefined
  readonly children: (playbackBar: ReactNode) => ReactNode
}) {
  const [captionFrame, setCaptionFrame] = useState<{
    playbackId: string | null
    current: PresentationOutput<PlayerId, SpeechId> | null
    previous: string | null
  }>({ playbackId: null, current: null, previous: null })
  const [columns, setColumns] = useState(18)
  const [loaded, setImages] = useState<{ id: string; images: readonly HTMLImageElement[] } | null>(
    null,
  )
  const [dismissedPlayback, setDismissedPlayback] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const lastJump = useRef(jumpRequest)
  const activeOutput = !blocked && playback.mode !== 'idle' ? playback.output : null
  const current =
    blocked || playback.mode === 'idle'
      ? null
      : activeOutput?.status === 'playing'
        ? activeOutput
        : captionFrame.playbackId === playback.playbackId &&
            captionFrame.current?.key === playback.activeSpeechId
          ? captionFrame.current
          : null
  const announced = activeOutput ?? current
  const index = seats.findIndex((seat) => seat.playerId === announced?.actor)
  const seat = seats[index]
  const rig = characterPerformance(seat?.character)
  const wanted = rig ?? seats.map((item) => characterPerformance(item.character)).find(Boolean)
  const wantedId = wanted?.id
  const images = loaded?.id === rig?.id ? (loaded?.images ?? null) : null
  useEffect(() => {
    if (!wantedId) return undefined
    let subscribed = true
    void loadPortraitImages(wantedId).then(
      (resourceImages) => {
        if (subscribed) setImages({ id: wantedId, images: resourceImages })
        return undefined
      },
      () => {
        if (subscribed) setImages(null)
        return undefined
      },
    )
    return () => {
      subscribed = false
    }
  }, [wantedId])
  useLayoutEffect(() => {
    if (blocked || playback.mode === 'idle') setDismissedPlayback(null)
    setCaptionFrame((frame) => {
      if (blocked || playback.mode === 'idle')
        return frame.current ? { playbackId: null, current: null, previous: null } : frame
      const output = playback.output
      if (
        output?.status !== 'playing' ||
        (frame.current === output && frame.playbackId === playback.playbackId)
      )
        return frame
      const sameSpeaker =
        frame.playbackId === playback.playbackId &&
        frame.current?.key === output.key &&
        frame.current.actor === output.actor
      return {
        playbackId: playback.playbackId,
        current: output,
        previous: sameSpeaker
          ? frame.current!.text === output.text
            ? frame.previous
            : frame.current!.text
          : null,
      }
    })
  }, [blocked, playback.mode, playback.output, playback.playbackId])
  useEffect(() => {
    if (lastJump.current === jumpRequest) return
    lastJump.current = jumpRequest
    if (jumpRequest !== undefined) setDismissedPlayback(playback.playbackId)
  }, [jumpRequest, playback.playbackId])
  const hasArtwork = Boolean(rig && images && seat)
  const dismissed = dismissedPlayback === playback.playbackId
  const visible = Boolean(current && hasArtwork && !dismissed)
  const previousCaption =
    current &&
    captionFrame.playbackId === playback.playbackId &&
    captionFrame.current?.key === current.key &&
    captionFrame.current.actor === current.actor &&
    captionFrame.previous &&
    subtitleWidth(captionFrame.previous) <= columns &&
    subtitleWidth(current.text) <= columns
      ? captionFrame.previous
      : null
  const setCapacity = playback.setCaptionCapacity
  useEffect(() => {
    const element = root.current
    if (!element) return undefined
    const measure = () => {
      const width = element.clientWidth
      if (width <= 0) return
      const font = Math.max(17, Math.min(24, width * 0.026))
      const lineColumns = (width - (width < 420 ? 32 : 64)) / font
      setColumns(Math.floor(lineColumns))
      setCapacity(Math.min(24, Math.floor(lineColumns * 1.8)))
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()
    return () => observer.disconnect()
  }, [setCapacity])
  const playingLabel = seat
    ? formatCopy(getCopy('match.playingSpeaker'), { seat: seat.seat, player: seat.name })
    : getCopy('match.playingSpeech')
  const playbackBar = announced ? (
    <section className="aw-speech-playback-bar" aria-label={getCopy('match.playbackBanner')}>
      <p className="aw-speech-playback-bar__label" title={playingLabel}>
        {playingLabel}
      </p>
      <div className="aw-speech-playback-bar__actions">
        {hasArtwork ? (
          <button
            type="button"
            className="aw-button aw-button--compact"
            onClick={() => setDismissedPlayback(dismissed ? null : playback.playbackId)}
          >
            {getCopy(dismissed ? 'match.portraitShow' : 'match.portraitClose')}
          </button>
        ) : null}
        <button
          type="button"
          className="aw-button aw-button--compact"
          onClick={() =>
            playback.mode === 'manual'
              ? playback.stopManual()
              : playback.skipAutomatic(announced.key)
          }
        >
          {getCopy('match.portraitSkip')}
        </button>
      </div>
    </section>
  ) : null
  return (
    <div ref={root} className="aw-speech-stage-content" data-portrait-visible={visible}>
      {children(playbackBar)}
      <div className="aw-speech-portrait-host">
        {visible && current && seat && rig && images ? (
          <section
            className="aw-speech-portrait-stage"
            aria-label={getCopy('match.portraitStage')}
            data-player-id={seat.playerId}
            data-side={index < Math.ceil(seats.length / 2) ? 'left' : 'right'}
          >
            <CharacterPortrait
              key={playback.playbackId}
              rig={rig}
              images={images}
              side={index < Math.ceil(seats.length / 2) ? 'left' : 'right'}
              motion={motion}
              readLevel={playback.readLevel}
            />
            <div className="aw-speech-subtitles">
              <div className="aw-speech-subtitles__speaker">
                <span>{formatCopy(getCopy('match.portraitSeat'), { seat: seat.seat })}</span>
                <strong>{seat.name}</strong>
                {seat.character?.name !== seat.name ? <small>{seat.character?.name}</small> : null}
              </div>
              <p className="aw-speech-subtitles__text" aria-live="off">
                {previousCaption ? (
                  <span className="aw-speech-subtitles__previous">{previousCaption}</span>
                ) : null}
                <span className="aw-speech-subtitles__current">{current.text}</span>
              </p>
              {playback.noticeSpeechId === current.key ? (
                <SpeechAudioNotice
                  title={playback.noticeTitle}
                  message={playback.notice}
                  kind={playback.noticeKind}
                />
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
