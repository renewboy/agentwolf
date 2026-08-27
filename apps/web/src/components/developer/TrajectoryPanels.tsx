import { CaretDown, CaretRight, MagnifyingGlass } from '@phosphor-icons/react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { formatCopy, getCopy } from '@agentwolf/assets'
import type {
  TrajectoryOwnerId,
  TrajectoryPage,
  TrajectoryRecord,
  TrajectoryRecordKind,
  TrajectoryTimelineGroup,
  TrajectoryTurn,
} from '@agentwolf/contracts'
import { timelineGroupId, timelineGroupLabel } from './trajectory-timeline.js'

type LedgerRow =
  | {
      readonly kind: 'group'
      readonly key: string
      readonly groupId: string
      readonly timelineGroup: TrajectoryTimelineGroup
      readonly recordCount: number
    }
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
  const detachedByUser = useRef(false)
  const centeredSelection = useRef<string | null>(null)
  const previousOwner = useRef<TrajectoryOwnerId | null>(null)
  const scrollByOwner = useRef(new Map<TrajectoryOwnerId, number>())
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(new Set())
  const selectedRecord = page.records.find((record) => record.recordId === selectedId)
  const selectedTurn = selectedRecord
    ? page.turns.find((turn) => turn.turnId === selectedRecord.turnId)
    : null
  const selectedGroupId = selectedTurn ? timelineGroupId(selectedTurn.timelineGroup) : null
  const rows = useMemo(
    () => buildRows(page, query, collapsedGroups, selectedGroupId),
    [collapsedGroups, page, query, selectedGroupId],
  )
  const groupIds = useMemo(
    () => [...new Set(page.turns.map((turn) => timelineGroupId(turn.timelineGroup)))],
    [page.turns],
  )
  const allCollapsed =
    groupIds.length > 0 && groupIds.every((groupId) => collapsedGroups.has(groupId))
  // oxlint-disable-next-line react/incompatible-library -- the maintained virtualizer owns scroll state outside React by design.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (rows[index]?.kind === 'group' ? 42 : 38),
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
    if (!selectedId) {
      centeredSelection.current = null
      return
    }
    if (centeredSelection.current === selectedId) return
    const index = rows.findIndex((row) => row.key === selectedId)
    if (index < 0) return
    centeredSelection.current = selectedId
    virtualizer.scrollToIndex(index, { align: 'center' })
  }, [rows, selectedId, virtualizer])
  const stopFollowingTail = (): void => {
    detachedByUser.current = true
    followTail.current = false
  }
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
            onClick={() => setCollapsedGroups(allCollapsed ? new Set() : new Set(groupIds))}
          >
            {getCopy(allCollapsed ? 'trajectory.expandTurns' : 'trajectory.collapseTurns')}
          </button>
        </div>
      </div>
      <div
        className="aw-trajectory-scroll"
        ref={scrollRef}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp' || event.key === 'PageUp' || event.key === 'Home') {
            stopFollowingTail()
          }
        }}
        onPointerDown={stopFollowingTail}
        onScroll={(event) => {
          const target = event.currentTarget
          scrollByOwner.current.set(page.ownerId, target.scrollTop)
          const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight
          if (detachedByUser.current) {
            const returnedToBottom = distanceFromBottom <= 1
            detachedByUser.current = !returnedToBottom
            followTail.current = returnedToBottom
          } else {
            followTail.current = distanceFromBottom < 80
          }
        }}
        onWheel={(event) => {
          if (event.deltaY < 0) stopFollowingTail()
        }}
      >
        <div className="aw-trajectory-virtual" ref={virtualRef}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index]
            if (!row) return null
            const groupIsCollapsed =
              row.kind === 'group' &&
              collapsedGroups.has(row.groupId) &&
              selectedGroupId !== row.groupId
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
                {row.kind === 'group' ? (
                  <button
                    className="aw-trajectory-group"
                    aria-expanded={!groupIsCollapsed}
                    data-collapsed={groupIsCollapsed}
                    type="button"
                    onClick={() => {
                      setCollapsedGroups((current) => {
                        const next = new Set(current)
                        if (next.has(row.groupId)) next.delete(row.groupId)
                        else next.add(row.groupId)
                        return next
                      })
                    }}
                  >
                    <span className="aw-trajectory-group__caret">
                      {groupIsCollapsed ? (
                        <CaretRight size={15} aria-hidden />
                      ) : (
                        <CaretDown size={15} aria-hidden />
                      )}
                    </span>
                    <strong>{timelineGroupLabel(row.timelineGroup)}</strong>
                    <small className="aw-trajectory-group__count">
                      {formatCopy(getCopy('trajectory.groupRecords'), {
                        count: row.recordCount,
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
                    <time
                      dateTime={row.record.startedAt}
                      title={timestampLabel(row.record.startedAt, true)}
                    >
                      {timestampLabel(row.record.startedAt, false)}
                    </time>
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
    <div className="aw-trajectory-record-detail">
      {!record && !turn ? (
        <p>{getCopy('trajectory.selectRecord')}</p>
      ) : turn ? (
        <>
          <div className="aw-trajectory-inspector-head">
            <strong>{formatCopy(getCopy('trajectory.callLabel'), { index: turn.ordinal })}</strong>
            <span>{actionLabel(turn.actionType)}</span>
          </div>
          <Detail
            label={getCopy('trajectory.status')}
            value={getCopy(`trajectory.statuses.${turn.status}`)}
          />
          <Detail label={getCopy('trajectory.time')} value={timestampLabel(turn.startedAt, true)} />
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
          <Detail
            label={getCopy('trajectory.time')}
            value={timestampLabel(record.startedAt, true)}
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
    </div>
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
  collapsedGroups: ReadonlySet<string>,
  selectedGroupId: string | null,
): LedgerRow[] {
  const needle = query.trim().toLocaleLowerCase()
  const groups = new Map<
    string,
    { readonly timelineGroup: TrajectoryTimelineGroup; readonly turnIds: Set<string> }
  >()
  for (const turn of [...page.turns].sort((left, right) => left.ordinal - right.ordinal)) {
    const groupId = timelineGroupId(turn.timelineGroup)
    const current = groups.get(groupId) ?? {
      timelineGroup: turn.timelineGroup,
      turnIds: new Set<string>(),
    }
    current.turnIds.add(turn.turnId)
    groups.set(groupId, current)
  }
  return [...groups].flatMap(([groupId, group]) => {
    const groupRecords = page.records.filter((record) => group.turnIds.has(record.turnId))
    const records = groupRecords.filter(
      (record) =>
        !needle ||
        `${record.title} ${record.text ?? ''} ${record.input ?? ''} ${record.output ?? ''}`
          .toLocaleLowerCase()
          .includes(needle),
    )
    if (needle && records.length === 0) return []
    const visibleRecords =
      !needle && collapsedGroups.has(groupId) && selectedGroupId !== groupId ? [] : records
    return [
      {
        kind: 'group' as const,
        key: `group:${groupId}`,
        groupId,
        timelineGroup: group.timelineGroup,
        recordCount: groupRecords.length,
      },
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

function timestampLabel(value: string, includeDate: boolean): string {
  const timestamp = new Date(value)
  const time = `${twoDigits(timestamp.getHours())}:${twoDigits(timestamp.getMinutes())}:${twoDigits(
    timestamp.getSeconds(),
  )}.${String(timestamp.getMilliseconds()).padStart(3, '0')}`
  if (!includeDate) return time
  return `${timestamp.getFullYear()}-${twoDigits(timestamp.getMonth() + 1)}-${twoDigits(
    timestamp.getDate(),
  )} ${time}`
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0')
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
    case 'postgame-review':
      return getCopy('trajectory.actionTypes.postgameReview')
    case 'postgame-reflection':
      return getCopy('trajectory.actionTypes.postgameReflection')
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
