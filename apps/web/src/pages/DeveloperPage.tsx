import { ArrowLeft, ArrowsLeftRight } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTrajectoryExplorer, type TrajectoryDataSource } from '@agent-arena/devtools-react'
import { formatCopy, getCopy } from '@agentwolf/assets'
import {
  MatchIdSchema,
  PlayerIdSchema,
  TrajectoryOwnerIdSchema,
  TrajectoryDeltaSchema,
  type TrajectoryRecord,
  type TrajectoryTurn,
  type MatchView,
  type TrajectoryAuditIssue,
  type TrajectoryOwnerId,
  type TrajectoryAuditReport,
  type TrajectoryPage,
  type TrajectoryPlayerDebug,
  type TrajectorySummary,
} from '@agentwolf/contracts'
import { formatAgentConfiguration } from '../agent-configuration.js'
import { api } from '../api.js'
import { ErrorState, LoadingState } from '../components/AsyncState.js'
import { RoleBadge } from '../components/RoleBadge.js'
import { TrajectoryAuditOrb } from '../components/developer/TrajectoryAuditOrb.js'
import {
  TrajectoryInspectorTabs,
  type TrajectoryInspectorTab,
} from '../components/developer/TrajectoryInspectorTabs.js'
import { TrajectoryLedger, TrajectoryMinimap } from '../components/developer/TrajectoryPanels.js'
import { useRuntimeConfig } from '../hooks/useRuntimeConfig.js'

export function DeveloperPage() {
  const { matchId: matchIdParam } = useParams<{ matchId: string }>()
  const parsedMatchId = useMemo(() => MatchIdSchema.safeParse(matchIdParam), [matchIdParam])
  const matchId = parsedMatchId.success ? parsedMatchId.data : null
  const { developerMode } = useRuntimeConfig()
  const [match, setMatch] = useState<MatchView | null>(null)
  const [audit, setAudit] = useState<TrajectoryAuditReport | null>(null)
  const [inspectorTab, setInspectorTab] = useState<TrajectoryInspectorTab>('player')
  const [playerDebug, setPlayerDebug] = useState<TrajectoryPlayerDebug | null>(null)
  const [playerDebugLoading, setPlayerDebugLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const trajectoryDataSource = useMemo(() => createTrajectoryDataSource(), [])
  const explorer = useTrajectoryExplorer({
    resourceId: matchId,
    dataSource: trajectoryDataSource,
    initialOwner: firstTrajectoryOwner,
  })
  const { summary, page, ownerId, loading: pageLoading, query, selectedId } = explorer
  const selectTrajectory = explorer.select
  const pendingAuditFocus = useRef<{
    readonly issue: TrajectoryAuditIssue
    readonly turn: TrajectorySummary['turns'][number]
  } | null>(null)
  const owners = useMemo(() => orderedOwners(summary?.owners ?? []), [summary])
  const visibleError = !matchId
    ? getCopy('trajectory.unavailable')
    : (explorer.error?.message ?? error)

  const loadContext = useCallback(async () => {
    if (!matchId) {
      setError(getCopy('trajectory.unavailable'))
      return
    }
    setError(null)
    setMatch(null)
    setAudit(null)
    setInspectorTab('player')
    setPlayerDebug(null)
    try {
      const [nextMatch, nextAudit] = await Promise.all([
        api.getMatch(matchId, { kind: 'god' }),
        api.trajectoryAudit(matchId),
      ])
      setMatch(nextMatch)
      setAudit(nextAudit)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [matchId])

  useEffect(() => void loadContext(), [loadContext])

  useEffect(() => {
    const focus = pendingAuditFocus.current
    if (!focus || !page || focus.turn.ownerId !== page.ownerId) return
    const targetId = auditTargetRecordId(focus.issue, page) ?? focus.turn.turnId
    pendingAuditFocus.current = null
    selectTrajectory(targetId)
    setInspectorTab('record')
  }, [page, selectTrajectory])

  useEffect(() => {
    if (!matchId || !ownerId || ownerId === 'system') {
      setPlayerDebug(null)
      setPlayerDebugLoading(false)
      return undefined
    }
    let active = true
    setPlayerDebug(null)
    setPlayerDebugLoading(true)
    void api
      .trajectoryPlayerDebug(matchId, PlayerIdSchema.parse(ownerId))
      .then((debug) => {
        if (active) setPlayerDebug(debug)
        return undefined
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : String(cause))
        return undefined
      })
      .finally(() => {
        if (active) setPlayerDebugLoading(false)
      })
    return () => {
      active = false
    }
  }, [matchId, ownerId])

  const selectOwner = (nextOwnerId: TrajectoryOwnerId): void => {
    pendingAuditFocus.current = null
    explorer.selectOwner(nextOwnerId)
    setInspectorTab(nextOwnerId === 'system' ? 'record' : 'player')
  }

  const selectRecord = (recordId: string): void => {
    explorer.select(recordId)
    setInspectorTab('record')
  }

  const focusAuditIssue = (issue: TrajectoryAuditIssue): void => {
    const turn = summary?.turns.find((candidate) => candidate.turnId === issue.turnId)
    if (!turn) return
    pendingAuditFocus.current = { issue, turn }
    setInspectorTab('record')
    explorer.focus(turn.ownerId, turn.ordinal + 1, turn.turnId)
  }

  if (!matchId || (visibleError && !match)) {
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
          message={visibleError ?? getCopy('trajectory.unavailable')}
          retry={() => {
            explorer.reload()
            void loadContext()
          }}
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
                onClick={() => selectOwner(owner.ownerId)}
              >
                <span className="aw-trajectory-owner__heading">
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
                </span>
                {seat === null ? null : (
                  <>
                    <small className="aw-trajectory-owner__nickname">
                      {formatCopy(getCopy('trajectory.nickname'), { name: owner.label })}
                    </small>
                    <small
                      className="aw-trajectory-owner__agent"
                      title={formatAgentConfiguration(player?.agent ?? null)}
                    >
                      {formatAgentConfiguration(player?.agent ?? null)}
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
        <TrajectoryMinimap page={page} selectedId={selectedId} onSelect={selectRecord} />
        <TrajectoryLedger
          followLatest={match.status !== 'ended'}
          loading={pageLoading}
          page={page}
          query={query}
          selectedId={selectedId}
          onLoadOlder={() => void explorer.loadOlder()}
          onQuery={explorer.setQuery}
          onSelect={selectRecord}
        />
        <TrajectoryInspectorTabs
          activeTab={inspectorTab}
          debug={playerDebug}
          debugLoading={playerDebugLoading}
          record={page.records.find((record) => record.recordId === selectedId) ?? null}
          seat={match.seats.find((seat) => seat.playerId === ownerId) ?? null}
          turn={page.turns.find((turn) => turn.turnId === selectedId) ?? null}
          onTabChange={setInspectorTab}
        />
      </div>
      <TrajectoryAuditOrb
        audit={audit}
        seats={match.seats}
        turns={summary.turns}
        onLocate={focusAuditIssue}
      />
      {visibleError ? (
        <p className="aw-form-message aw-form-message--error">{visibleError}</p>
      ) : null}
    </main>
  )
}

function createTrajectoryDataSource(): TrajectoryDataSource<
  TrajectoryTurn,
  TrajectoryRecord,
  TrajectorySummary['owners'][number],
  TrajectorySummary,
  TrajectoryPage
> {
  return {
    loadSummary: async (resourceId) => api.trajectorySummary(MatchIdSchema.parse(resourceId)),
    loadPage: async (resourceId, ownerId, beforeTurn) =>
      api.trajectoryPage(
        MatchIdSchema.parse(resourceId),
        TrajectoryOwnerIdSchema.parse(ownerId),
        beforeTurn,
      ),
    subscribe: (resourceId, afterRevision, onDelta, onError) => {
      let closed = false
      let socket: WebSocket | null = null
      let reconnect: number | null = null
      let revision = afterRevision
      const connect = (): void => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        socket = new WebSocket(
          `${protocol}//${window.location.host}/api/developer/matches/${resourceId}/trajectory/live?afterRevision=${revision}`,
        )
        socket.addEventListener('message', (event) => {
          try {
            const delta = TrajectoryDeltaSchema.parse(JSON.parse(String(event.data)))
            revision = Math.max(revision, delta.revision)
            onDelta(delta)
          } catch (cause) {
            onError(cause)
            socket?.close()
          }
        })
        socket.addEventListener('error', () => socket?.close())
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
    },
  }
}

function firstTrajectoryOwner(summary: TrajectorySummary): string | null {
  const firstPlayer = summary.owners.find(
    (owner) => owner.ownerId !== 'system' && owner.turnCount > 0,
  )
  const firstActive = firstPlayer ?? summary.owners.find((owner) => owner.turnCount > 0)
  return firstActive?.ownerId ?? summary.owners[0]?.ownerId ?? 'system'
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

function auditTargetRecordId(issue: TrajectoryAuditIssue, page: TrajectoryPage): string | null {
  const records = page.records.filter((record) => record.turnId === issue.turnId)
  const preferredKind = issue.code.includes('prompt')
    ? 'prompt'
    : issue.code === 'context-budget-exceeded'
      ? 'usage'
      : null
  return (
    (preferredKind ? records.find((record) => record.kind === preferredKind)?.recordId : null) ??
    records[0]?.recordId ??
    null
  )
}
