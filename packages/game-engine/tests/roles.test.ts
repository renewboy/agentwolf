import { describe, expect, it } from 'vitest'
import {
  createV1RoleRegistry,
  guardBoard,
  standardBoard,
  v1AbilityIds,
  type GameState,
} from '../src/index.js'
import { actorsWithRole, createManualEngine } from './helpers.js'

describe('V1 role abilities', () => {
  it('enforces Guard consecutive-target memory', () => {
    const engine = createManualEngine(guardBoard)
    const registry = createV1RoleRegistry()
    const guardId = actorsWithRole(engine, 'role-guard')[0]!
    const targetId = actorsWithRole(engine, 'role-villager')[0]!
    const actor = engine.state.players.get(guardId)!
    const action = {
      type: 'night-action' as const,
      matchId: engine.state.matchId,
      actorId: guardId,
      abilityId: v1AbilityIds.guardProtect,
      targetIds: [targetId],
    }
    const ability = registry.ability(v1AbilityIds.guardProtect).ability
    expect(ability.effects({ state: engine.state, board: guardBoard, action, actor })).toEqual([
      {
        kind: 'protect',
        priority: 300,
        sourceId: guardId,
        targetId,
        protection: 'guard',
        blocks: ['werewolf'],
      },
    ])
    const repeatedState: GameState = {
      ...engine.state,
      players: new Map(engine.state.players).set(guardId, {
        ...actor,
        roleState: { ...actor.roleState, memory: { 'guard.lastTarget': targetId } },
      }),
    }
    expect(() =>
      ability.validate({
        state: repeatedState,
        board: guardBoard,
        action,
        actor: repeatedState.players.get(guardId)!,
      }),
    ).toThrow(/consecutive/)
  })

  it('limits Witch antidote and poison behavior', () => {
    const engine = createManualEngine(standardBoard)
    const registry = createV1RoleRegistry()
    const witchId = actorsWithRole(engine, 'role-witch')[0]!
    const targetId = actorsWithRole(engine, 'role-villager')[0]!
    const actor = engine.state.players.get(witchId)!
    const attacked: GameState = { ...engine.state, nightAttackTargetId: targetId }
    const antidote = registry.ability(v1AbilityIds.witchAntidote).ability
    const antidoteAction = {
      type: 'night-action' as const,
      matchId: engine.state.matchId,
      actorId: witchId,
      abilityId: v1AbilityIds.witchAntidote,
      targetIds: [targetId],
    }
    expect(() =>
      antidote.validate({ state: attacked, board: standardBoard, action: antidoteAction, actor }),
    ).not.toThrow()
    expect(
      antidote.effects({ state: attacked, board: standardBoard, action: antidoteAction, actor })[0]
        ?.kind,
    ).toBe('protect')

    const selfAttacked: GameState = { ...engine.state, nightAttackTargetId: witchId }
    expect(() =>
      antidote.validate({
        state: selfAttacked,
        board: standardBoard,
        action: { ...antidoteAction, targetIds: [witchId] },
        actor,
      }),
    ).toThrow(/cannot save herself/)

    const poison = registry.ability(v1AbilityIds.witchPoison).ability
    expect(
      poison.effects({
        state: engine.state,
        board: standardBoard,
        action: { ...antidoteAction, abilityId: v1AbilityIds.witchPoison },
        actor,
      })[0],
    ).toMatchObject({ cause: 'poison' })
  })

  it('allows Hunter shot only for eligible death causes', () => {
    const engine = createManualEngine(standardBoard)
    const registry = createV1RoleRegistry()
    const hunterId = actorsWithRole(engine, 'role-hunter')[0]!
    const targetId = actorsWithRole(engine, 'role-werewolf')[0]!
    const actor = engine.state.players.get(hunterId)!
    const action = {
      type: 'skill-trigger' as const,
      matchId: engine.state.matchId,
      actorId: hunterId,
      abilityId: v1AbilityIds.hunterShot,
      targetId,
    }
    const ability = registry.ability(v1AbilityIds.hunterShot).ability
    const eligible: GameState = {
      ...engine.state,
      recentDeaths: new Map([[hunterId, { playerId: hunterId, causes: ['werewolf'] }]]),
    }
    expect(() =>
      ability.validate({ state: eligible, board: standardBoard, action, actor }),
    ).not.toThrow()
    const poisoned: GameState = {
      ...engine.state,
      recentDeaths: new Map([[hunterId, { playerId: hunterId, causes: ['poison'] }]]),
    }
    expect(() =>
      ability.validate({ state: poisoned, board: standardBoard, action, actor }),
    ).toThrow(/only after/)
  })
})
