import { useMemo, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { formatCopy, getCopy } from '@agentwolf/assets'
import type {
  SeatView,
  TrajectoryPlayerDebug,
  TrajectoryRecord,
  TrajectoryTurn,
} from '@agentwolf/contracts'
import { TrajectoryInspector } from './TrajectoryPanels.js'

export type TrajectoryInspectorTab = 'player' | 'record'

export function TrajectoryInspectorTabs({
  activeTab,
  debug,
  debugLoading,
  record,
  turn,
  seat,
  onTabChange,
}: {
  readonly activeTab: TrajectoryInspectorTab
  readonly debug: TrajectoryPlayerDebug | null
  readonly debugLoading: boolean
  readonly record: TrajectoryRecord | null
  readonly turn: TrajectoryTurn | null
  readonly seat: SeatView | null
  readonly onTabChange: (tab: TrajectoryInspectorTab) => void
}) {
  const playerTabRef = useRef<HTMLButtonElement>(null)
  const recordTabRef = useRef<HTMLButtonElement>(null)
  const selectTab = (tab: TrajectoryInspectorTab): void => {
    onTabChange(tab)
    ;(tab === 'player' ? playerTabRef : recordTabRef).current?.focus()
  }
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    selectTab(activeTab === 'player' ? 'record' : 'player')
  }
  return (
    <aside className="aw-trajectory-inspector">
      <div
        className="aw-trajectory-inspector-tabs"
        aria-label={getCopy('trajectory.inspectorTabs')}
        role="tablist"
      >
        <button
          ref={playerTabRef}
          aria-controls="trajectory-player-panel"
          aria-selected={activeTab === 'player'}
          id="trajectory-player-tab"
          role="tab"
          type="button"
          onClick={() => onTabChange('player')}
          onKeyDown={onTabKeyDown}
        >
          {getCopy('trajectory.playerConfiguration')}
        </button>
        <button
          ref={recordTabRef}
          aria-controls="trajectory-record-panel"
          aria-selected={activeTab === 'record'}
          id="trajectory-record-tab"
          role="tab"
          type="button"
          onClick={() => onTabChange('record')}
          onKeyDown={onTabKeyDown}
        >
          {getCopy('trajectory.detail')}
        </button>
      </div>
      {activeTab === 'player' ? (
        <section
          className="aw-trajectory-inspector-panel"
          aria-labelledby="trajectory-player-tab"
          id="trajectory-player-panel"
          role="tabpanel"
        >
          <PlayerDebugInspector debug={debug} loading={debugLoading} seat={seat} />
        </section>
      ) : (
        <section
          className="aw-trajectory-inspector-panel"
          aria-labelledby="trajectory-record-tab"
          id="trajectory-record-panel"
          role="tabpanel"
        >
          <TrajectoryInspector record={record} turn={turn} />
        </section>
      )}
    </aside>
  )
}

function PlayerDebugInspector({
  debug,
  loading,
  seat,
}: {
  readonly debug: TrajectoryPlayerDebug | null
  readonly loading: boolean
  readonly seat: SeatView | null
}) {
  const environmentValues = useMemo(
    () =>
      debug?.launch.environment.map((entry) =>
        entry.reference
          ? `${entry.name} ← ${entry.source}:${entry.reference}`
          : `${entry.name} ← ${entry.source}`,
      ) ?? [],
    [debug],
  )
  if (loading) return <p>{getCopy('trajectory.playerDebugLoading')}</p>
  if (!seat || !debug) return <p>{getCopy('trajectory.playerDebugUnavailable')}</p>
  const reasoning = debug.profile.reasoningEffort ?? getCopy('agentFields.reasoningDefault')
  return (
    <div className="aw-trajectory-player-debug">
      <header className="aw-trajectory-player-debug__header">
        <div>
          <strong>
            {formatCopy(getCopy('trajectory.sessionPlayer'), {
              seat: seat.seat,
              player: seat.name,
            })}
          </strong>
          <span>
            {formatCopy(getCopy('agentFields.agentSummary'), {
              agent: debug.profile.toolName,
              model: debug.profile.model,
              reasoning,
            })}
          </span>
        </div>
      </header>

      <DebugGroup title={getCopy('trajectory.debugSession')}>
        <DebugRow code label={getCopy('trajectory.sessionId')} value={debug.session.id} />
        <DebugRow label={getCopy('trajectory.runtimeStatus')} value={seat.sessionStatus} />
        <DebugRow
          label={getCopy('trajectory.sessionGeneration')}
          value={debug.session.generation === null ? null : `#${debug.session.generation}`}
        />
        <DebugRow label={getCopy('trajectory.bindingState')} value={debug.session.state} />
        <DebugRow
          label={getCopy('trajectory.bootstrapState')}
          value={debug.session.bootstrapState}
        />
        <DebugRow
          label={getCopy('trajectory.acknowledgedSequence')}
          value={String(debug.delivery.acknowledgedSequence)}
        />
        <DebugRow
          code
          label={getCopy('trajectory.activeDelivery')}
          value={activeDeliveryLabel(debug.delivery.activeAttempt)}
        />
        <DebugRow
          code
          label={getCopy('trajectory.pendingAction')}
          value={pendingActionLabel(debug.session)}
        />
        <DebugRow label={getCopy('trajectory.sessionUpdated')} value={debug.session.updatedAt} />
      </DebugGroup>

      <DebugGroup title={getCopy('trajectory.debugProfile')}>
        <DebugRow label={getCopy('trajectory.profileName')} value={debug.profile.name} />
        <DebugRow label={getCopy('trajectory.agentTool')} value={debug.profile.toolName} />
        <DebugRow label={getCopy('trajectory.modelLabel')} value={debug.profile.model} />
        <DebugRow label={getCopy('trajectory.reasoningLabel')} value={reasoning} />
        <DebugRow label={getCopy('trajectory.modeLabel')} value={debug.profile.mode} />
        <DebugRow
          label={getCopy('trajectory.promptTimeout')}
          value={`${debug.profile.promptTimeoutMs} ms`}
        />
      </DebugGroup>

      <DebugGroup title={getCopy('trajectory.debugContext')}>
        <DebugRow
          label={getCopy('trajectory.latestUsage')}
          value={usageLabel(debug.context.latest)}
        />
        <DebugRow label={getCopy('trajectory.peakUsage')} value={String(debug.context.peakUsed)} />
        <DebugRow
          label={getCopy('trajectory.usageTurns')}
          value={String(debug.context.turnsWithUsage)}
        />
      </DebugGroup>

      <DebugGroup title={getCopy('trajectory.debugLaunch')}>
        <DebugRow code label={getCopy('trajectory.command')} value={debug.launch.command} />
        <DebugBlock label={getCopy('trajectory.arguments')} values={debug.launch.args} />
        <DebugBlock label={getCopy('trajectory.environment')} values={environmentValues} />
        <DebugBlock
          label={getCopy('trajectory.connectionKeys')}
          values={debug.launch.connectionKeys}
        />
      </DebugGroup>

      {debug.latestTurn ? (
        <DebugGroup title={getCopy('trajectory.debugLatestTurn')}>
          <DebugRow label={getCopy('trajectory.call')} value={`#${debug.latestTurn.ordinal}`} />
          <DebugRow label={getCopy('trajectory.actionType')} value={debug.latestTurn.actionType} />
          <DebugRow label={getCopy('trajectory.status')} value={debug.latestTurn.status} />
          <DebugRow
            label={getCopy('trajectory.sequence')}
            value={`${debug.latestTurn.fromSequence} → ${debug.latestTurn.toSequence}`}
          />
          <DebugRow label={getCopy('trajectory.error')} value={debug.latestTurn.error} />
        </DebugGroup>
      ) : null}
    </div>
  )
}

function DebugGroup({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="aw-trajectory-debug-group">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function DebugRow({
  label,
  value,
  code = false,
}: {
  readonly label: string
  readonly value: string | null
  readonly code?: boolean
}) {
  return (
    <div className="aw-trajectory-debug-row">
      <span>{label}</span>
      {code ? (
        <code>{value ?? getCopy('common.none')}</code>
      ) : (
        <strong>{value ?? getCopy('common.none')}</strong>
      )}
    </div>
  )
}

function DebugBlock({
  label,
  values,
}: {
  readonly label: string
  readonly values: readonly string[]
}) {
  return (
    <div className="aw-trajectory-debug-block">
      <span>{label}</span>
      <pre>{values.length > 0 ? values.join('\n') : getCopy('common.none')}</pre>
    </div>
  )
}

function usageLabel(usage: TrajectoryPlayerDebug['context']['latest']): string | null {
  if (!usage) return null
  const cost = usage.cost ? ` · ${usage.cost.amount} ${usage.cost.currency}` : ''
  return `${usage.used} / ${usage.size}${cost}`
}

function activeDeliveryLabel(
  attempt: TrajectoryPlayerDebug['delivery']['activeAttempt'],
): string | null {
  return attempt
    ? `${attempt.id} · ${attempt.state} · ${attempt.fromSequence} → ${attempt.toSequence}`
    : null
}

function pendingActionLabel(session: TrajectoryPlayerDebug['session']): string | null {
  if (!session.pendingActionType) return null
  return session.pendingDeliveryId
    ? `${session.pendingActionType} · ${session.pendingDeliveryId}`
    : session.pendingActionType
}
