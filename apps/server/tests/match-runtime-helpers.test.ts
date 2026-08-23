import {
  AgentProfileIdSchema,
  AbilityIdSchema,
  MatchIdSchema,
  PhaseIdSchema,
  PlayerIdSchema,
} from '@agentwolf/contracts'
import {
  GameEngine,
  createV1RoleRegistry,
  sixPlayerBoard,
  type TurnDescriptor,
} from '@agentwolf/game-engine'
import { describe, expect, it } from 'vitest'
import { promptContractVersion } from '../src/context-renderer.js'
import { actionInstructionFor, interruptAbilityExpectation } from '../src/match-runtime-helpers.js'

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
    expect(promptContractVersion).toBeGreaterThanOrEqual(9)
    expect(instruction).toContain('`player-2`')
    expect(instruction).not.toContain('`player-6`')

    const werewolfSpeech = actionInstructionFor(
      { ...campaign, phaseId: PhaseIdSchema.parse('phase-day-speech'), speechKind: 'day' },
      { board: sixPlayerBoard, state: engine.state, playerId: actorId },
    )
    expect(werewolfSpeech).toContain('ability-werewolf-self-destruct')

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
    expect(interruptAbilityExpectation(engine.state, actorId, wolfCouncil)).toEqual({})
    expect(
      interruptAbilityExpectation(engine.state, actorId, {
        ...campaign,
        phaseId: PhaseIdSchema.parse('phase-day-speech'),
      }),
    ).toEqual({ interruptAbilityIds: ['ability-werewolf-self-destruct'] })
  })
})
