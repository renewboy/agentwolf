import { CaretDown, CaretRight, MagnifyingGlass } from '@phosphor-icons/react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { formatCopy, getCopy } from '@agentwolf/assets'
import type {
  TrajectoryOwnerId,
  TrajectoryPage,
  TrajectoryRecord,
  TrajectoryRecordKind,
  TrajectoryTurn,
} from '@agentwolf/contracts'

type LedgerRow =
  | { readonly kind: 'turn'; readonly key: string; readonly turn: TrajectoryTurn }
  | { readonly kind: 'record'; readonly key: string; readonly record: TrajectoryRecord }

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
                  title={`#${record.ordinal} ${recordLabel(record)}`}
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

export function TrajectoryLedger({
  page,
  query,
  selectedId,
  onLoadOlder,
  onQuery,
  onSelect,
  followLatest,
  loading,
}: {
  readonly page: TrajectoryPage
  readonly query: string
  readonly selectedId: string | null
  readonly onLoadOlder: () => void
  readonly onQuery: (value: string) => void
  readonly onSelect: (value: string) => void
  readonly followLatest: boolean
  readonly loading: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualRef = useRef<HTMLDivElement>(null)
  const followTail = useRef(followLatest)
  const previousOwner = useRef<TrajectoryOwnerId | null>(null)
  const scrollByOwner = useRef(new Map<TrajectoryOwnerId, number>())
  const [collapsedTurns, setCollapsedTurns] = useState<ReadonlySet<string>>(new Set())
  const selectedTurnId =
    page.records.find((record) => record.recordId === selectedId)?.turnId ?? null
  const rows = useMemo(
    () => buildRows(page, query, collapsedTurns, selectedTurnId),
    [collapsedTurns, page, query, selectedTurnId],
  )
  const allCollapsed =
    page.turns.length > 0 && page.turns.every((turn) => collapsedTurns.has(turn.turnId))
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
    if (rows.length > 0 && ownerChanged) {
      const savedPosition = scrollByOwner.current.get(page.ownerId)
      if (savedPosition !== undefined && scrollRef.current) {
        scrollRef.current.scrollTop = savedPosition
      } else {
        virtualizer.scrollToIndex(followLatest ? rows.length - 1 : 0, {
          align: followLatest ? 'end' : 'start',
        })
      }
    } else if (rows.length > 0 && followLatest && followTail.current) {
      virtualizer.scrollToIndex(rows.length - 1, { align: 'end' })
    }
  }, [followLatest, page.ownerId, rows.length, virtualizer])
  useLayoutEffect(() => {
    if (!selectedId) return
    const index = rows.findIndex((row) => row.key === selectedId)
    if (index >= 0) virtualizer.scrollToIndex(index, { align: 'center' })
  }, [rows, selectedId, virtualizer])
  return (
    <section className="aw-trajectory-ledger" aria-busy={loading} data-loading={loading}>
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
        <div className="aw-trajectory-toolbar__actions">
          {page.nextBeforeTurn ? (
            <button className="aw-button" type="button" onClick={onLoadOlder}>
              {getCopy('trajectory.loadOlder')}
            </button>
          ) : null}
          <button
            className="aw-button"
            type="button"
            onClick={() =>
              setCollapsedTurns(
                allCollapsed ? new Set() : new Set(page.turns.map((turn) => turn.turnId)),
              )
            }
          >
            {getCopy(allCollapsed ? 'trajectory.expandTurns' : 'trajectory.collapseTurns')}
          </button>
        </div>
      </div>
      <div
        className="aw-trajectory-scroll"
        ref={scrollRef}
        onScroll={(event) => {
          const target = event.currentTarget
          scrollByOwner.current.set(page.ownerId, target.scrollTop)
          followTail.current = target.scrollHeight - target.scrollTop - target.clientHeight < 80
        }}
      >
        <div className="aw-trajectory-virtual" ref={virtualRef}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index]
            if (!row) return null
            const turnIsCollapsed =
              row.kind === 'turn' &&
              collapsedTurns.has(row.turn.turnId) &&
              selectedTurnId !== row.turn.turnId
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
                    aria-expanded={!turnIsCollapsed}
                    data-collapsed={turnIsCollapsed}
                    data-selected={selectedId === row.turn.turnId}
                    type="button"
                    onClick={() => {
                      setCollapsedTurns((current) => {
                        const next = new Set(current)
                        if (next.has(row.turn.turnId)) next.delete(row.turn.turnId)
                        else next.add(row.turn.turnId)
                        return next
                      })
                      onSelect(row.turn.turnId)
                    }}
                  >
                    <span className="aw-trajectory-turn__caret">
                      {turnIsCollapsed ? (
                        <CaretRight size={15} aria-hidden />
                      ) : (
                        <CaretDown size={15} aria-hidden />
                      )}
                    </span>
                    <span className="aw-trajectory-turn__title">
                      <strong>
                        {formatCopy(getCopy('trajectory.turnLabel'), {
                          index: row.turn.ordinal,
                        })}
                      </strong>
                      <small>{actionLabel(row.turn.actionType)}</small>
                    </span>
                    <small className="aw-trajectory-turn__count">
                      {formatCopy(getCopy('trajectory.turnRecords'), {
                        count: page.records.filter((record) => record.turnId === row.turn.turnId)
                          .length,
                      })}
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
                    <span
                      className="aw-trajectory-kind-tag"
                      data-kind={row.record.kind}
                      data-status={row.record.status}
                    >
                      {recordLabel(row.record)}
                    </span>
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
    <aside className="aw-trajectory-inspector">
      <h2>{getCopy('trajectory.detail')}</h2>
      {!record && !turn ? (
        <p>{getCopy('trajectory.selectRecord')}</p>
      ) : turn ? (
        <>
          <div className="aw-trajectory-inspector-head">
            <strong>{formatCopy(getCopy('trajectory.turnLabel'), { index: turn.ordinal })}</strong>
            <span>{actionLabel(turn.actionType)}</span>
          </div>
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
          <div className="aw-trajectory-inspector-head">
            <span
              className="aw-trajectory-kind-tag"
              data-kind={record.kind}
              data-status={record.status}
            >
              {recordLabel(record)}
            </span>
            <strong>#{record.ordinal}</strong>
          </div>
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

function buildRows(
  page: TrajectoryPage,
  query: string,
  collapsedTurns: ReadonlySet<string>,
  selectedTurnId: string | null,
): LedgerRow[] {
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
    const visibleRecords =
      !needle && collapsedTurns.has(turn.turnId) && selectedTurnId !== turn.turnId ? [] : records
    return [
      { kind: 'turn' as const, key: `turn:${turn.turnId}`, turn },
      ...visibleRecords.map((record) => ({
        kind: 'record' as const,
        key: record.recordId,
        record,
      })),
    ]
  })
}

function recordLabel(record: TrajectoryRecord): string {
  return getCopy(`trajectory.kinds.${record.kind}`)
}

function recordPreview(record: TrajectoryRecord): string {
  let value: string
  if (record.kind === 'tool') {
    value = record.title.replace(/^Tool:\s*/u, '')
  } else if (record.kind === 'permission') {
    value = `${record.title} · ${getCopy(
      record.status === 'allowed' ? 'trajectory.permissionAllowed' : 'trajectory.permissionDenied',
    )}`
  } else if (record.kind === 'usage' && record.usage) {
    value = `${record.usage.used} / ${record.usage.size}`
  } else if (record.kind === 'action') {
    const actionType = actionTypeFromRecord(record.input)
    value = actionType
      ? formatCopy(getCopy('trajectory.actionSubmitted'), { action: actionLabel(actionType) })
      : record.title
  } else if (record.kind === 'lifecycle') {
    value = record.title.replaceAll('_', ' ')
  } else {
    value = record.text ?? record.input ?? record.output ?? record.title
  }
  return value.replace(/\s+/g, ' ').slice(0, 96)
}

function actionTypeFromRecord(input: string | null): string | null {
  if (!input) return null
  try {
    const parsed = JSON.parse(input) as unknown
    if (typeof parsed !== 'object' || parsed === null) return null
    const value = parsed as Record<string, unknown>
    const nested = value['action']
    if (typeof nested === 'object' && nested !== null) {
      const nestedType = (nested as Record<string, unknown>)['type']
      if (typeof nestedType === 'string') return nestedType
    }
    return typeof value['type'] === 'string' ? value['type'] : null
  } catch {
    return null
  }
}

function durationLabel(durationMs: number | null): string {
  if (durationMs === null) return '-'
  return durationMs >= 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`
}

function actionLabel(actionType: string): string {
  switch (actionType) {
    case 'bootstrap':
      return getCopy('trajectory.actionTypes.bootstrap')
    case 'speech':
      return getCopy('trajectory.actionTypes.speech')
    case 'vote':
      return getCopy('trajectory.actionTypes.vote')
    case 'night-action':
      return getCopy('trajectory.actionTypes.nightAction')
    case 'sheriff-action':
      return getCopy('trajectory.actionTypes.sheriffAction')
    case 'skill-trigger':
      return getCopy('trajectory.actionTypes.skillTrigger')
    case 'domain-events':
      return getCopy('trajectory.actionTypes.domainEvents')
    default:
      return actionType
  }
}

function minimapLane(kind: TrajectoryRecordKind): MinimapLane {
  switch (kind) {
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
