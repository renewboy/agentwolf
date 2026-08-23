import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { SimulationFixtureSchema } from '@agentwolf/contracts'
import { describe, expect, it } from 'vitest'
import { scanSimulationSecrets } from '../src/simulation-canonical.js'
import { runOrchestrationSimulation } from '../src/simulation-orchestration.js'
import { runEngineSimulation } from '../src/simulation-runner.js'

const corpus = resolve('apps/server/tests/fixtures/simulations')
const projectRoot = resolve(import.meta.dirname, '../../..')

describe('approved simulation corpus', () => {
  it('is non-empty, sanitized, deterministic, and compatible with current behavior', async () => {
    const names = existsSync(corpus)
      ? (await readdir(corpus)).filter((name) => name.endsWith('.sim.json')).sort()
      : []
    expect(names.length).toBeGreaterThan(0)

    for (const name of names) {
      const fixture = SimulationFixtureSchema.parse(
        JSON.parse(await readFile(resolve(corpus, name), 'utf8')),
      )
      expect(scanSimulationSecrets(fixture), name).toEqual([])
      for (const variant of fixture.variants) {
        const first = runEngineSimulation(fixture, variant)
        const second = runEngineSimulation(fixture, variant)
        const orchestration = await runOrchestrationSimulation(fixture, {
          projectRoot,
          variant,
        })
        const repeatedOrchestration = await runOrchestrationSimulation(fixture, {
          projectRoot,
          variant,
        })
        expect(first.failures, `${name}/${variant}`).toEqual([])
        expect(first.actual, `${name}/${variant}`).toEqual(second.actual)
        expect(orchestration.failures, `${name}/${variant}/orchestration`).toEqual([])
        expect(orchestration.actual, `${name}/${variant}/orchestration`).toEqual(
          repeatedOrchestration.actual,
        )
      }
    }
  }, 180_000)
})
