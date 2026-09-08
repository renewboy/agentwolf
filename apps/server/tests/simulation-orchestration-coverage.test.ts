import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { SimulationFixtureSchema } from '@agentwolf/contracts'
import { describe, expect, it, vi } from 'vitest'
import { runOrchestrationSimulation } from '../src/simulation-orchestration.js'

vi.mock('@agentwolf/assets/player-skills', async () => {
  const { linkPlayerSkills } = await import('./fixtures/linked-player-skills.js')
  return { ensurePlayerSkills: linkPlayerSkills }
})

const projectRoot = resolve(import.meta.dirname, '../../..')
const fixturePath = resolve(
  projectRoot,
  'apps/server/tests/fixtures/simulations/simulation-ended-5037b9bc12018d05.sim.json',
)

describe('simulation orchestration control coverage', () => {
  it('runs every orchestration variant against the compact fixture', async () => {
    const fixture = SimulationFixtureSchema.parse(JSON.parse(await readFile(fixturePath, 'utf8')))

    for (const variant of fixture.variants) {
      const report = await runOrchestrationSimulation(fixture, { projectRoot, variant })
      expect(report.failures, variant).toEqual([])
    }
  }, 20_000)
})
