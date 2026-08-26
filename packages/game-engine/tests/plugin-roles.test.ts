import { describe, expect, it } from 'vitest'
import {
  awakenedHiddenWolfAbilityIds,
  GameEngine,
  createClassicRuleset,
  magicMirrorAbilityIds,
  magicMirrorInspectedEventType,
  mirrorHiddenBoard,
  publiclyEliminatedPlayerIds,
  v1AbilityIds,
  whiteWolfAbilityIds,
  whiteWolfDetonatedEventType,
  whiteWolfKingBoard,
} from '../src/index.js'
import { actorsWithRole, createManualEngine, playNight, submitExpected } from './helpers.js'

describe('plugin role settlement', () => {
  it('settles Magic Mirror Girl exact-role inspection and records target history', () => {
    const engine = createManualEngine(mirrorHiddenBoard)
    const actorId = actorsWithRole(engine, 'role-magic-mirror-girl')[0]!
    const targetId = actorsWithRole(engine, 'role-guard')[0]!
    const hiddenWolfId = actorsWithRole(engine, 'role-awakened-hidden-wolf')[0]!
    engine.start()
    playNight(engine, { wolfTargetId: null })
    expect(engine.state.phaseId).toBe('phase-night-magic-mirror')

    engine.submit({
      type: 'night-action',
      matchId: engine.state.matchId,
      actorId,
      abilityId: magicMirrorAbilityIds.inspect,
      targetIds: [targetId],
    })
    engine.submit({
      type: 'night-action',
      matchId: engine.state.matchId,
      actorId: hiddenWolfId,
      abilityId: awakenedHiddenWolfAbilityIds.learn,
      targetIds: [],
      option: 'pass',
    })

    const result = engine.events.find(
      (event) =>
        event.payload.type === 'plugin.event' &&
        event.payload.eventType === magicMirrorInspectedEventType,
    )
    expect(result?.visibility).toEqual({ kind: 'players', playerIds: [actorId] })
    expect(result?.payload).toMatchObject({
      type: 'plugin.event',
      data: { actorId, targetId, roleId: 'role-guard' },
    })

    const ruleset = createClassicRuleset()
    const restored = GameEngine.restore({
      matchId: engine.state.matchId,
      board: mirrorHiddenBoard,
      events: engine.events,
      status: engine.state.status,
      pausedReason: engine.state.pausedReason,
      ruleset,
    })
    const actor = restored.state.players.get(actorId)!
    const ability = ruleset.roles.ability(magicMirrorAbilityIds.inspect).ability
    expect(() =>
      ability.validate({
        state: restored.state,
        board: mirrorHiddenBoard,
        roles: ruleset.roles,
        actor,
        action: {
          type: 'night-action',
          matchId: restored.state.matchId,
          actorId,
          abilityId: magicMirrorAbilityIds.inspect,
          targetIds: [targetId],
        },
      }),
    ).toThrow(/cannot inspect the same player twice/)
  })

  it('shares the wolf attack and settles White Wolf King detonation through death triggers', () => {
    const engine = createManualEngine(whiteWolfKingBoard)
    const actorId = actorsWithRole(engine, 'role-white-wolf-king')[0]!
    const targetId = actorsWithRole(engine, 'role-hunter')[0]!
    engine.start()
    playNight(engine, { wolfTargetId: null })
    expect(engine.state.phaseId).toBe('phase-sheriff-signup')
    submitExpected(engine, (playerId) => ({
      type: 'sheriff-action',
      matchId: engine.state.matchId,
      actorId: playerId,
      action: 'decline',
    }))
    expect(engine.state.phaseId).toBe('phase-day-speech')
    while (engine.activeActor() !== actorId) {
      const playerId = engine.activeActor()
      if (!playerId) throw new Error('Expected a public speaker before White Wolf King')
      engine.submit({
        type: 'speech',
        matchId: engine.state.matchId,
        actorId: playerId,
        kind: 'day',
        text: '继续公开发言。',
      })
    }

    expect(engine.currentTurn()?.interruptAbilityIds).toContain(whiteWolfAbilityIds.detonate)
    expect(engine.currentTurn()?.interruptAbilityIds).not.toContain(
      v1AbilityIds.werewolfSelfDestruct,
    )
    engine.submit({
      type: 'skill-trigger',
      matchId: engine.state.matchId,
      actorId,
      abilityId: whiteWolfAbilityIds.detonate,
      targetId,
    })

    expect(engine.state.players.get(actorId)?.alive).toBe(false)
    expect(engine.state.players.get(targetId)?.alive).toBe(false)
    expect(engine.state.phaseId).toBe('phase-death-triggers')
    expect(engine.activeActor()).toBe(targetId)
    expect(publiclyEliminatedPlayerIds(engine.events)).toEqual(new Set([actorId, targetId]))
    expect(
      engine.events.some(
        (event) =>
          event.payload.type === 'plugin.event' &&
          event.payload.eventType === whiteWolfDetonatedEventType,
      ),
    ).toBe(true)

    engine.submit({
      type: 'skill-trigger',
      matchId: engine.state.matchId,
      actorId: targetId,
      abilityId: v1AbilityIds.hunterShot,
      targetId: null,
      option: 'pass',
    })
    expect(engine.state.phaseId).not.toBe('phase-death-triggers')
  })
})
