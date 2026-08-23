import {
  ArrowRight,
  Check,
  CheckCircle,
  Flask,
  Package,
  Pulse,
  ShieldCheck,
  WarningCircle,
  XCircle,
} from '@phosphor-icons/react'
import { useEffect, useId, useRef, useState } from 'react'
import { formatCopy, getCopy } from '@agentwolf/assets'
import type {
  MatchView,
  SimulationApprovalResult,
  SimulationReviewResult,
} from '@agentwolf/contracts'
import { api } from '../api.js'
import { ModalDialog } from './ModalDialog.js'
import { StatusBadge } from './StatusBadge.js'

type WizardStage = 'prepare' | 'reviewing' | 'review' | 'approving' | 'complete'

export function SimulationWizardDialog({
  match,
  onClose,
}: {
  readonly match: MatchView | null
  readonly onClose: () => void
}) {
  const titleId = useId()
  const descriptionId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const stageActionRef = useRef<HTMLButtonElement>(null)
  const [stage, setStage] = useState<WizardStage>('prepare')
  const [review, setReview] = useState<SimulationReviewResult | null>(null)
  const [approval, setApproval] = useState<SimulationApprovalResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [acknowledgeWarnings, setAcknowledgeWarnings] = useState(false)
  const [acceptCurrent, setAcceptCurrent] = useState(false)
  const busy = stage === 'reviewing' || stage === 'approving'

  useEffect(() => {
    setStage('prepare')
    setReview(null)
    setApproval(null)
    setError(null)
    setAcknowledgeWarnings(false)
    setAcceptCurrent(false)
  }, [match?.id])

  useEffect(() => {
    if (!match || busy) return undefined
    const frame = window.requestAnimationFrame(() => stageActionRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [busy, match, stage])

  if (!match) return null

  const runReview = async (): Promise<void> => {
    setStage('reviewing')
    setReview(null)
    setApproval(null)
    setError(null)
    setAcknowledgeWarnings(false)
    setAcceptCurrent(false)
    try {
      setReview(await api.reviewSimulation(match.id))
      setStage('review')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setStage('prepare')
    }
  }

  const approve = async (): Promise<void> => {
    if (!review) return
    setStage('approving')
    setError(null)
    try {
      setApproval(
        await api.approveSimulation(review.simulationId, {
          acceptCurrent,
          acknowledgeWarnings,
        }),
      )
      setStage('complete')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setStage('review')
    }
  }

  const warningReady = !review?.warnings.length || acknowledgeWarnings
  const behaviorReady = Boolean(review?.canApprove || (acceptCurrent && review?.canAcceptCurrent))

  return (
    <ModalDialog
      busy={busy}
      className="aw-simulation-wizard"
      describedBy={descriptionId}
      initialFocusRef={cancelRef}
      labelledBy={titleId}
      open
      onClose={onClose}
    >
      <header className="aw-simulation-wizard__header">
        <div className="aw-simulation-wizard__mark" aria-hidden>
          <Flask size={27} weight="duotone" />
        </div>
        <div>
          <h2 id={titleId}>{getCopy('simulationWizard.title')}</h2>
          <p id={descriptionId}>
            {formatCopy(getCopy('simulationWizard.subtitle'), { board: match.boardName })}
          </p>
        </div>
      </header>

      <WizardProgress stage={stage} />

      <div className="aw-simulation-wizard__body">
        {stage === 'prepare' ? <PreparePanel match={match} error={error} /> : null}
        {stage === 'reviewing' ? (
          <ActivityPanel
            title={getCopy('simulationWizard.reviewingTitle')}
            detail={getCopy('simulationWizard.reviewingDetail')}
          />
        ) : null}
        {stage === 'review' && review ? (
          <ReviewPanel
            acceptCurrent={acceptCurrent}
            acknowledgeWarnings={acknowledgeWarnings}
            error={error}
            review={review}
            onAcceptCurrent={setAcceptCurrent}
            onAcknowledgeWarnings={setAcknowledgeWarnings}
          />
        ) : null}
        {stage === 'approving' ? (
          <ActivityPanel
            title={getCopy('simulationWizard.approvingTitle')}
            detail={getCopy('simulationWizard.approvingDetail')}
          />
        ) : null}
        {stage === 'complete' && approval ? <CompletePanel approval={approval} /> : null}
      </div>

      <footer className="aw-simulation-wizard__actions">
        {stage === 'prepare' ? (
          <>
            <button
              ref={cancelRef}
              className="aw-button"
              data-dialog-action
              type="button"
              onClick={onClose}
            >
              {getCopy('common.cancel')}
            </button>
            <button
              ref={stageActionRef}
              className="aw-button aw-button--primary"
              data-dialog-action
              type="button"
              onClick={() => void runReview()}
            >
              {getCopy('simulationWizard.startReview')}
              <ArrowRight size={17} aria-hidden />
            </button>
          </>
        ) : null}
        {busy ? (
          <button className="aw-button" data-dialog-action disabled type="button">
            {getCopy('simulationWizard.processing')}
          </button>
        ) : null}
        {stage === 'review' ? (
          <>
            <button
              ref={cancelRef}
              className="aw-button"
              data-dialog-action
              type="button"
              onClick={onClose}
            >
              {getCopy('common.cancel')}
            </button>
            <button
              className="aw-button"
              data-dialog-action
              type="button"
              onClick={() => void runReview()}
            >
              {getCopy('simulationWizard.reviewAgain')}
            </button>
            <button
              ref={stageActionRef}
              className="aw-button aw-button--primary"
              data-dialog-action
              disabled={!behaviorReady || !warningReady || Boolean(review?.secretWarnings.length)}
              type="button"
              onClick={() => void approve()}
            >
              {getCopy('simulationWizard.approve')}
              <ArrowRight size={17} aria-hidden />
            </button>
          </>
        ) : null}
        {stage === 'complete' ? (
          <button
            ref={stageActionRef}
            className="aw-button aw-button--primary"
            data-dialog-action
            type="button"
            onClick={onClose}
          >
            {getCopy('simulationWizard.done')}
            <Check size={17} aria-hidden />
          </button>
        ) : null}
      </footer>
    </ModalDialog>
  )
}

function WizardProgress({ stage }: { readonly stage: WizardStage }) {
  const active = stage === 'prepare' ? 0 : stage === 'reviewing' || stage === 'review' ? 1 : 2
  const items = [
    { label: getCopy('simulationWizard.prepareLabel'), icon: Package },
    { label: getCopy('simulationWizard.reviewLabel'), icon: ShieldCheck },
    { label: getCopy('simulationWizard.approveLabel'), icon: CheckCircle },
  ]
  return (
    <ol
      className="aw-simulation-wizard__progress"
      aria-label={getCopy('simulationWizard.progress')}
    >
      {items.map((item, index) => {
        const Icon = item.icon
        const state = index < active ? 'complete' : index === active ? 'current' : 'upcoming'
        return (
          <li
            aria-current={state === 'current' ? 'step' : undefined}
            data-state={state}
            key={item.label}
          >
            <Icon size={17} weight={state === 'current' ? 'fill' : 'regular'} aria-hidden />
            <span>{item.label}</span>
          </li>
        )
      })}
    </ol>
  )
}

function PreparePanel({
  match,
  error,
}: {
  readonly match: MatchView
  readonly error: string | null
}) {
  return (
    <section className="aw-simulation-wizard__section">
      <div>
        <h3>{getCopy('simulationWizard.prepareTitle')}</h3>
        <p>{getCopy('simulationWizard.prepareDetail')}</p>
      </div>
      <dl className="aw-simulation-wizard__summary">
        <div>
          <dt>{getCopy('simulationWizard.sourceStatus')}</dt>
          <dd>
            <StatusBadge status={match.status} />
          </dd>
        </div>
        <div>
          <dt>{getCopy('simulationWizard.players')}</dt>
          <dd>
            {formatCopy(getCopy('simulationWizard.playerCount'), { count: match.seats.length })}
          </dd>
        </div>
        <div>
          <dt>{getCopy('simulationWizard.currentBoundary')}</dt>
          <dd>{match.phaseLabel}</dd>
        </div>
      </dl>
      <div className="aw-simulation-wizard__notice">
        <ShieldCheck size={21} aria-hidden />
        <p>{getCopy('simulationWizard.safetyNotice')}</p>
      </div>
      {error ? <InlineIssue message={error} /> : null}
    </section>
  )
}

function ActivityPanel({ title, detail }: { readonly title: string; readonly detail: string }) {
  return (
    <section className="aw-simulation-wizard__activity" aria-live="polite">
      <Pulse size={34} weight="duotone" aria-hidden />
      <h3>{title}</h3>
      <p>{detail}</p>
      <span aria-hidden />
    </section>
  )
}

function ReviewPanel({
  review,
  error,
  acknowledgeWarnings,
  acceptCurrent,
  onAcknowledgeWarnings,
  onAcceptCurrent,
}: {
  readonly review: SimulationReviewResult
  readonly error: string | null
  readonly acknowledgeWarnings: boolean
  readonly acceptCurrent: boolean
  readonly onAcknowledgeWarnings: (value: boolean) => void
  readonly onAcceptCurrent: (value: boolean) => void
}) {
  const ready = review.canApprove && review.warnings.length === 0
  return (
    <section className="aw-simulation-wizard__section">
      <div className="aw-simulation-wizard__review-heading">
        <div>
          <h3>{getCopy('simulationWizard.reviewTitle')}</h3>
          <p>{getCopy('simulationWizard.reviewDetail')}</p>
        </div>
        <strong data-ok={ready}>
          {getCopy(ready ? 'simulationWizard.reviewPassed' : 'simulationWizard.reviewNeedsAction')}
        </strong>
      </div>
      <dl className="aw-simulation-wizard__metrics">
        <div>
          <dt>{getCopy('simulationWizard.turns')}</dt>
          <dd>{review.turns}</dd>
        </div>
        <div>
          <dt>{getCopy('simulationWizard.events')}</dt>
          <dd>{review.events}</dd>
        </div>
      </dl>
      <div className="aw-simulation-wizard__checks">
        <ReviewCheck label={getCopy('simulationWizard.engineReplay')} ok={review.replayOk} />
        <ReviewCheck
          label={getCopy('simulationWizard.engineDeterminism')}
          ok={review.deterministic}
        />
        <ReviewCheck
          label={getCopy('simulationWizard.orchestrationReplay')}
          ok={review.orchestrationOk}
        />
        <ReviewCheck
          label={getCopy('simulationWizard.orchestrationDeterminism')}
          ok={review.orchestrationDeterministic}
        />
      </div>
      {review.failures.length > 0 ? (
        <IssueList title={getCopy('simulationWizard.failures')} items={review.failures} danger />
      ) : null}
      {review.secretWarnings.length > 0 ? (
        <IssueList
          title={getCopy('simulationWizard.secretWarnings')}
          items={review.secretWarnings}
          danger
        />
      ) : null}
      {review.warnings.length > 0 ? (
        <>
          <IssueList title={getCopy('simulationWizard.warnings')} items={review.warnings} />
          <WizardCheckbox
            checked={acknowledgeWarnings}
            label={getCopy('simulationWizard.acknowledgeWarnings')}
            onChange={onAcknowledgeWarnings}
          />
        </>
      ) : null}
      {!review.canApprove && review.canAcceptCurrent ? (
        <WizardCheckbox
          checked={acceptCurrent}
          label={getCopy('simulationWizard.acceptCurrent')}
          onChange={onAcceptCurrent}
        />
      ) : null}
      {error ? <InlineIssue message={error} /> : null}
    </section>
  )
}

function ReviewCheck({ label, ok }: { readonly label: string; readonly ok: boolean }) {
  return (
    <div data-ok={ok}>
      {ok ? <CheckCircle size={20} weight="fill" aria-hidden /> : <XCircle size={20} aria-hidden />}
      <span>{label}</span>
      <strong>{getCopy(ok ? 'simulationWizard.passed' : 'simulationWizard.failed')}</strong>
    </div>
  )
}

function WizardCheckbox({
  checked,
  label,
  onChange,
}: {
  readonly checked: boolean
  readonly label: string
  readonly onChange: (value: boolean) => void
}) {
  return (
    <label className="aw-simulation-wizard__checkbox">
      <input
        checked={checked}
        data-dialog-action
        type="checkbox"
        onChange={(event) => onChange(event.target.checked)}
      />
      <span aria-hidden>{checked ? <Check size={14} weight="bold" /> : null}</span>
      <strong>{label}</strong>
    </label>
  )
}

function IssueList({
  title,
  items,
  danger = false,
}: {
  readonly title: string
  readonly items: readonly string[]
  readonly danger?: boolean
}) {
  return (
    <div className="aw-simulation-wizard__issues" data-danger={danger}>
      <div>
        <WarningCircle size={19} aria-hidden />
        <strong>{title}</strong>
      </div>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

function InlineIssue({ message }: { readonly message: string }) {
  return (
    <div className="aw-simulation-wizard__inline-error" role="alert">
      <WarningCircle size={19} aria-hidden />
      <span>{message}</span>
    </div>
  )
}

function CompletePanel({ approval }: { readonly approval: SimulationApprovalResult }) {
  return (
    <section className="aw-simulation-wizard__complete">
      <div aria-hidden>
        <CheckCircle size={42} weight="duotone" />
      </div>
      <h3>{getCopy('simulationWizard.completeTitle')}</h3>
      <p>
        {getCopy(
          approval.created ? 'simulationWizard.completeCreated' : 'simulationWizard.completeExists',
        )}
      </p>
      <code>{approval.relativePath}</code>
      <small>
        {formatCopy(getCopy('simulationWizard.variantCount'), { count: approval.variants.length })}
      </small>
    </section>
  )
}
