import { getCopy } from '@agentwolf/assets'
import type { TrajectoryPage, TrajectoryRecordKind } from '@agentwolf/contracts'
import { recordLabel } from './trajectory-timeline.js'

type MinimapLane = 'context' | 'model' | 'tools' | 'runtime'

const minimapLanes: readonly MinimapLane[] = ['context', 'model', 'tools', 'runtime']

export function TrajectoryMinimap({
  page,
  selectedId,
  onSelect,
}: {
  readonly page: TrajectoryPage
  readonly selectedId: string | null
  readonly onSelect: (recordId: string) => void
}) {
  const records = [...page.records].sort((left, right) => left.ordinal - right.ordinal)
  return (
    <section className="aw-trajectory-minimap" aria-label={getCopy('trajectory.minimap')}>
      <h2 className="aw-visually-hidden">{getCopy('trajectory.minimap')}</h2>
      {minimapLanes.map((lane) => (
        <div className="aw-trajectory-minimap__lane" key={lane}>
          <span>{getCopy(`trajectory.minimapLanes.${lane}`)}</span>
          <div className="aw-trajectory-minimap__track">
            {records.map((record) =>
              minimapLane(record.kind) === lane ? (
                <button
                  className="aw-trajectory-minimap__node"
                  aria-label={`#${record.ordinal} ${recordLabel(record)}`}
                  data-kind={record.kind}
                  data-selected={record.recordId === selectedId}
                  data-status={record.status}
                  key={record.recordId}
                  type="button"
                  onClick={() => onSelect(record.recordId)}
                />
              ) : (
                <span className="aw-trajectory-minimap__gap" key={record.recordId} />
              ),
            )}
          </div>
        </div>
      ))}
    </section>
  )
}

function minimapLane(kind: TrajectoryRecordKind): MinimapLane {
  switch (kind) {
    case 'instructions':
    case 'prompt':
      return 'context'
    case 'reasoning':
    case 'message':
    case 'usage':
      return 'model'
    case 'tool':
    case 'permission':
    case 'action':
      return 'tools'
    case 'diagnostic':
    case 'lifecycle':
    case 'error':
      return 'runtime'
    default: {
      const exhaustive: never = kind
      return exhaustive
    }
  }
}
