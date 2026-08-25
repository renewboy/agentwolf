import {
  AgentProfileIdSchema,
  MatchIdSchema,
  PhaseIdSchema,
  PlayerIdSchema,
} from '@agentwolf/contracts'
import {
  GameEngine,
  createClassicRuleset,
  v1AbilityIds,
  whiteWolfAbilityIds,
  whiteWolfKingBoard,
  type TurnDescriptor,
} from '@agentwolf/game-engine'
import { describe, expect, it } from 'vitest'
import {
  hasUncertainDelivery,
  interruptAbilityExpectation,
  settleActions,
} from '../src/match-runtime-helpers.js'
import { AcpDeliveryUncertainError } from '@agentwolf/acp'

describe('match runtime helpers', () => {
  it('derives public interrupts from registered actor capabilities', () => {
    const ruleset = createClassicRuleset()
    const roleIds = whiteWolfKingBoard.roles.flatMap(({ roleId, count }) =>
      Array.from({ length: count }, () => roleId),
    )
    const engine = GameEngine.create({
      matchId: MatchIdSchema.parse('match-white-wolf-instructions'),
      board: whiteWolfKingBoard,
      ruleset,
      roleAssignment: 'manual',
      seed: 1,
      players: roleIds.map((roleId, index) => ({
        id: PlayerIdSchema.parse(`player-${index + 1}`),
        seat: index + 1,
        name: `White Wolf instruction player ${index + 1}`,
        profileId: AgentProfileIdSchema.parse(`profile-white-wolf-${index + 1}`),
        roleId,
      })),
    })
    const actor = [...engine.state.players.values()].find(
      (player) => player.roleId === 'role-white-wolf-king',
    )!
    const turn: TurnDescriptor = {
      phaseId: PhaseIdSchema.parse('phase-day-speech'),
      labelKey: 'phases.daySpeech',
      mode: 'sequential',
      actionType: 'speech',
      actors: [actor.id],
      speechKind: 'day',
      interruptAbilityIds: [v1AbilityIds.werewolfSelfDestruct, whiteWolfAbilityIds.detonate],
    }
    expect(interruptAbilityExpectation(engine.state, actor.id, turn, ruleset.roles)).toEqual({
      interruptAbilityIds: [whiteWolfAbilityIds.detonate],
    })
  })

  it('recognizes nested uncertain delivery failures and preserves aggregate failures', async () => {
    expect(
      hasUncertainDelivery(
        new Error('outer', { cause: new AcpDeliveryUncertainError('uncertain transport') }),
      ),
    ).toBe(true)
    await expect(settleActions([Promise.reject(new Error('first'))])).rejects.toThrow(
      'One or more player turns failed',
    )
  })
})
