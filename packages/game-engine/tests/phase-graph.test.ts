import { describe, expect, it } from 'vitest'
import { PhaseIdSchema } from '@agentwolf/contracts'
import { classicPhaseGraph } from '../src/index.js'

describe('terminal phase priority', () => {
  it('skips first-day sheriff setup when night resolution already has a winner', () => {
    expect(edgeConditions('phase-night-resolve').slice(0, 2)).toEqual([
      'has-winner',
      'first-day-with-sheriff',
    ])
  })

  it.each(['phase-day-announcement', 'phase-death-triggers', 'phase-day-resolve'])(
    'settles death triggers, then ends before post-game actions in %s',
    (phaseId) => {
      const conditions = edgeConditions(phaseId)
      expect(conditions.indexOf('has-death-trigger')).toBeLessThan(conditions.indexOf('has-winner'))
      expect(conditions.indexOf('has-winner')).toBeLessThan(
        conditions.indexOf('dead-sheriff-holds-badge'),
      )
      expect(conditions.indexOf('has-winner')).toBeLessThan(conditions.indexOf('has-last-words'))
    },
  )
})

function edgeConditions(phaseId: string): Array<string | undefined> {
  const node = classicPhaseGraph.nodes.get(PhaseIdSchema.parse(phaseId))
  if (!node) throw new Error(`Missing phase ${phaseId}`)
  return node.edges.map((edge) => edge.when)
}
