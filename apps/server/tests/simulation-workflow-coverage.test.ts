import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import {
  SimulationCaptureSchema,
  SimulationFixtureSchema,
  type SimulationCapture,
} from '@agentwolf/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  engine: vi.fn(),
  orchestration: vi.fn(),
}))

vi.mock('../src/simulation-runner.js', () => ({ runEngineSimulation: mocks.engine }))
vi.mock('../src/simulation-orchestration.js', () => ({
  runOrchestrationSimulation: mocks.orchestration,
}))

import {
  SimulationWorkflowError,
  approveSimulationCandidate,
  reviewSimulationCandidate,
} from '../src/simulation-workflow.js'

const roots: string[] = []

beforeEach(() => {
  mocks.engine.mockImplementation((capture: SimulationCapture) => report(capture, true))
  mocks.orchestration.mockImplementation(async (capture: SimulationCapture) =>
    report(capture, true),
  )
})

afterEach(async () => {
  vi.clearAllMocks()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('simulation workflow approval gates', () => {
  it('requires warning acknowledgement, emits ended variants, and reuses identical fixtures', async () => {
    const fixture = await workflowFixture('simulation-workflow-warning', {
      status: 'ended',
      warnings: ['manual warning'],
    })
    expect(
      await reviewSimulationCandidate(fixture.config, fixture.capture.simulationId),
    ).toMatchObject({
      canApprove: true,
      warnings: ['manual warning'],
    })
    await expect(
      approveSimulationCandidate(fixture.config, fixture.capture.simulationId, {
        acknowledgeWarnings: false,
        acceptCurrent: false,
      }),
    ).rejects.toThrow(/must be acknowledged/)
    const approved = await approveSimulationCandidate(
      fixture.config,
      fixture.capture.simulationId,
      { acknowledgeWarnings: true, acceptCurrent: false },
    )
    expect(approved.created).toBe(true)
    expect(approved.variants).toHaveLength(8)
    await expect(
      approveSimulationCandidate(fixture.config, fixture.capture.simulationId, {
        acknowledgeWarnings: true,
        acceptCurrent: false,
      }),
    ).resolves.toMatchObject({ created: false, variants: approved.variants })
  })

  it('rejects secret-bearing candidates before all other approval choices', async () => {
    const fixture = await workflowFixture('simulation-workflow-secret', {
      title: 'Bearer abcdefghijklmnop',
    })
    await expect(
      approveSimulationCandidate(fixture.config, fixture.capture.simulationId, {
        acknowledgeWarnings: true,
        acceptCurrent: true,
      }),
    ).rejects.toThrow(/sensitive content/)
  })

  it('allows explicit acceptance of deterministic current failures but rejects disagreement', async () => {
    const failing = await workflowFixture('simulation-workflow-current')
    mocks.engine.mockImplementation((capture: SimulationCapture) => report(capture, false))
    mocks.orchestration.mockImplementation(async (capture: SimulationCapture) =>
      report(capture, false),
    )
    await expect(
      approveSimulationCandidate(failing.config, failing.capture.simulationId, {
        acknowledgeWarnings: true,
        acceptCurrent: false,
      }),
    ).rejects.toThrow(/differs from the current implementation/)
    await expect(
      approveSimulationCandidate(failing.config, failing.capture.simulationId, {
        acknowledgeWarnings: true,
        acceptCurrent: true,
      }),
    ).resolves.toMatchObject({ created: true })

    const disagreement = await workflowFixture('simulation-workflow-disagreement')
    mocks.engine.mockImplementation((capture: SimulationCapture) => report(capture, true))
    mocks.orchestration.mockImplementation(async (capture: SimulationCapture) => ({
      ...report(capture, true),
      actual: {
        ...capture.observed,
        checkpoint: { ...capture.observed.checkpoint, day: capture.observed.checkpoint.day + 1 },
      },
    }))
    await expect(
      approveSimulationCandidate(disagreement.config, disagreement.capture.simulationId, {
        acknowledgeWarnings: true,
        acceptCurrent: true,
      }),
    ).rejects.toThrow(/cannot be accepted/)
  })

  it('rejects an approved ID when a later candidate has a different fingerprint', async () => {
    const fixture = await workflowFixture('simulation-workflow-collision')
    await approveSimulationCandidate(fixture.config, fixture.capture.simulationId, {
      acknowledgeWarnings: true,
      acceptCurrent: false,
    })
    const changed = SimulationCaptureSchema.parse({
      ...fixture.capture,
      source: { ...fixture.capture.source, fingerprint: 'b'.repeat(64) },
    })
    await writeCandidate(fixture.config.dataDirectory, changed)
    await expect(
      approveSimulationCandidate(fixture.config, changed.simulationId, {
        acknowledgeWarnings: true,
        acceptCurrent: false,
      }),
    ).rejects.toThrow(/contains other data/)
    expect(new SimulationWorkflowError('workflow').name).toBe('SimulationWorkflowError')
  })
})

async function workflowFixture(
  simulationId: string,
  overrides: { status?: 'paused' | 'ended'; warnings?: string[]; title?: string } = {},
) {
  const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-workflow-coverage-'))
  roots.push(root)
  const approved = SimulationFixtureSchema.parse(
    JSON.parse(
      await readFile(
        resolve(
          process.cwd(),
          'apps/server/tests/fixtures/simulations/simulation-paused-1a31f4c2b478f897.sim.json',
        ),
        'utf8',
      ),
    ),
  )
  const capture = SimulationCaptureSchema.parse({
    schemaVersion: 1,
    stage: 'candidate',
    simulationId,
    title: overrides.title ?? 'Workflow coverage',
    source: {
      matchId: 'match-workflow-coverage',
      status: overrides.status ?? 'paused',
      cutoffSequence: approved.source.cutoffSequence,
      capturedAt: '2026-08-28T00:00:00.000Z',
      fingerprint: 'a'.repeat(64),
    },
    setup: approved.setup,
    turns: [],
    controls: [],
    observed: { events: [], checkpoint: approved.expected.checkpoint },
    warnings: overrides.warnings ?? [],
  })
  const config = {
    dataDirectory: resolve(root, '.agentwolf'),
    projectRoot: root,
  }
  await writeCandidate(config.dataDirectory, capture)
  return { config, capture }
}

async function writeCandidate(dataDirectory: string, capture: SimulationCapture): Promise<void> {
  const directory = resolve(dataDirectory, 'simulations', 'inbox')
  await mkdir(directory, { recursive: true })
  await writeFile(
    resolve(directory, `${capture.simulationId}.sim.json`),
    `${JSON.stringify(capture, null, 2)}\n`,
  )
}

function report(capture: SimulationCapture, ok: boolean) {
  return {
    simulationId: capture.simulationId,
    variant: 'recorded',
    seed: '0'.repeat(16),
    ok,
    failures: ok ? [] : ['current failure'],
    actual: capture.observed,
  }
}
