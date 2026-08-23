import { MagnifyingGlass, Pulse } from '@phosphor-icons/react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { formatCopy, getCopy } from '@agentwolf/assets'
import type {
  TrajectoryOwnerId,
  TrajectoryPage,
  TrajectoryRecord,
  TrajectorySummary,
  TrajectoryTurn,
} from '@agentwolf/contracts'

type LedgerRow =
  | { readonly kind: 'turn'; readonly key: string; readonly turn: TrajectoryTurn }
  | { readonly kind: 'record'; readonly key: string; readonly record: TrajectoryRecord }

export function TrajectoryOverview({
  summary,
  selectedOwner,
  onSelect,
}: {
  readonly summary: TrajectorySummary
  readonly selectedOwner: TrajectoryOwnerId
  readonly onSelect: (owner: TrajectoryOwnerId) => void
}) {
  const turns = summary.turns.filter((turn) => turn.durationMs !== null)
  const starts = turns.map((turn) => Date.parse(turn.startedAt))
  const start = starts.length > 0 ? Math.min(...starts) : 0
  const end = Math.max(
    ...turns.map((turn) => Date.parse(turn.completedAt ?? turn.startedAt)),
    start + 1,
  )
  const width = 1000
  const laneHeight = 34
  return (
    <section className="aw-trajectory-overview aw-panel">
      <div className="aw-panel-heading">
        <h2>{getCopy('trajectory.overview')}</h2>
        <span>
          <Pulse size={16} aria-hidden /> {getCopy('trajectory.live')}
        </span>
      </div>
      <svg
        aria-label={getCopy('trajectory.overview')}
        role="img"
        viewBox={`0 0 ${width} ${Math.max(1, summary.owners.length) * laneHeight}`}
      >
        {summary.owners.map((owner, lane) => {
          const ownerTurns = turns.filter((turn) => turn.ownerId === owner.ownerId)
          return (
            <g
              data-selected={owner.ownerId === selectedOwner}
              key={owner.ownerId}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(owner.ownerId)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onSelect(owner.ownerId)
              }}
            >
              <text x="4" y={lane * laneHeight + 21}>
                {owner.label}
              </text>
              <line
                x1="148"
                x2={width - 4}
                y1={lane * laneHeight + 17}
                y2={lane * laneHeight + 17}
              />
              {ownerTurns.map((turn) => {
                const x =
                  148 + ((Date.parse(turn.startedAt) - start) / (end - start)) * (width - 160)
                const turnEnd = Date.parse(turn.completedAt ?? turn.startedAt)
                const span = Math.max(
                  4,
                  ((turnEnd - Date.parse(turn.startedAt)) / (end - start)) * (width - 160),
                )
                return (
                  <rect
                    data-status={turn.status}
                    key={turn.turnId}
                    x={x}
                    y={lane * laneHeight + 9}
                    width={span}
                    height="16"
                    rx="5"
                  />
                )
              })}
            </g>
          )
        })}
      </svg>
    </section>
  )
}

export function TrajectoryLedger({
  page,
  query,
  selectedId,
  onLoadOlder,
  onQuery,
  onSelect,
}: {
  readonly page: TrajectoryPage
  readonly query: string
  readonly selectedId: string | null
  readonly onLoadOlder: () => void
  readonly onQuery: (value: string) => void
  readonly onSelect: (value: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualRef = useRef<HTMLDivElement>(null)
  const followTail = useRef(true)
  const previousOwner = useRef<TrajectoryOwnerId | null>(null)
  const rows = useMemo(() => buildRows(page, query), [page, query])
  // oxlint-disable-next-line react/incompatible-library -- the maintained virtualizer owns scroll state outside React by design.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (rows[index]?.kind === 'turn' ? 54 : 46),
    getItemKey: (index) => rows[index]?.key ?? index,
    overscan: 8,
    useFlushSync: false,
  })
  const totalSize = virtualizer.getTotalSize()
  useLayoutEffect(() => {
    if (virtualRef.current) virtualRef.current.style.height = `${totalSize}px`
  }, [totalSize])
  useLayoutEffect(() => {
    const ownerChanged = previousOwner.current !== page.ownerId
    previousOwner.current = page.ownerId
    if (rows.length > 0 && (ownerChanged || followTail.current)) {
      virtualizer.scrollToIndex(rows.length - 1, { align: 'end' })
    }
  }, [page.ownerId, rows.length, virtualizer])
  return (
    <section className="aw-trajectory-ledger aw-panel">
      <div className="aw-trajectory-toolbar">
        <label>
          <MagnifyingGlass size={16} aria-hidden />
          <input
            className="aw-input"
            aria-label={getCopy('trajectory.search')}
            placeholder={getCopy('trajectory.search')}
            value={query}
            onChange={(event) => onQuery(event.target.value)}
          />
        </label>
        {page.nextBeforeTurn ? (
          <button className="aw-button" type="button" onClick={onLoadOlder}>
            {getCopy('trajectory.loadOlder')}
          </button>
        ) : null}
      </div>
      <div
        className="aw-trajectory-scroll"
        ref={scrollRef}
        onScroll={(event) => {
          const target = event.currentTarget
          followTail.current = target.scrollHeight - target.scrollTop - target.clientHeight < 80
        }}
      >
        <div className="aw-trajectory-virtual" ref={virtualRef}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index]
            if (!row) return null
            return (
              <div
                className="aw-trajectory-virtual-row"
                data-index={virtualRow.index}
                key={row.key}
                ref={(element) => {
                  virtualizer.measureElement(element)
                  if (element) element.style.transform = `translateY(${virtualRow.start}px)`
                }}
              >
                {row.kind === 'turn' ? (
                  <button
                    className="aw-trajectory-turn"
                    data-selected={selectedId === row.turn.turnId}
                    type="button"
                    onClick={() => onSelect(row.turn.turnId)}
                  >
                    <span>
                      {formatCopy(getCopy('trajectory.turnLabel'), {
                        index: row.turn.ordinal,
                        action: row.turn.actionType,
                      })}
                    </span>
                    <small>
                      {getCopy(`trajectory.statuses.${row.turn.status}`)} ·{' '}
                      {durationLabel(row.turn.durationMs)}
                    </small>
                  </button>
                ) : (
                  <button
                    className="aw-trajectory-record"
                    data-kind={row.record.kind}
                    data-status={row.record.status}
                    data-selected={selectedId === row.record.recordId}
                    type="button"
                    onClick={() => onSelect(row.record.recordId)}
                  >
                    <span>#{row.record.ordinal}</span>
                    <strong>{recordLabel(row.record)}</strong>
                    <small>{recordPreview(row.record)}</small>
                    <em>{durationLabel(row.record.durationMs)}</em>
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export function TrajectoryInspector({
  record,
  turn,
}: {
  readonly record: TrajectoryRecord | null
  readonly turn: TrajectoryTurn | null
}) {
  return (
    <aside className="aw-trajectory-inspector aw-panel">
      <h2>{getCopy('trajectory.detail')}</h2>
      {!record && !turn ? (
        <p>{getCopy('trajectory.selectRecord')}</p>
      ) : turn ? (
        <>
          <Detail
            label={getCopy('trajectory.status')}
            value={getCopy(`trajectory.statuses.${turn.status}`)}
          />
          <Detail label={getCopy('trajectory.duration')} value={durationLabel(turn.durationMs)} />
          <Detail
            label={getCopy('trajectory.sequence')}
            value={`${turn.fromSequence} → ${turn.toSequence}`}
          />
          <Detail label={getCopy('trajectory.attempt')} value={String(turn.attempt)} />
          <Detail
            label={getCopy('trajectory.session')}
            value={`#${turn.sessionGeneration} · ${turn.sessionId}`}
          />
          {turn.error ? <Block label={getCopy('trajectory.error')} value={turn.error} /> : null}
        </>
      ) : record ? (
        <>
          <Detail label={getCopy('trajectory.kind')} value={recordLabel(record)} />
          <Detail
            label={getCopy('trajectory.status')}
            value={record.status ?? getCopy('common.none')}
          />
          <Detail label={getCopy('trajectory.duration')} value={durationLabel(record.durationMs)} />
          {record.usage ? (
            <Detail
              label={getCopy('trajectory.usage')}
              value={`${record.usage.used} / ${record.usage.size}`}
            />
          ) : null}
          {record.text ? <Block label={getCopy('trajectory.text')} value={record.text} /> : null}
          {record.input ? <Block label={getCopy('trajectory.input')} value={record.input} /> : null}
          {record.output ? (
            <Block label={getCopy('trajectory.output')} value={record.output} />
          ) : null}
          {record.truncatedFields.length > 0 ? (
            <p className="aw-form-message">{getCopy('trajectory.truncated')}</p>
          ) : null}
        </>
      ) : null}
    </aside>
  )
}

function Detail({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="aw-trajectory-detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function Block({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <section className="aw-trajectory-detail-block">
      <h3>{label}</h3>
      <pre>{value}</pre>
    </section>
  )
}

function buildRows(page: TrajectoryPage, query: string): LedgerRow[] {
  const needle = query.trim().toLocaleLowerCase()
  return page.turns.flatMap((turn) => {
    const records = page.records.filter(
      (record) =>
        record.turnId === turn.turnId &&
        (!needle ||
          `${record.title} ${record.text ?? ''} ${record.input ?? ''} ${record.output ?? ''}`
            .toLocaleLowerCase()
            .includes(needle)),
    )
    if (needle && records.length === 0) return []
    return [
      { kind: 'turn' as const, key: `turn:${turn.turnId}`, turn },
      ...records.map((record) => ({ kind: 'record' as const, key: record.recordId, record })),
    ]
  })
}

function recordLabel(record: TrajectoryRecord): string {
  return getCopy(`trajectory.kinds.${record.kind}`)
}

function recordPreview(record: TrajectoryRecord): string {
  const value = record.text ?? record.input ?? record.output ?? record.title
  return value.replace(/\s+/g, ' ').slice(0, 96)
}

function durationLabel(durationMs: number | null): string {
  if (durationMs === null) return '—'
  return durationMs >= 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`
}
