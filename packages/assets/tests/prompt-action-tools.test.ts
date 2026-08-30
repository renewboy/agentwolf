import { PhaseIdSchema } from '@agentwolf/contracts'
import { describe, expect, it } from 'vitest'
import { actionToolNamesFor } from '../src/prompts/action-tools.js'
import type { PromptTurnFact } from '../src/prompts/facts.js'

const baseTurn = {
  phaseId: PhaseIdSchema.parse('phase-action-tool-test'),
  allowedAbilityIds: [],
  passAllowed: true,
  interruptAbilityIds: [],
  interruptWindow: false,
  sheriffActions: [],
} satisfies Omit<PromptTurnFact, 'actionType'>

describe('Prompt action tool names', () => {
  it('maps every action boundary to its formal MCP tool name', () => {
    expect(actionToolNamesFor({ ...baseTurn, actionType: 'speech' })).toEqual([])
    expect(actionToolNamesFor({ ...baseTurn, actionType: 'vote' })).toEqual(['submit_vote'])
    expect(actionToolNamesFor({ ...baseTurn, actionType: 'night-action' })).toEqual([
      'submit_night_action',
    ])
    expect(actionToolNamesFor({ ...baseTurn, actionType: 'sheriff-action' })).toEqual([
      'submit_sheriff_action',
    ])
    expect(actionToolNamesFor({ ...baseTurn, actionType: 'skill-trigger' })).toEqual([
      'trigger_skill',
      'pass_skill',
    ])
    expect(
      actionToolNamesFor({ ...baseTurn, actionType: 'skill-trigger', passAllowed: false }),
    ).toEqual(['trigger_skill'])
    expect(() =>
      actionToolNamesFor({ ...baseTurn, actionType: 'unknown-action' } as never),
    ).toThrow('Unknown Prompt action type unknown-action')
  })
})
