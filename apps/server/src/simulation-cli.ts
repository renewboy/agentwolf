import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { SimulationFixtureSchema, type SimulationFixture } from '@agentwolf/contracts'
import { scanSimulationSecrets } from './simulation-canonical.js'
import { runOrchestrationSimulation } from './simulation-orchestration.js'
import { runEngineSimulation } from './simulation-runner.js'
import { approveSimulationCandidate, reviewSimulationCandidate } from './simulation-workflow.js'

const [command, target, ...flags] = process.argv.slice(2).filter((value) => value !== '--')
const projectRoot = findProjectRoot(resolve(process.cwd()))
const workflowConfig = { dataDirectory: resolve(projectRoot, '.agentwolf'), projectRoot }

try {
  switch (command) {
    case 'review':
      await review(requireTarget(target))
      break
    case 'approve':
      await approve(requireTarget(target), new Set(flags))
      break
    case 'check':
      await checkCorpus()
      break
    default:
      throw new Error('Usage: simulation-cli <review|approve|check> [simulation-id]')
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}

async function review(idValue: string): Promise<void> {
  const result = await reviewSimulationCandidate(workflowConfig, idValue)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (!result.canApprove) process.exitCode = 1
}

async function approve(idValue: string, approvalFlags: ReadonlySet<string>): Promise<void> {
  const result = await approveSimulationCandidate(workflowConfig, idValue, {
    acceptCurrent: approvalFlags.has('--accept-current'),
    acknowledgeWarnings: approvalFlags.has('--acknowledge-warnings'),
  })
  process.stdout.write(`${resolve(projectRoot, result.relativePath)}\n`)
}

async function checkCorpus(): Promise<void> {
  const directory = resolve(projectRoot, 'apps/server/tests/fixtures/simulations')
  const names = existsSync(directory)
    ? (await readdir(directory)).filter((name) => name.endsWith('.sim.json')).sort()
    : []
  if (names.length === 0) throw new Error('Simulation corpus is empty')
  const failures: string[] = []
  for (const name of names) {
    const fixture = SimulationFixtureSchema.parse(
      JSON.parse(await readFile(resolve(directory, name), 'utf8')),
    )
    failures.push(...(await checkFixture(fixture)))
  }
  if (failures.length > 0) throw new Error(failures.join('\n'))
  process.stdout.write(`simulation corpus: ${names.length} fixture(s) ok\n`)
}

async function checkFixture(fixture: SimulationFixture): Promise<string[]> {
  const failures: string[] = []
  const secrets = scanSimulationSecrets(fixture)
  if (secrets.length > 0) failures.push(`${fixture.simulationId}: ${secrets.join(', ')}`)
  for (const variant of fixture.variants) {
    const first = runEngineSimulation(fixture, variant)
    const second = runEngineSimulation(fixture, variant)
    const orchestration = await runOrchestrationSimulation(fixture, { projectRoot, variant })
    const repeatedOrchestration = await runOrchestrationSimulation(fixture, {
      projectRoot,
      variant,
    })
    if (!first.ok) failures.push(`${fixture.simulationId}/${variant}: ${first.failures.join('; ')}`)
    if (!orchestration.ok) {
      failures.push(
        `${fixture.simulationId}/${variant}/orchestration: ${orchestration.failures.join('; ')}`,
      )
    }
    if (JSON.stringify(first.actual) !== JSON.stringify(second.actual)) {
      failures.push(`${fixture.simulationId}/${variant}: non-deterministic output`)
    }
    if (JSON.stringify(orchestration.actual) !== JSON.stringify(repeatedOrchestration.actual)) {
      failures.push(`${fixture.simulationId}/${variant}/orchestration: non-deterministic output`)
    }
  }
  return failures
}

function requireTarget(value: string | undefined): string {
  if (!value) throw new Error('A simulation ID is required')
  return value
}

function findProjectRoot(start: string): string {
  let current = start
  for (;;) {
    if (existsSync(resolve(current, 'pnpm-workspace.yaml'))) return current
    const parent = dirname(current)
    if (parent === current) throw new Error('AgentWolf project root was not found')
    current = parent
  }
}
