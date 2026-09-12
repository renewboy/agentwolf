import type { ReactNode } from 'react'
import { GameIcon } from '../GameIcon.js'
import { getCopy } from '@agentwolf/assets'

export function MatchRecoveryPanel({
  busy,
  error,
  reason,
  onResume,
  playbackBar,
}: {
  readonly busy: boolean
  readonly error: string | null
  readonly reason: string | null
  readonly onResume: () => void
  readonly playbackBar?: ReactNode
}) {
  return (
    <section className="aw-panel aw-match-recovery" aria-label={getCopy('match.paused')}>
      {playbackBar}
      <div className="aw-match-recovery__heading">
        <GameIcon name="pause" size={20} />
        <div>
          <strong>{getCopy('match.paused')}</strong>
          <p>{getCopy('tableDesign.pauseHint')}</p>
        </div>
        <button
          className="aw-button aw-button--primary aw-button--compact"
          disabled={busy}
          type="button"
          onClick={onResume}
        >
          <GameIcon name="refresh" className={busy ? 'aw-spin' : undefined} size={17} />
          {getCopy(busy ? 'match.resuming' : 'match.resume')}
        </button>
      </div>
      {error ? (
        <p className="aw-match-recovery__error" role="alert">
          {getCopy('tableDesign.actionFailed')}
        </p>
      ) : null}
      <details className="aw-match-recovery__details">
        <summary>{getCopy('tableDesign.pauseDetails')}</summary>
        {reason ? <pre>{reason}</pre> : null}
        {error ? <pre>{error}</pre> : null}
      </details>
    </section>
  )
}
