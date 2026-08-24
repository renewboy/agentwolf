import {
  AgentProfileIdSchema,
  AbilityIdSchema,
  MatchIdSchema,
  PhaseIdSchema,
  PlayerIdSchema,
} from '@agentwolf/contracts'
import { getCopy } from '@agentwolf/assets'
import {
  GameEngine,
  createV1RoleRegistry,
  sixPlayerBoard,
  standardBoard,
  v1AbilityIds,
  type TurnDescriptor,
} from '@agentwolf/game-engine'
import { describe, expect, it } from 'vitest'
import { promptContractVersion } from '../src/context-renderer.js'
import {
  actionInstructionFor,
  interruptAbilityExpectation,
  promptAssetFor,
} from '../src/match-runtime-helpers.js'

describe('model action instructions', () => {
  it('binds campaign privacy and live skill targets to the current prompt contract', () => {
    const campaign: TurnDescriptor = {
      phaseId: PhaseIdSchema.parse('phase-sheriff-speech'),
      labelKey: 'phases.sheriffSpeech',
      mode: 'sequential',
      actionType: 'speech',
      actors: [PlayerIdSchema.parse('player-1')],
      speechKind: 'sheriff',
    }
    expect(actionInstructionFor(campaign)).toContain('个人声明')
    expect(actionInstructionFor(campaign)).toContain('不可改写的公开事实')
    expect(actionInstructionFor(campaign, undefined, 7)).not.toContain('不可改写的公开事实')

    const roles = sixPlayerBoard.roles.flatMap(({ roleId, count }) =>
      Array.from({ length: count }, () => roleId),
    )
    const engine = GameEngine.create({
      matchId: MatchIdSchema.parse('match-action-instructions'),
      board: sixPlayerBoard,
      roleAssignment: 'manual',
      seed: 1,
      roles: createV1RoleRegistry(),
      players: roles.map((roleId, index) => ({
        id: PlayerIdSchema.parse(`player-${index + 1}`),
        seat: index + 1,
        name: `Instruction player ${index + 1}`,
        profileId: AgentProfileIdSchema.parse(`profile-instruction-${index + 1}`),
        roleId,
      })),
    })
    const actorId = PlayerIdSchema.parse('player-1')
    const deadId = PlayerIdSchema.parse('player-6')
    const state = {
      ...engine.state,
      players: new Map(engine.state.players).set(deadId, {
        ...engine.state.players.get(deadId)!,
        alive: false,
      }),
    }
    const transfer: TurnDescriptor = {
      phaseId: PhaseIdSchema.parse('phase-sheriff-transfer'),
      labelKey: 'phases.sheriffTransfer',
      mode: 'parallel',
      actionType: 'skill-trigger',
      actors: [actorId],
      allowedAbilityIds: [AbilityIdSchema.parse('ability-sheriff-transfer')],
    }
    const instruction = actionInstructionFor(transfer, {
      board: sixPlayerBoard,
      state,
      playerId: actorId,
    })
    expect(promptContractVersion).toBeGreaterThanOrEqual(17)
    expect(instruction).toContain('`player-2`')
    expect(instruction).not.toContain('`player-6`')

    const daySpeech: TurnDescriptor = {
      ...campaign,
      phaseId: PhaseIdSchema.parse('phase-day-speech'),
      speechKind: 'day',
      interruptAbilityIds: [v1AbilityIds.werewolfSelfDestruct],
    }
    const werewolfSpeech = actionInstructionFor(daySpeech, {
      board: sixPlayerBoard,
      state: engine.state,
      playerId: actorId,
      speechCharacterLimit: 360,
    })
    expect(werewolfSpeech).toContain('ability-werewolf-self-destruct')
    expect(werewolfSpeech).toContain('360 字以内')
    expect(
      actionInstructionFor(
        daySpeech,
        {
          board: sixPlayerBoard,
          state: engine.state,
          playerId: actorId,
          speechCharacterLimit: 360,
        },
        14,
      ),
    ).not.toContain('360 字以内')

    const wolfCouncil: TurnDescriptor = {
      ...campaign,
      phaseId: PhaseIdSchema.parse('phase-night-wolf-council'),
      speechKind: 'wolf-council',
    }
    const councilInstruction = actionInstructionFor(wolfCouncil, {
      board: sixPlayerBoard,
      state: engine.state,
      playerId: actorId,
    })
    expect(councilInstruction).toContain('不调用任何行动工具')
    expect(councilInstruction).not.toContain('ability-werewolf-self-destruct')
    const wolfKill: TurnDescriptor = {
      phaseId: PhaseIdSchema.parse('phase-night-wolf-vote'),
      labelKey: 'phases.nightWolfVote',
      mode: 'parallel',
      actionType: 'vote',
      actors: [actorId],
      voteKind: 'wolf-kill',
    }
    const wolfKillInstruction = actionInstructionFor(wolfKill, {
      board: sixPlayerBoard,
      state: engine.state,
      playerId: actorId,
    })
    expect(wolfKillInstruction).toContain('submit_night_action')
    expect(wolfKillInstruction).toContain('不得')
    expect(actionInstructionFor(wolfKill, undefined, 12)).toBe('')
    expect(interruptAbilityExpectation(engine.state, actorId, wolfCouncil)).toEqual({})
    expect(interruptAbilityExpectation(engine.state, actorId, daySpeech)).toEqual({
      interruptAbilityIds: ['ability-werewolf-self-destruct'],
    })
    expect(interruptAbilityExpectation(engine.state, actorId, transfer)).toEqual({})
  })

  it('hides every death target from a Witch after the antidote is unavailable', () => {
    const roles = standardBoard.roles.flatMap(({ roleId, count }) =>
      Array.from({ length: count }, () => roleId),
    )
    const engine = GameEngine.create({
      matchId: MatchIdSchema.parse('match-witch-information'),
      board: standardBoard,
      roleAssignment: 'manual',
      seed: 2,
      roles: createV1RoleRegistry(),
      players: roles.map((roleId, index) => ({
        id: PlayerIdSchema.parse(`player-${index + 1}`),
        seat: index + 1,
        name: `Witch information player ${index + 1}`,
        profileId: AgentProfileIdSchema.parse(`profile-witch-information-${index + 1}`),
        roleId,
      })),
    })
    const witch = [...engine.state.players.values()].find(
      (player) => player.roleId === 'role-witch',
    )!
    const target = [...engine.state.players.values()].find(
      (player) => player.roleId === 'role-villager',
    )!
    const turn: TurnDescriptor = {
      phaseId: PhaseIdSchema.parse('phase-night-witch'),
      labelKey: 'phases.nightWitch',
      mode: 'parallel',
      actionType: 'night-action',
      actors: [witch.id],
      allowedAbilityIds: [v1AbilityIds.witchAntidote, v1AbilityIds.witchPoison],
    }
    const availableState = { ...engine.state, nightAttackTargetId: target.id }
    expect(
      actionInstructionFor(turn, {
        board: standardBoard,
        state: availableState,
        playerId: witch.id,
      }),
    ).toContain(`\`${target.id}\``)

    const unavailableState = {
      ...availableState,
      players: new Map(availableState.players).set(witch.id, {
        ...witch,
        roleState: {
          ...witch.roleState,
          abilityUses: { ...witch.roleState.abilityUses, [v1AbilityIds.witchAntidote]: 1 },
        },
      }),
    }
    const instruction = actionInstructionFor(turn, {
      board: standardBoard,
      state: unavailableState,
      playerId: witch.id,
    })
    expect(instruction).toContain(getCopy('promptActions.nightWitchAntidoteUnavailable'))
    expect(instruction).not.toContain(target.id)
    expect(instruction).not.toContain('当前狼人袭击目标')

    const legacy = actionInstructionFor(
      turn,
      { board: standardBoard, state: unavailableState, playerId: witch.id },
      10,
    )
    expect(legacy).toContain(`\`${target.id}\``)
  })

  it('explains dead-side and Sheriff-side speech choices from the current morning state', () => {
    const roles = standardBoard.roles.flatMap(({ roleId, count }) =>
      Array.from({ length: count }, () => roleId),
    )
    const engine = GameEngine.create({
      matchId: MatchIdSchema.parse('match-speech-order-instructions'),
      board: standardBoard,
      roleAssignment: 'manual',
      seed: 3,
      roles: createV1RoleRegistry(),
      players: roles.map((roleId, index) => ({
        id: PlayerIdSchema.parse(`player-${index + 1}`),
        seat: index + 1,
        name: `Speech order player ${index + 1}`,
        profileId: AgentProfileIdSchema.parse(`profile-speech-order-${index + 1}`),
        roleId,
      })),
    })
    const sheriff = engine.state.players.get(PlayerIdSchema.parse('player-1'))!
    const firstDeath = engine.state.players.get(PlayerIdSchema.parse('player-4'))!
    const secondDeath = engine.state.players.get(PlayerIdSchema.parse('player-5'))!
    const turn: TurnDescriptor = {
      phaseId: PhaseIdSchema.parse('phase-day-speech-order'),
      labelKey: 'phases.daySpeechOrder',
      mode: 'parallel',
      actionType: 'sheriff-action',
      actors: [sheriff.id],
    }
    expect(promptAssetFor(turn)).toBe('speech-order-turn')
    expect(promptAssetFor(turn, 13)).toBe('sheriff-turn')
    const singleDeathState = {
      ...engine.state,
      day: 1,
      sheriff: { ...engine.state.sheriff, holderId: sheriff.id },
      players: new Map(engine.state.players).set(firstDeath.id, {
        ...firstDeath,
        alive: false,
      }),
      recentDeaths: new Map([[firstDeath.id, { playerId: firstDeath.id, causes: ['werewolf'] }]]),
    }
    const single = actionInstructionFor(turn, {
      board: standardBoard,
      state: singleDeathState,
      playerId: sheriff.id,
    })
    expect(single).toContain('死左')
    expect(single).toContain('死右')
    expect(single).toContain('speech-counterclockwise')
    expect(single).toContain('speech-clockwise')
    expect(single).toContain('警长最后总结归票')
    expect(single).toContain(firstDeath.name)

    const peaceful = actionInstructionFor(turn, {
      board: standardBoard,
      state: {
        ...singleDeathState,
        players: engine.state.players,
        recentDeaths: new Map(),
      },
      playerId: sheriff.id,
    })
    expect(peaceful).toContain('平安夜')
    expect(peaceful).toContain('警左')
    expect(peaceful).toContain('警右')

    const multiple = actionInstructionFor(turn, {
      board: standardBoard,
      state: {
        ...singleDeathState,
        players: new Map(singleDeathState.players).set(secondDeath.id, {
          ...secondDeath,
          alive: false,
        }),
        recentDeaths: new Map([
          [firstDeath.id, { playerId: firstDeath.id, causes: ['werewolf'] }],
          [secondDeath.id, { playerId: secondDeath.id, causes: ['poison'] }],
        ]),
      },
      playerId: sheriff.id,
    })
    expect(multiple).toContain('有 2 名玩家死亡')
    expect(multiple).toContain('警左')
    expect(actionInstructionFor(turn, undefined, 13)).toBe('')
  })
})
