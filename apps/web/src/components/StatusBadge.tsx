import { getCopy } from '@agentwolf/assets'
import type { MatchView } from '@agentwolf/contracts'

export function StatusBadge({
  status,
  variant = 'badge',
}: {
  readonly status: MatchView['status']
  readonly variant?: 'badge' | 'plain'
}) {
  return (
    <span
      className={`aw-status aw-status--${status}${variant === 'plain' ? ' aw-status--plain' : ''}`}
    >
      {getCopy(`statuses.${status}`)}
    </span>
  )
}
