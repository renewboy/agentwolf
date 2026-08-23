import { getCopy } from '@agentwolf/assets'
import type { MatchView } from '@agentwolf/contracts'

export function StatusBadge({ status }: { readonly status: MatchView['status'] }) {
  return <span className={`aw-status aw-status--${status}`}>{getCopy(`statuses.${status}`)}</span>
}
