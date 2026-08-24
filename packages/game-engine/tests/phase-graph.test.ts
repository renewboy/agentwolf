import { describe, expect, it } from 'vitest'
import { PhaseIdSchema } from '@agentwolf/contracts'
import { createClassicRuleset, expectedVoteKind, phaseSpeechKind } from '../src/index.js'

const classicPhaseGraph = createClassicRuleset().phases

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

describe('phase action semantics', () => {
  it('declares an action contract for every interactive phase', () => {
    for (const node of classicPhaseGraph.nodes.values()) {
      if (node.mode === 'automatic') {
        expect(node.action, node.id).toBeUndefined()
      } else {
        expect(node.action, node.id).toBeDefined()
      }
    }
  })

  it('keeps speech and vote kinds stable when a phase ID changes', () => {
    const runoffSpeech = phaseNode('phase-sheriff-runoff-speech')
    const wolfVote = phaseNode('phase-night-wolf-vote')

    expect(
      phaseSpeechKind({
        ...runoffSpeech,
        id: PhaseIdSchema.parse('phase-renamed-candidate-rebuttal'),
      }),
    ).toBe('runoff')
    expect(
      expectedVoteKind({
        ...wolfVote,
        id: PhaseIdSchema.parse('phase-renamed-private-ballot'),
      }),
    ).toBe('wolf-kill')
  })

  it('allows self-destruct only in declared living Werewolf phases', () => {
    expect(phaseNode('phase-sheriff-signup').interrupts?.[0]?.context).toBe('sheriff-election')
    expect(phaseNode('phase-day-vote').interrupts?.[0]?.context).toBe('daytime')
    expect(phaseNode('phase-sheriff-transfer').interrupts).toBeUndefined()
    expect(phaseNode('phase-death-triggers').interrupts).toBeUndefined()
  })

  it('models badge transfer as a Sheriff tool action', () => {
    expect(phaseNode('phase-sheriff-transfer').action).toEqual({
      type: 'sheriff-action',
      actions: ['transfer', 'destroy-badge'],
      visibility: 'public',
    })
  })
})

function edgeConditions(phaseId: string): Array<string | undefined> {
  return phaseNode(phaseId).edges.map((edge) => edge.when)
}

function phaseNode(phaseId: string) {
  const node = classicPhaseGraph.nodes.get(PhaseIdSchema.parse(phaseId))
  if (!node) throw new Error(`Missing phase ${phaseId}`)
  return node
}
