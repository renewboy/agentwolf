import { ArrowLeft, ArrowsLeftRight } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatCopy, getCopy } from '@agentwolf/assets'
import {
  MatchIdSchema,
  TrajectoryDeltaSchema,
  type MatchView,
  type TrajectoryOwnerId,
  type TrajectoryAuditReport,
  type TrajectoryPage,
  type TrajectorySummary,
} from '@agentwolf/contracts'
import { api } from '../api.js'
import { ErrorState, LoadingState } from '../components/AsyncState.js'
import { RoleBadge } from '../components/RoleBadge.js'
import {
  TrajectoryInspector,
  TrajectoryLedger,
  TrajectoryMinimap,
} from '../components/developer/TrajectoryPanels.js'
import { useRuntimeConfig } from '../hooks/useRuntimeConfig.js'

export function DeveloperPage() {
  const { matchId: matchIdParam } = useParams<{ matchId: string }>()
  const parsedMatchId = useMemo(() => MatchIdSchema.safeParse(matchIdParam), [matchIdParam])
  const matchId = parsedMatchId.success ? parsedMatchId.data : null
  const { developerMode } = useRuntimeConfig()
  const [match, setMatch] = useState<MatchView | null>(null)
  const [summary, setSummary] = useState<TrajectorySummary | null>(null)
  const [audit, setAudit] = useState<TrajectoryAuditReport | null>(null)
  const [ownerId, setOwnerId] = useState<TrajectoryOwnerId>('system')
  const [page, setPage] = useState<TrajectoryPage | null>(null)
  const [pageLoading, setPageLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const revision = useRef(0)
  const summaryLoaded = summary !== null
  const owners = useMemo(() => orderedOwners(summary?.owners ?? []), [summary])

  const loadTrajectory = useCallback(async () => {
    if (!matchId) {
      setError(getCopy('trajectory.unavailable'))
      return
    }
    setError(null)
    setMatch(null)
    setSummary(null)
    setAudit(null)
    setPage(null)
    setPageLoading(true)
    setSelectedId(null)
    try {
      const [nextMatch, nextSummary, nextAudit] = await Promise.all([
        api.getMatch(matchId, { kind: 'god' }),
        api.trajectorySummary(matchId),
        api.trajectoryAudit(matchId),
      ])
      revision.current = nextSummary.revision
      setMatch(nextMatch)
      setSummary(nextSummary)
      setAudit(nextAudit)
      const firstPlayer = nextSummary.owners.find(
        (owner) => owner.ownerId !== 'system' && owner.turnCount > 0,
      )
      const firstActive = firstPlayer ?? nextSummary.owners.find((owner) => owner.turnCount > 0)
      setOwnerId(firstActive?.ownerId ?? nextSummary.owners[0]?.ownerId ?? 'system')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPageLoading(false)
    }
  }, [matchId])

  useEffect(() => void loadTrajectory(), [loadTrajectory])

  useEffect(() => {
    if (!matchId || !summaryLoaded) return undefined
    let active = true
    setPageLoading(true)
    setSelectedId(null)
    const load = async (): Promise<void> => {
      try {
        const next = await api.trajectoryPage(matchId, ownerId)
        if (!active) return
        revision.current = Math.max(revision.current, next.revision)
        setPage(next)
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        if (active) setPageLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [matchId, ownerId, summaryLoaded])

  useEffect(() => {
    if (!matchId || !summaryLoaded) return undefined
    let closed = false
    let socket: WebSocket | null = null
    let reconnect: number | null = null
    const connect = (): void => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      socket = new WebSocket(
        `${protocol}//${window.location.host}/api/developer/matches/${matchId}/trajectory/live?afterRevision=${revision.current}`,
      )
      socket.addEventListener('message', (event) => {
        const delta = TrajectoryDeltaSchema.parse(JSON.parse(String(event.data)))
        revision.current = Math.max(revision.current, delta.revision)
        setSummary((current) =>
          current
            ? {
                ...current,
                revision: delta.revision,
                turns: mergeBy(current.turns, delta.turns, (turn) => turn.turnId),
              }
            : current,
        )
        setPage((current) => {
          if (!current) return current
          const turns = delta.turns.filter((turn) => turn.ownerId === current.ownerId)
          const records = delta.records.filter((record) => record.ownerId === current.ownerId)
          return {
            ...current,
            revision: delta.revision,
            turns: mergeBy(current.turns, turns, (turn) => turn.turnId),
            records: mergeBy(current.records, records, (record) => record.recordId),
          }
        })
      })
      socket.addEventListener('close', () => {
        if (!closed) reconnect = window.setTimeout(connect, 700)
      })
    }
    connect()
    return () => {
      closed = true
      if (reconnect !== null) window.clearTimeout(reconnect)
      socket?.close()
    }
  }, [matchId, summaryLoaded])

  const loadOlder = async (): Promise<void> => {
    if (!matchId || !page?.nextBeforeTurn) return
    try {
      const older = await api.trajectoryPage(matchId, ownerId, page.nextBeforeTurn)
      setPage({
        ...page,
        turns: mergeBy(older.turns, page.turns, (turn) => turn.turnId),
        records: mergeBy(older.records, page.records, (record) => record.recordId),
        nextBeforeTurn: older.nextBeforeTurn,
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  if (!matchId || (error && !match && !summary)) {
    return (
      <main className="aw-page">
        <div className="aw-developer-navigation aw-developer-navigation--standalone">
          <Link
            className="aw-button aw-button--square aw-tooltip-button aw-tooltip-button--start"
            aria-label={getCopy('match.backLobby')}
            data-tooltip={getCopy('match.backLobby')}
            to="/"
          >
            <ArrowLeft size={18} aria-hidden />
          </Link>
          {developerMode && matchId ? (
            <Link
              className="aw-button aw-button--square aw-tooltip-button"
              aria-label={getCopy('trajectory.openMatch')}
              data-tooltip={getCopy('trajectory.openMatch')}
              to={`/matches/${matchId}`}
            >
              <ArrowsLeftRight size={18} aria-hidden />
            </Link>
          ) : null}
        </div>
        <ErrorState
          message={error ?? getCopy('trajectory.unavailable')}
          retry={() => void loadTrajectory()}
        />
      </main>
    )
  }

  if (!match || !summary || !page) {
    return (
      <main className="aw-page">
        <LoadingState />
      </main>
    )
  }

  return (
    <main className="aw-page aw-developer-page">
      <div className="aw-developer-heading">
        <div className="aw-developer-navigation">
          <Link
            className="aw-button aw-button--square aw-tooltip-button aw-tooltip-button--start"
            aria-label={getCopy('match.backLobby')}
            data-tooltip={getCopy('match.backLobby')}
            to="/"
          >
            <ArrowLeft size={18} aria-hidden />
          </Link>
          {developerMode ? (
            <Link
              className="aw-button aw-button--square aw-tooltip-button"
              aria-label={getCopy('trajectory.openMatch')}
              data-tooltip={getCopy('trajectory.openMatch')}
              to={`/matches/${match.id}`}
            >
              <ArrowsLeftRight size={18} aria-hidden />
            </Link>
          ) : null}
        </div>
        <div className="aw-developer-title">
          <h1>{getCopy('trajectory.title')}</h1>
          <p>
            {formatCopy(getCopy('trajectory.matchMeta'), {
              board: match.boardName,
              count: match.seats.length,
              day: match.day,
              phase: match.phaseLabel,
            })}
          </p>
        </div>
        {audit ? (
          <div className="aw-trajectory-audit" data-ok={audit.ok} role="status">
            <strong>
              {getCopy(audit.ok ? 'trajectory.auditPassed' : 'trajectory.auditFailed')}
            </strong>
            <span>
              {formatCopy(getCopy('trajectory.auditSummary'), {
                turns: audit.auditedTurns,
                issues: audit.issues.length,
              })}
            </span>
          </div>
        ) : null}
      </div>
      <div className="aw-trajectory-layout aw-panel">
        <aside className="aw-trajectory-owners">
          <h2>{getCopy('trajectory.owners')}</h2>
          {owners.map((owner) => {
            const seat = ownerSeat(owner.ownerId)
            const player = seat === null ? null : match.seats.find((entry) => entry.seat === seat)
            return (
              <button
                className="aw-trajectory-owner"
                aria-pressed={owner.ownerId === ownerId}
                key={owner.ownerId}
                type="button"
                onClick={() => setOwnerId(owner.ownerId)}
              >
                <div className="aw-trajectory-owner__heading">
                  <span>
                    {seat === null
                      ? getCopy('trajectory.system')
                      : formatCopy(getCopy('trajectory.seatPlayer'), { seat })}
                  </span>
                  {seat === null ? null : (
                    <RoleBadge
                      label={player?.roleName ?? getCopy('match.roleHidden')}
                      roleId={player?.roleId}
                    />
                  )}
                </div>
                {seat === null ? null : (
                  <>
                    <small className="aw-trajectory-owner__nickname">
                      {formatCopy(getCopy('trajectory.nickname'), { name: owner.label })}
                    </small>
                    <small
                      className="aw-trajectory-owner__model"
                      title={player?.model ?? undefined}
                    >
                      {formatCopy(getCopy('trajectory.model'), {
                        model: player?.model ?? getCopy('match.modelUnavailable'),
                      })}
                    </small>
                  </>
                )}
                <small>
                  {formatCopy(getCopy('trajectory.ownerCounts'), {
                    turns: owner.turnCount,
                    records: owner.recordCount,
                  })}
                </small>
              </button>
            )
          })}
        </aside>
        <TrajectoryMinimap page={page} selectedId={selectedId} onSelect={setSelectedId} />
        <TrajectoryLedger
          followLatest={match.status !== 'ended'}
          loading={pageLoading}
          page={page}
          query={query}
          selectedId={selectedId}
          onLoadOlder={() => void loadOlder()}
          onQuery={setQuery}
          onSelect={setSelectedId}
        />
        <TrajectoryInspector
          record={page.records.find((record) => record.recordId === selectedId) ?? null}
          turn={page.turns.find((turn) => turn.turnId === selectedId) ?? null}
        />
      </div>
      {error ? <p className="aw-form-message aw-form-message--error">{error}</p> : null}
    </main>
  )
}

function ownerSeat(ownerId: TrajectoryOwnerId): number | null {
  if (ownerId === 'system') return null
  const seat = Number(ownerId.slice('player-'.length))
  return Number.isInteger(seat) && seat > 0 ? seat : null
}

function orderedOwners(owners: TrajectorySummary['owners']): TrajectorySummary['owners'] {
  return [...owners].sort((left, right) => {
    const leftSeat = ownerSeat(left.ownerId)
    const rightSeat = ownerSeat(right.ownerId)
    if (leftSeat === null) return rightSeat === null ? 0 : 1
    if (rightSeat === null) return -1
    return leftSeat - rightSeat
  })
}

function mergeBy<Value>(
  current: readonly Value[],
  incoming: readonly Value[],
  key: (value: Value) => string,
): Value[] {
  const values = new Map(current.map((value) => [key(value), value]))
  for (const value of incoming) values.set(key(value), value)
  return [...values.values()]
}
