import { useEffect, useState } from 'react'
import { formatCopy, getCopy } from '@agentwolf/assets'
import { useSpeechAudioStatus } from '../hooks/useSpeechAudioStatus.js'
import { useSpeechNoticeLayout } from '../hooks/useSpeechNoticeLayout.js'
import { GameIcon } from './GameIcon.js'

export function SpeechPreparationNotice() {
  const { status, disconnected } = useSpeechAudioStatus()
  const [dismissed, setDismissed] = useState(false)
  const [announceReady, setAnnounceReady] = useState(false)
  useEffect(() => {
    if (status?.progress?.stage === 'downloading') {
      setDismissed(false)
      setAnnounceReady(true)
    }
  }, [status?.progress?.stage])
  const ready = status?.state === 'ready' && !disconnected
  const progress = status?.progress
  const stage = disconnected
    ? 'disconnected'
    : status?.state === 'error'
      ? 'error'
      : ready
        ? 'ready'
        : (progress?.stage ?? 'dependencies')
  const visible =
    Boolean(status || disconnected) &&
    !(ready && (dismissed || !announceReady)) &&
    !(status?.state === 'loading' && !disconnected) &&
    stage !== 'loading' &&
    !(status?.state === 'disabled' && !disconnected)
  const { panel: panelRef, minimized, dragging, toggle, handle } = useSpeechNoticeLayout(visible)
  if (!visible) return null
  const title = getCopy(
    minimized ? `speechPreparation.compact.${stage}` : `speechPreparation.${stage}`,
  )
  const downloading = stage === 'downloading'
  const percent =
    progress && progress.totalBytes > 0
      ? Math.floor((progress.downloadedBytes * 100) / progress.totalBytes)
      : null
  return (
    <aside
      className="aw-speech-preparation"
      data-state={stage}
      data-minimized={minimized}
      data-dragging={dragging}
      ref={panelRef}
      aria-label={getCopy('speechPreparation.title')}
    >
      <div className="aw-speech-preparation__heading">
        <div
          className="aw-speech-preparation__drag"
          role="button"
          tabIndex={0}
          aria-label={getCopy('speechPreparation.move')}
          {...handle}
        >
          <GameIcon name="grip" size={16} />
          <strong role="status">{title}</strong>
          {minimized && downloading && percent !== null ? <span>{percent}%</span> : null}
        </div>
        <button
          className="aw-button aw-button--compact"
          type="button"
          aria-label={getCopy(
            minimized ? 'speechPreparation.restore' : 'speechPreparation.minimize',
          )}
          aria-expanded={!minimized}
          onClick={toggle}
        >
          {getCopy(minimized ? 'speechPreparation.expand' : 'speechPreparation.collapse')}
        </button>
        {ready ? (
          <button
            className="aw-button aw-button--compact"
            type="button"
            onClick={() => setDismissed(true)}
          >
            {getCopy('speechPreparation.dismiss')}
          </button>
        ) : null}
      </div>
      {downloading && percent !== null ? (
        <>
          <progress
            aria-label={getCopy('speechPreparation.downloadProgress')}
            max={progress!.totalBytes}
            value={progress!.downloadedBytes}
          />
          {!minimized ? (
            <div className="aw-speech-preparation__bytes">
              <span>
                {formatCopy(getCopy('speechPreparation.bytes'), {
                  downloaded: (progress!.downloadedBytes / 1_000_000_000).toFixed(2),
                  total: (progress!.totalBytes / 1_000_000_000).toFixed(2),
                })}
              </span>
              <strong>{percent}%</strong>
            </div>
          ) : null}
        </>
      ) : null}
      {!minimized ? (
        <p>
          {getCopy(
            disconnected
              ? 'speechPreparation.reconnectHint'
              : ready
                ? 'speechPreparation.readyHint'
                : stage === 'error'
                  ? 'speechPreparation.errorHint'
                  : 'speechPreparation.preparingHint',
          )}
        </p>
      ) : null}
    </aside>
  )
}
