import { Bug } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatCopy, getCopy } from '@agentwolf/assets'
import {
  TrajectoryDeltaSchema,
  type MatchId,
  type MatchView,
  type TrajectoryOwnerId,
  type TrajectoryAuditReport,
  type TrajectoryPage,
  type TrajectorySummary,
} from '@agentwolf/contracts'
import { api } from '../api.js'
import { ErrorState, LoadingState } from '../components/AsyncState.js'
import { GameSelect } from '../components/GameSelect.js'
import {
  TrajectoryInspector,
  TrajectoryLedger,
  TrajectoryOverview,
} from '../components/developer/TrajectoryPanels.js'

export function DeveloperPage() {
  const [matches, setMatches] = useState<MatchView[] | null>(null)
  const [matchId, setMatchId] = useState<MatchId | ''>('')
  const [summary, setSummary] = useState<TrajectorySummary | null>(null)
  const [audit, setAudit] = useState<TrajectoryAuditReport | null>(null)
  const [ownerId, setOwnerId] = useState<TrajectoryOwnerId>('system')
  const [page, setPage] = useState<TrajectoryPage | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const revision = useRef(0)
  const summaryLoaded = summary !== null
  const matchOptions = useMemo(
    () =>
      (matches ?? []).map((match) => ({
        value: match.id,
        label: `${match.boardName} · ${match.id}`,
      })),
    [matches],
  )

  const loadMatches = useCallback(async () => {
    setError(null)
    try {
      const next = await api.listMatches()
      setMatches(next)
      setMatchId((current) => current || next[0]?.id || '')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])
  useEffect(() => void loadMatches(), [loadMatches])

  useEffect(() => {
    if (!matchId) return undefined
    let active = true
    setSummary(null)
    setAudit(null)
    setPage(null)
    setSelectedId(null)
    const load = async (): Promise<void> => {
      try {
        const [next, nextAudit] = await Promise.all([
          api.trajectorySummary(matchId),
          api.trajectoryAudit(matchId),
        ])
        if (!active) return
        revision.current = next.revision
        setSummary(next)
        setAudit(nextAudit)
        const firstActive = next.owners.find((owner) => owner.turnCount > 0)
        setOwnerId(firstActive?.ownerId ?? next.owners[0]?.ownerId ?? 'system')
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : String(cause))
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [matchId])

  useEffect(() => {
    if (!matchId || !summaryLoaded) return undefined
    let active = true
    setPage(null)
    setSelectedId(null)
    const load = async (): Promise<void> => {
      try {
        const next = await api.trajectoryPage(matchId, ownerId)
        if (!active) return
        revision.current = Math.max(revision.current, next.revision)
        setPage(next)
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : String(cause))
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

  if (error && !matches) return <ErrorState message={error} retry={() => void loadMatches()} />
  if (!matches) return <LoadingState />
  if (matches.length === 0) {
    return (
      <main className="aw-page">
        <div className="aw-empty-state aw-panel">
          <Bug size={38} aria-hidden />
          <h1>{getCopy('trajectory.noMatches')}</h1>
          <p>{getCopy('trajectory.noMatchesHint')}</p>
        </div>
      </main>
    )
  }

  return (
    <main className="aw-page aw-developer-page">
      <div className="aw-page-heading aw-developer-heading">
        <div>
          <h1>{getCopy('trajectory.title')}</h1>
          <p>{getCopy('trajectory.subtitle')}</p>
        </div>
        <div className="aw-developer-match-select">
          <GameSelect
            ariaLabel={getCopy('trajectory.match')}
            value={matchId}
            options={matchOptions}
            onChange={(value) => setMatchId(value as MatchId)}
          />
        </div>
      </div>
      {!summary || !page ? (
        <LoadingState />
      ) : (
        <>
          <TrajectoryOverview summary={summary} selectedOwner={ownerId} onSelect={setOwnerId} />
          {audit ? (
            <div className="aw-trajectory-audit aw-panel" data-ok={audit.ok} role="status">
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
          <div className="aw-trajectory-layout">
            <aside className="aw-trajectory-owners aw-panel">
              <h2>{getCopy('trajectory.owners')}</h2>
              {summary.owners.map((owner) => (
                <button
                  className="aw-trajectory-owner"
                  aria-pressed={owner.ownerId === ownerId}
                  key={owner.ownerId}
                  type="button"
                  onClick={() => setOwnerId(owner.ownerId)}
                >
                  <span>{owner.label}</span>
                  <small>
                    {owner.turnCount} / {owner.recordCount}
                  </small>
                </button>
              ))}
            </aside>
            <TrajectoryLedger
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
        </>
      )}
      {error ? <p className="aw-form-message aw-form-message--error">{error}</p> : null}
    </main>
  )
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
