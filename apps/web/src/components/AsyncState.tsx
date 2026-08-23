import { WarningCircle } from '@phosphor-icons/react'
import { getCopy } from '@agentwolf/assets'

export function LoadingState() {
  return (
    <div className="aw-loading" role="status">
      <div className="aw-skeleton aw-loading__line" />
      <div className="aw-skeleton aw-loading__panel" />
      <span className="aw-visually-hidden">{getCopy('common.loading')}</span>
    </div>
  )
}

export function ErrorState({
  message,
  retry,
}: {
  readonly message: string
  readonly retry: () => void
}) {
  return (
    <div className="aw-empty-state aw-panel" role="alert">
      <WarningCircle size={34} aria-hidden />
      <strong>{getCopy('common.requestFailed')}</strong>
      <p>{message}</p>
      <button className="aw-button" type="button" onClick={retry}>
        {getCopy('common.retry')}
      </button>
    </div>
  )
}
