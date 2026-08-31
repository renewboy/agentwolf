import {
  AgentProfileIdSchema,
  MatchIdSchema,
  PlayerIdSchema,
  RoleCardIdSchema,
  RoleIdSchema,
} from '@agentwolf/contracts'
import {
  GameEngine,
  createClassicRuleset,
  thiefAbilityIds,
  thiefCupidBoard,
} from '@agentwolf/game-engine'
import { describe, expect, it } from 'vitest'
import { ActionMailbox } from '../src/action-mailbox.js'

describe('Thief action gateway', () => {
  it('exposes only selectable reserve cards and accepts a correction in the same turn', () => {
    const roleIds = [
      'role-werewolf',
      'role-werewolf',
      'role-villager',
      'role-villager',
      'role-villager',
      'role-villager',
      'role-seer',
      'role-witch',
      'role-hunter',
      'role-idiot',
      'role-cupid',
      'role-thief',
    ].map((roleId) => RoleIdSchema.parse(roleId))
    const engine = GameEngine.create({
      matchId: MatchIdSchema.parse('match-thief-action-gateway'),
      board: thiefCupidBoard,
      players: roleIds.map((roleId, index) => ({
        id: PlayerIdSchema.parse(`player-${index + 1}`),
        seat: index + 1,
        name: `Thief gateway ${index + 1}`,
        profileId: AgentProfileIdSchema.parse(`profile-thief-gateway-${index + 1}`),
        roleId,
      })),
      roleAssignment: 'manual',
      manualReserveRoleIds: [
        RoleIdSchema.parse('role-werewolf'),
        RoleIdSchema.parse('role-villager'),
      ],
      seed: 1,
      ruleset: createClassicRuleset(),
    })
    engine.start()
    const thiefId = [...engine.state.players.values()].find(
      (player) => player.roleId === 'role-thief',
    )!.id
    const choices = engine.roleCardChoicesFor(thiefId)
    const mailbox = new ActionMailbox()
    const token = mailbox.issueToken(engine.state.matchId, thiefId)
    mailbox.expect({
      matchId: engine.state.matchId,
      playerId: thiefId,
      actionType: 'night-action',
      allowedAbilityIds: [thiefAbilityIds.chooseCard],
      roleCardChoices: choices.map((choice) => ({ ...choice, label: String(choice.roleId) })),
      validate: (action) => engine.validateAction(action),
    })

    expect(() =>
      mailbox.submitNightAction(
        token,
        thiefAbilityIds.chooseCard,
        [],
        undefined,
        RoleCardIdSchema.parse('role-card-r02'),
      ),
    ).toThrow('unavailable')
    expect(
      mailbox.submitNightAction(
        token,
        thiefAbilityIds.chooseCard,
        [],
        undefined,
        RoleCardIdSchema.parse('role-card-r01'),
      ),
    ).toMatchObject({ accepted: true })
    expect(mailbox.take(engine.state.matchId, thiefId)).toMatchObject({
      type: 'night-action',
      roleCardId: 'role-card-r01',
      targetIds: [],
    })
  })
})
