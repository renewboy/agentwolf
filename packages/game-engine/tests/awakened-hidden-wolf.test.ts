import {
  BoardIdSchema,
  GameEventSchema,
  RoleIdSchema,
  type GameEvent,
  type PlayerId,
} from '@agentwolf/contracts'
import { describe, expect, it } from 'vitest'
import {
  GameEngine,
  ResolutionAgenda,
  awakenedHiddenWolfAbilityIds,
  awakenedHiddenWolfEventTypes,
  canViewEvent,
  classicCapabilities,
  createClassicBoardManifest,
  createClassicRuleset,
  magicMirrorAbilityIds,
  mirrorHiddenBoard,
  v1AbilityIds,
  visibleRoleId,
} from '../src/index.js'
import { actorsWithRole, createManualEngine, submitExpected } from './helpers.js'

describe('Awakened Hidden Wolf', () => {
  it('stays outside the wolf pack, can be attacked, and masks a same-night exact inspection', () => {
    const engine = createManualEngine(mirrorHiddenBoard)
    const wolves = actorsWithRole(engine, 'role-werewolf')
    const hiddenWolfId = actorsWithRole(engine, 'role-awakened-hidden-wolf')[0]!
    const mirrorId = actorsWithRole(engine, 'role-magic-mirror-girl')[0]!
    const guardId = actorsWithRole(engine, 'role-guard')[0]!

    const factionMembers = engine.events.find(
      (event) => event.payload.type === 'faction.members' && event.payload.faction === 'werewolf',
    )
    expect(factionMembers?.payload).toMatchObject({ playerIds: wolves })
    expect(factionMembers?.visibility).toEqual({ kind: 'players', playerIds: wolves })
    expect(
      visibleRoleId(
        hiddenWolfId,
        { kind: 'player', playerId: wolves[0]! },
        engine.state,
        engine.events,
      ),
    ).toBeNull()
    expect(
      visibleRoleId(
        wolves[0]!,
        { kind: 'player', playerId: hiddenWolfId },
        engine.state,
        engine.events,
      ),
    ).toBeNull()

    engine.start()
    passGuard(engine)
    const firstWolf = engine.activeActor()!
    engine.submit({
      type: 'speech',
      matchId: engine.state.matchId,
      actorId: firstWolf,
      kind: 'wolf-council',
      text: '选择三号。',
    })
    const privateSpeech = engine.events.findLast(
      (event) => event.payload.type === 'speech.committed' && event.payload.playerId === firstWolf,
    )!
    expect(
      canViewEvent(privateSpeech, { kind: 'player', playerId: hiddenWolfId }, engine.state),
    ).toBe(false)
    finishWolfCouncil(engine)
    submitExpected(engine, (actorId) => ({
      type: 'vote',
      matchId: engine.state.matchId,
      actorId,
      targetId: hiddenWolfId,
      kind: 'wolf-kill',
    }))
    passWitch(engine)
    expect(engine.state.phaseId).toBe('phase-night-awakened-hidden-wolf-learn')
    engine.submit({
      type: 'night-action',
      matchId: engine.state.matchId,
      actorId: hiddenWolfId,
      abilityId: awakenedHiddenWolfAbilityIds.learn,
      targetIds: [guardId],
    })
    expect(
      engine.events.findLast(
        (event) =>
          event.payload.type === 'phase.changed' &&
          event.payload.phaseId === 'phase-night-awakened-hidden-wolf-learn',
      )?.visibility,
    ).toEqual({ kind: 'god' })
    expect(engine.state.phaseId).toBe('phase-night-magic-mirror')
    engine.submit({
      type: 'night-action',
      matchId: engine.state.matchId,
      actorId: mirrorId,
      abilityId: magicMirrorAbilityIds.inspect,
      targetIds: [hiddenWolfId],
    })

    const learned = pluginEvent(engine.events, awakenedHiddenWolfEventTypes.learned)
    expect(learned?.visibility).toEqual({ kind: 'players', playerIds: [hiddenWolfId] })
    expect(learned?.payload).toMatchObject({
      data: { actorId: hiddenWolfId, targetId: guardId, roleId: 'role-guard', night: 1 },
    })
    const inspection = engine.events.find(
      (event) =>
        event.payload.type === 'plugin.event' &&
        event.payload.eventType === 'event-magic-mirror-inspected',
    )
    expect(inspection?.payload).toMatchObject({
      data: { actorId: mirrorId, targetId: hiddenWolfId, roleId: 'role-guard' },
    })

    const ruleset = createClassicRuleset()
    const victoryContext = {
      state: engine.state,
      board: mirrorHiddenBoard,
      roles: ruleset.roles,
      events: engine.events,
    }
    expect(
      ruleset.endgames.observeWerewolfKnowledge(victoryContext, new Set([hiddenWolfId])),
    ).toMatchObject([{ observerId: hiddenWolfId, targetId: guardId, roleId: 'role-guard' }])
    expect(ruleset.endgames.observeWerewolfKnowledge(victoryContext, new Set(wolves))).toEqual([])
    const restored = GameEngine.restore({
      matchId: engine.state.matchId,
      board: mirrorHiddenBoard,
      events: engine.events,
      status: engine.state.status,
      pausedReason: engine.state.pausedReason,
      ruleset,
    })
    const restoredActor = restored.state.players.get(hiddenWolfId)!
    expect(
      ruleset.roles.hasCapability(restoredActor, classicCapabilities.awakenedHiddenWolfShield),
    ).toBe(true)
    expect(() =>
      ruleset.roles.ability(awakenedHiddenWolfAbilityIds.learn).ability.validate({
        state: restored.state,
        board: mirrorHiddenBoard,
        roles: ruleset.roles,
        actor: restoredActor,
        action: {
          type: 'night-action',
          matchId: restored.state.matchId,
          actorId: hiddenWolfId,
          abilityId: awakenedHiddenWolfAbilityIds.learn,
          targetIds: [mirrorId],
        },
      }),
    ).toThrow(/already learned/)
  })

  it('activates the copied hunter trigger in the learning night', () => {
    const board = createClassicBoardManifest({
      id: BoardIdSchema.parse('board-awakened-hidden-wolf-hunter-test'),
      sheriff: true,
      victory: 'slaughter-edge',
      roles: [
        { roleId: RoleIdSchema.parse('role-werewolf'), count: 2 },
        { roleId: RoleIdSchema.parse('role-awakened-hidden-wolf'), count: 1 },
        { roleId: RoleIdSchema.parse('role-villager'), count: 4 },
        { roleId: RoleIdSchema.parse('role-magic-mirror-girl'), count: 1 },
        { roleId: RoleIdSchema.parse('role-witch'), count: 1 },
        { roleId: RoleIdSchema.parse('role-hunter'), count: 1 },
      ],
    })
    const engine = createManualEngine(board)
    const hiddenWolfId = actorsWithRole(engine, 'role-awakened-hidden-wolf')[0]!
    const hunterId = actorsWithRole(engine, 'role-hunter')[0]!
    const mirrorId = actorsWithRole(engine, 'role-magic-mirror-girl')[0]!
    engine.start()
    finishWolfCouncil(engine)
    submitExpected(engine, (actorId) => ({
      type: 'vote',
      matchId: engine.state.matchId,
      actorId,
      targetId: hiddenWolfId,
      kind: 'wolf-kill',
    }))
    passWitch(engine)
    expect(engine.state.phaseId).toBe('phase-night-awakened-hidden-wolf-learn')
    engine.submit({
      type: 'night-action',
      matchId: engine.state.matchId,
      actorId: hiddenWolfId,
      abilityId: awakenedHiddenWolfAbilityIds.learn,
      targetIds: [hunterId],
    })
    expect(engine.state.phaseId).toBe('phase-night-magic-mirror')
    engine.submit({
      type: 'night-action',
      matchId: engine.state.matchId,
      actorId: mirrorId,
      abilityId: magicMirrorAbilityIds.inspect,
      targetIds: [],
      option: 'pass',
    })
    expect(engine.state.phaseId).toBe('phase-sheriff-signup')
    submitExpected(engine, (actorId) => ({
      type: 'sheriff-action',
      matchId: engine.state.matchId,
      actorId,
      action: 'decline',
    }))
    expect(engine.state.phaseId).toBe('phase-death-triggers')
    expect(engine.activeActor()).toBe(hiddenWolfId)
    expect(engine.currentTurn()?.allowedAbilityIds).toContain(v1AbilityIds.hunterShot)
    const targetId = actorsWithRole(engine, 'role-villager')[0]!
    engine.submit({
      type: 'skill-trigger',
      matchId: engine.state.matchId,
      actorId: hiddenWolfId,
      abilityId: v1AbilityIds.hunterShot,
      targetId,
    })
    expect(engine.events.find((event) => event.payload.type === 'hunter.shot')?.payload).toEqual({
      type: 'hunter.shot',
      playerId: hiddenWolfId,
      targetId,
    })
  })

  it('grants a private attack after every pack member is dead', () => {
    const initial = createManualEngine(mirrorHiddenBoard)
    const wolves = actorsWithRole(initial, 'role-werewolf')
    const hiddenWolfId = actorsWithRole(initial, 'role-awakened-hidden-wolf')[0]!
    const engine = restoreWithDeadPlayers(initial, wolves)

    engine.start()
    passGuard(engine)
    expect(
      engine.state.players
        .get(hiddenWolfId)
        ?.roleState.capabilities.has(classicCapabilities.awakenedHiddenWolfKill),
    ).toBe(true)
    const status = pluginEvent(engine.events, awakenedHiddenWolfEventTypes.status)
    expect(status?.visibility).toEqual({ kind: 'players', playerIds: [hiddenWolfId] })
    expect(status?.payload).toMatchObject({ data: { actorId: hiddenWolfId, armed: true } })
    expect(engine.state.phaseId).toBe('phase-night-awakened-hidden-wolf-attack')
    expect(
      engine.events.findLast(
        (event) =>
          event.payload.type === 'phase.changed' &&
          event.payload.phaseId === 'phase-night-awakened-hidden-wolf-attack',
      )?.visibility,
    ).toEqual({ kind: 'god' })
    expect(engine.expectedActors()).toEqual([hiddenWolfId])
    expect(engine.currentTurn()?.allowedAbilityIds).toContain(awakenedHiddenWolfAbilityIds.kill)
    const roleAbilityIds = createClassicRuleset()
      .roles.abilitiesFor(engine.state.players.get(hiddenWolfId)!)
      .map((ability) => ability.id)
    expect(roleAbilityIds).not.toContain(v1AbilityIds.werewolfSelfDestruct)
  })

  it('uses open protection data for copied shield and base protection IDs for double attack', () => {
    const ruleset = createClassicRuleset()
    const engine = createManualEngine(mirrorHiddenBoard)
    const hiddenWolfId = actorsWithRole(engine, 'role-awakened-hidden-wolf')[0]!
    const targetId = actorsWithRole(engine, 'role-villager')[0]!
    const actor = engine.state.players.get(hiddenWolfId)!
    const doubleAbility = ruleset.roles.ability(awakenedHiddenWolfAbilityIds.doubleKill).ability
    const action = {
      type: 'night-action' as const,
      matchId: engine.state.matchId,
      actorId: hiddenWolfId,
      abilityId: awakenedHiddenWolfAbilityIds.doubleKill,
      targetIds: [targetId, targetId],
    }
    const effects = doubleAbility.effects({
      state: engine.state,
      board: mirrorHiddenBoard,
      roles: ruleset.roles,
      actor,
      action,
    })
    expect(effects).toEqual([
      expect.objectContaining({
        kind: 'damage',
        targetId,
        cause: 'werewolf',
        ignoredProtections: ['guard', 'antidote'],
      }),
    ])

    const guarded = new ResolutionAgenda(ruleset.resolution, ruleset.queries)
    guarded.addAll([
      {
        kind: 'protect',
        priority: 300,
        sourceId: hiddenWolfId,
        targetId,
        protection: 'guard',
        blocks: ['werewolf'],
      },
      {
        kind: 'protect',
        priority: 300,
        sourceId: hiddenWolfId,
        targetId,
        protection: 'antidote',
        blocks: ['werewolf'],
      },
      ...effects,
    ])
    expect(guarded.settle(engine.state, mirrorHiddenBoard, ruleset.roles).pendingDeaths).toEqual([
      { playerId: targetId, causes: ['werewolf'] },
    ])

    const shieldAbility = ruleset.roles.ability(awakenedHiddenWolfAbilityIds.shield).ability
    const shieldEffects = shieldAbility.effects({
      state: engine.state,
      board: mirrorHiddenBoard,
      roles: ruleset.roles,
      actor,
      action: {
        type: 'night-action',
        matchId: engine.state.matchId,
        actorId: hiddenWolfId,
        abilityId: awakenedHiddenWolfAbilityIds.shield,
        targetIds: [targetId],
      },
    })
    expect(shieldEffects).toEqual([
      {
        kind: 'protect',
        priority: 300,
        sourceId: hiddenWolfId,
        targetId,
        protection: 'night-damage-shield',
        blocks: ['werewolf', 'poison'],
      },
    ])

    const poison = new ResolutionAgenda(ruleset.resolution, ruleset.queries)
    poison.addAll([
      ...shieldEffects,
      {
        kind: 'damage',
        priority: 400,
        sourceId: hiddenWolfId,
        targetId,
        cause: 'poison',
      },
    ])
    expect(poison.settle(engine.state, mirrorHiddenBoard, ruleset.roles).pendingDeaths).toEqual([])
  })
})

function passGuard(engine: GameEngine): void {
  if (engine.state.phaseId !== 'phase-night-guard') return
  submitExpected(engine, (actorId) => ({
    type: 'night-action',
    matchId: engine.state.matchId,
    actorId,
    abilityId: v1AbilityIds.guardProtect,
    targetIds: [],
    option: 'pass',
  }))
}

function finishWolfCouncil(engine: GameEngine): void {
  while (engine.state.phaseId === 'phase-night-wolf-council') {
    const actorId = engine.activeActor()
    if (!actorId) throw new Error('Expected a wolf council actor')
    engine.submit({
      type: 'speech',
      matchId: engine.state.matchId,
      actorId,
      kind: 'wolf-council',
      text: '执行夜间计划。',
    })
  }
}

function passWitch(engine: GameEngine): void {
  if (engine.state.phaseId !== 'phase-night-witch') return
  submitExpected(engine, (actorId) => ({
    type: 'night-action',
    matchId: engine.state.matchId,
    actorId,
    abilityId: v1AbilityIds.witchAntidote,
    targetIds: [],
    option: 'pass',
  }))
}

function pluginEvent(events: readonly GameEvent[], eventType: string): GameEvent | undefined {
  return events.find(
    (event) => event.payload.type === 'plugin.event' && event.payload.eventType === eventType,
  )
}

function restoreWithDeadPlayers(engine: GameEngine, playerIds: readonly PlayerId[]): GameEngine {
  const events = [...engine.events]
  for (const playerId of playerIds) {
    events.push(
      GameEventSchema.parse({
        matchId: engine.state.matchId,
        sequence: events.length + 1,
        occurredAt: `2026-08-26T00:00:${String(events.length).padStart(2, '0')}.000Z`,
        visibility: { kind: 'god' },
        payload: {
          type: 'player.died',
          playerId,
          causes: ['exile'],
          announced: true,
          timing: 'day',
        },
      }),
    )
  }
  return GameEngine.restore({
    matchId: engine.state.matchId,
    board: mirrorHiddenBoard,
    events,
    status: 'draft',
    pausedReason: null,
  })
}
