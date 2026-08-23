import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import {
  SimulationApprovalResultSchema,
  SimulationCaptureSchema,
  SimulationFixtureSchema,
  SimulationIdSchema,
  SimulationReviewResultSchema,
  type SimulationApprovalRequest,
  type SimulationCapture,
  type SimulationId,
  type SimulationRunReport,
  type SimulationVariant,
} from '@agentwolf/contracts'
import type { ServerConfig } from './config.js'
import {
  normalizeSimulationCapture,
  reviewedSimulationExpected,
  scanSimulationSecrets,
} from './simulation-canonical.js'
import { runOrchestrationSimulation } from './simulation-orchestration.js'
import { runEngineSimulation } from './simulation-runner.js'

type WorkflowConfig = Pick<ServerConfig, 'dataDirectory' | 'projectRoot'>

interface ReviewDetails {
  readonly capture: SimulationCapture
  readonly engine: SimulationRunReport
  readonly orchestration: SimulationRunReport
  readonly result: ReturnType<typeof SimulationReviewResultSchema.parse>
}

export class SimulationWorkflowError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'SimulationWorkflowError'
  }
}

export async function reviewSimulationCandidate(config: WorkflowConfig, idValue: string) {
  return (await reviewDetails(config, SimulationIdSchema.parse(idValue))).result
}

export async function approveSimulationCandidate(
  config: WorkflowConfig,
  idValue: string,
  options: SimulationApprovalRequest,
) {
  const id = SimulationIdSchema.parse(idValue)
  const review = await reviewDetails(config, id)
  if (review.result.secretWarnings.length > 0) {
    throw new SimulationWorkflowError(
      `Capture contains sensitive content: ${review.result.secretWarnings.join(', ')}`,
    )
  }
  if (review.result.warnings.length > 0 && !options.acknowledgeWarnings) {
    throw new SimulationWorkflowError('Capture warnings must be acknowledged before approval')
  }
  if (!review.result.canApprove && !options.acceptCurrent) {
    throw new SimulationWorkflowError('Captured behavior differs from the current implementation')
  }
  if (options.acceptCurrent && !review.result.canAcceptCurrent) {
    throw new SimulationWorkflowError('Current engine and orchestration results cannot be accepted')
  }
  const variants = defaultVariants(review.capture.source.status)
  const fixture = SimulationFixtureSchema.parse({
    schemaVersion: 1,
    stage: 'approved',
    simulationId: review.capture.simulationId,
    title: review.capture.title,
    source: {
      status: review.capture.source.status,
      cutoffSequence: review.capture.source.cutoffSequence,
      fingerprint: review.capture.source.fingerprint,
    },
    setup: review.capture.setup,
    turns: review.capture.turns,
    controls: review.capture.controls,
    expected: reviewedSimulationExpected(
      options.acceptCurrent ? review.engine.actual : review.capture.observed,
    ),
    variants,
    browser: false,
  })
  const directory = approvedDirectory(config)
  await mkdir(directory, { recursive: true })
  const path = resolve(directory, `${id}.sim.json`)
  let created = true
  let approvedVariants = variants
  try {
    await writeFile(path, `${JSON.stringify(fixture, null, 2)}\n`, { flag: 'wx' })
  } catch (error) {
    if (!isAlreadyExists(error)) throw error
    const existing = SimulationFixtureSchema.parse(JSON.parse(await readFile(path, 'utf8')))
    if (existing.source.fingerprint !== fixture.source.fingerprint) {
      throw new SimulationWorkflowError('An approved fixture with this ID contains other data')
    }
    if (JSON.stringify(existing.expected) !== JSON.stringify(fixture.expected)) {
      throw new SimulationWorkflowError('The approved fixture contains another reviewed result')
    }
    approvedVariants = existing.variants
    created = false
  }
  return SimulationApprovalResultSchema.parse({
    simulationId: id,
    relativePath: relative(config.projectRoot, path),
    created,
    variants: approvedVariants,
  })
}

export async function readSimulationCandidate(
  config: WorkflowConfig,
  idValue: string,
): Promise<SimulationCapture> {
  const id = SimulationIdSchema.parse(idValue)
  return normalizeSimulationCapture(
    SimulationCaptureSchema.parse(JSON.parse(await readFile(candidatePath(config, id), 'utf8'))),
  )
}

async function reviewDetails(config: WorkflowConfig, id: SimulationId): Promise<ReviewDetails> {
  const capture = await readSimulationCandidate(config, id)
  const engine = runEngineSimulation(capture)
  const repeatedEngine = runEngineSimulation(capture)
  const orchestration = await runOrchestrationSimulation(capture, {
    projectRoot: config.projectRoot,
  })
  const repeatedOrchestration = await runOrchestrationSimulation(capture, {
    projectRoot: config.projectRoot,
  })
  const deterministic = sameResult(engine, repeatedEngine)
  const orchestrationDeterministic = sameResult(orchestration, repeatedOrchestration)
  const runnersAgree = sameResult(engine, orchestration)
  const secretWarnings = scanSimulationSecrets(capture)
  const canAcceptCurrent =
    deterministic && orchestrationDeterministic && runnersAgree && secretWarnings.length === 0
  const result = SimulationReviewResultSchema.parse({
    simulationId: id,
    relativePath: relative(config.projectRoot, candidatePath(config, id)),
    sourceStatus: capture.source.status,
    turns: capture.turns.length,
    events: capture.observed.events.length,
    deterministic,
    replayOk: engine.ok,
    orchestrationDeterministic,
    orchestrationOk: orchestration.ok,
    runnersAgree,
    canApprove: canAcceptCurrent && engine.ok && orchestration.ok,
    canAcceptCurrent,
    failures: [...new Set([...engine.failures, ...orchestration.failures])],
    warnings: capture.warnings,
    secretWarnings,
  })
  return { capture, engine, orchestration, result }
}

function candidatePath(config: WorkflowConfig, id: SimulationId): string {
  return resolve(config.dataDirectory, 'simulations', 'inbox', `${id}.sim.json`)
}

function approvedDirectory(config: WorkflowConfig): string {
  return resolve(config.projectRoot, 'apps/server/tests/fixtures/simulations')
}

function defaultVariants(status: SimulationCapture['source']['status']): SimulationVariant[] {
  return status === 'paused'
    ? ['recorded']
    : [
        'recorded',
        'parallel-seat-order',
        'parallel-reverse-order',
        'transient-delivery',
        'restart-boundary',
        'playback-completed',
        'playback-skipped',
        'playback-disconnected',
      ]
}

function sameResult(left: SimulationRunReport, right: SimulationRunReport): boolean {
  return JSON.stringify(left.actual) === JSON.stringify(right.actual)
}

function isAlreadyExists(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST'
}
