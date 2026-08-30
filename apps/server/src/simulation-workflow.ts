import { resolve } from 'node:path'
import {
  AdaptedSimulationWorkflow,
  AdaptedSimulationWorkflowError,
  type AdaptedSimulationReviewResult,
  type SimulationArtifactAdapter,
} from '@agent-arena/simulation'
import {
  SimulationApprovalResultSchema,
  SimulationCaptureSchema,
  SimulationFixtureSchema,
  SimulationIdSchema,
  SimulationReviewResultSchema,
  type SimulationApprovalRequest,
  type SimulationCapture,
  type SimulationExpected,
  type SimulationFixture,
  type SimulationReviewedExpected,
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

const adapter: SimulationArtifactAdapter<
  SimulationCapture,
  SimulationFixture,
  SimulationExpected,
  SimulationReviewedExpected,
  SimulationVariant
> = {
  parseCapture: (input) => SimulationCaptureSchema.parse(input),
  parseFixture: (input) => SimulationFixtureSchema.parse(input),
  normalizeCapture: normalizeSimulationCapture,
  describeCapture: (capture) => ({
    simulationId: capture.simulationId,
    sourceStatus: capture.source.status,
    sourceFingerprint: capture.source.fingerprint,
    warnings: capture.warnings,
    turnCount: capture.turns.length,
    eventCount: capture.observed.events.length,
    observed: capture.observed,
  }),
  reviewedExpected: reviewedSimulationExpected,
  variants: (capture) => defaultVariants(capture.source.status),
  buildFixture: (capture, accepted, variants) =>
    SimulationFixtureSchema.parse({
      schemaVersion: 1,
      stage: 'approved',
      simulationId: capture.simulationId,
      title: capture.title,
      source: {
        status: capture.source.status,
        cutoffSequence: capture.source.cutoffSequence,
        fingerprint: capture.source.fingerprint,
      },
      setup: capture.setup,
      turns: capture.turns,
      controls: capture.controls,
      expected: reviewedSimulationExpected(accepted),
      variants,
      browser: false,
    }),
  describeFixture: (fixture) => ({
    sourceFingerprint: fixture.source.fingerprint,
    expected: fixture.expected,
    variants: fixture.variants,
  }),
  scanSecrets: scanSimulationSecrets,
  sameExpected: (left, right) => JSON.stringify(left) === JSON.stringify(right),
}

export class SimulationWorkflowError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'SimulationWorkflowError'
  }
}

export async function reviewSimulationCandidate(config: WorkflowConfig, idValue: string) {
  const id = SimulationIdSchema.parse(idValue)
  const result = await translate(() => workflow(config).reviewCandidate(id))
  return legacyReview(result)
}

export async function approveSimulationCandidate(
  config: WorkflowConfig,
  idValue: string,
  options: SimulationApprovalRequest,
) {
  const id = SimulationIdSchema.parse(idValue)
  const result = await translate(() => workflow(config).approveCandidate(id, options))
  return SimulationApprovalResultSchema.parse(result)
}

export function readSimulationCandidate(
  config: WorkflowConfig,
  idValue: string,
): Promise<SimulationCapture> {
  return workflow(config).readCandidate(SimulationIdSchema.parse(idValue))
}

function workflow(config: WorkflowConfig) {
  return new AdaptedSimulationWorkflow({
    projectRoot: config.projectRoot,
    candidateDirectory: resolve(config.dataDirectory, 'simulations', 'inbox'),
    fixtureDirectory: resolve(config.projectRoot, 'apps/server/tests/fixtures/simulations'),
    reviewVariant: 'recorded' as const,
    adapter,
    runners: [
      {
        id: 'runner-engine',
        run: async (input, variant) => ({
          ...runEngineSimulation(input, variant),
          runnerId: 'runner-engine',
        }),
      },
      {
        id: 'runner-orchestration',
        run: async (input, variant) => ({
          ...(await runOrchestrationSimulation(input, {
            projectRoot: config.projectRoot,
            variant,
          })),
          runnerId: 'runner-orchestration',
        }),
      },
    ],
  })
}

function legacyReview(result: AdaptedSimulationReviewResult) {
  const engine = result.runners.find((runner) => runner.runnerId === 'runner-engine')
  const orchestration = result.runners.find((runner) => runner.runnerId === 'runner-orchestration')
  if (!engine || !orchestration) throw new SimulationWorkflowError('Missing simulation runner')
  return SimulationReviewResultSchema.parse({
    simulationId: result.simulationId,
    relativePath: result.relativePath,
    sourceStatus: result.sourceStatus,
    turns: result.turns,
    events: result.events,
    deterministic: engine.deterministic,
    replayOk: engine.ok,
    orchestrationDeterministic: orchestration.deterministic,
    orchestrationOk: orchestration.ok,
    runnersAgree: result.runnersAgree,
    canApprove: result.canApprove,
    canAcceptCurrent: result.canAcceptCurrent,
    failures: result.failures,
    warnings: result.warnings,
    secretWarnings: result.secretWarnings,
  })
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

async function translate<Value>(operation: () => Promise<Value>): Promise<Value> {
  try {
    return await operation()
  } catch (error) {
    if (!(error instanceof AdaptedSimulationWorkflowError)) throw error
    throw new SimulationWorkflowError(legacyMessage(error))
  }
}

function legacyMessage(error: AdaptedSimulationWorkflowError): string {
  switch (error.code) {
    case 'warning-acknowledgement':
      return 'Capture warnings must be acknowledged before approval'
    case 'observed-mismatch':
      return 'Captured behavior differs from the current implementation'
    case 'runner-rejection':
      return 'Current engine and orchestration results cannot be accepted'
    default:
      return error.message
  }
}
