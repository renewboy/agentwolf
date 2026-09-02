import { PlayerIdSchema, PluginIdSchema, RoleIdSchema } from '@agentwolf/contracts'
import { describe, expect, it, vi } from 'vitest'
import {
  createClassicRuleset,
  cupidAbilityIds,
  v1AbilityIds,
  sixPlayerBoard,
  type BoardManifest,
  type GameEngine,
  type RuleRuntime,
} from '../src/index.js'
import {
  appendWolfKnifeVictoryLock,
  wolfKnifeVictoryLockedEventType,
} from '../src/rulesets/classic/plugins/victory-plugin.js'
import { actorsWithRole, createManualEngine, playNight } from './helpers.js'

describe('wolf-knife victory checkpoint', () => {
  it('locks Werewolf victory before a last surviving Hunter can fire', () => {
    const engine = createManualEngine(duelBoard('role-hunter'))
    engine.start()
    const wolfId = actorsWithRole(engine, 'role-werewolf')[0]!
    const hunterId = actorsWithRole(engine, 'role-hunter')[0]!

    playNight(engine, { wolfTargetId: hunterId })

    expectWerewolfKnifeVictory(engine)
    expect(engine.state.players.get(wolfId)?.alive).toBe(true)
    expect(engine.events.some((event) => event.payload.type === 'hunter.shot')).toBe(false)
    expect(
      engine.events.some(
        (event) =>
          event.payload.type === 'phase.changed' &&
          event.payload.phaseId === 'phase-death-triggers',
      ),
    ).toBe(false)
  })

  it('locks Werewolf victory before a killed Witch poison is settled', () => {
    const engine = createManualEngine(duelBoard('role-witch'))
    engine.start()
    const wolfId = actorsWithRole(engine, 'role-werewolf')[0]!
    const witchId = actorsWithRole(engine, 'role-witch')[0]!

    while (engine.state.phaseId === 'phase-night-wolf-council') {
      const actorId = engine.activeActor()
      if (!actorId) throw new Error('Wolf council is missing an actor')
      engine.submit({
        type: 'speech',
        matchId: engine.state.matchId,
        actorId,
        kind: 'wolf-council',
        text: '袭击女巫。',
      })
    }
    engine.submit({
      type: 'vote',
      matchId: engine.state.matchId,
      actorId: wolfId,
      targetId: witchId,
      kind: 'wolf-kill',
    })
    expect(engine.state.phaseId).toBe('phase-night-witch')
    engine.submit({
      type: 'night-action',
      matchId: engine.state.matchId,
      actorId: witchId,
      abilityId: v1AbilityIds.witchPoison,
      targetIds: [wolfId],
    })

    expectWerewolfKnifeVictory(engine)
    expect(engine.state.players.get(wolfId)?.alive).toBe(true)
    expect(
      engine.events.some(
        (event) => event.payload.type === 'witch.potion-used' && event.payload.potion === 'poison',
      ),
    ).toBe(false)
    expect(
      engine.events.some(
        (event) =>
          event.payload.type === 'ability.used' &&
          event.payload.abilityId === v1AbilityIds.witchPoison,
      ),
    ).toBe(false)
  })

  it('applies protection before the wolf-knife checkpoint', () => {
    const engine = createManualEngine(duelBoard('role-guard'))
    engine.start()
    const wolfId = actorsWithRole(engine, 'role-werewolf')[0]!
    const guardId = actorsWithRole(engine, 'role-guard')[0]!

    expect(engine.state.phaseId).toBe('phase-night-guard')
    engine.submit({
      type: 'night-action',
      matchId: engine.state.matchId,
      actorId: guardId,
      abilityId: v1AbilityIds.guardProtect,
      targetIds: [guardId],
    })
    submitWolfAttack(engine, wolfId, guardId)

    expect(engine.state.players.get(guardId)?.alive).toBe(true)
    expect(engine.events.some((event) => event.payload.type === 'player.saved')).toBe(true)
    expect(hasWolfKnifeLock(engine)).toBe(false)
    expect(
      engine.events.findLast((event) => event.payload.type === 'match.ended')?.payload,
    ).toMatchObject({ winner: 'werewolf', reason: 'werewolf-forced-win' })
  })

  it('includes automatic linked deaths before deciding whether the wolf knife wins', () => {
    const engine = createManualEngine(cupidTrioBoard())
    engine.start()
    const wolfId = actorsWithRole(engine, 'role-werewolf')[0]!
    const cupidId = actorsWithRole(engine, 'role-cupid')[0]!
    const villagerId = actorsWithRole(engine, 'role-villager')[0]!

    expect(engine.state.phaseId).toBe('phase-night-cupid')
    engine.submit({
      type: 'night-action',
      matchId: engine.state.matchId,
      actorId: cupidId,
      abilityId: cupidAbilityIds.link,
      targetIds: [wolfId, villagerId],
    })
    submitWolfAttack(engine, wolfId, villagerId)

    expect(hasWolfKnifeLock(engine)).toBe(false)
    expect(engine.state.players.get(wolfId)?.alive).toBe(false)
    expect(
      engine.events.findLast((event) => event.payload.type === 'match.ended')?.payload,
    ).toMatchObject({ winner: 'independent', reason: 'cupid-lovers-last-standing' })
  })

  it('keeps the persisted wolf-knife lock immutable and canonical', () => {
    const ruleset = createClassicRuleset()
    const pluginId = PluginIdSchema.parse('plugin-classic-victory')
    const firstId = PlayerIdSchema.parse('player-1')
    const secondId = PlayerIdSchema.parse('player-2')
    const envelope = {
      pluginId,
      eventType: wolfKnifeVictoryLockedEventType,
      schemaVersion: 1,
      data: {
        winningPlayerIds: [firstId, secondId],
        formalReason: 'all-non-werewolves-eliminated',
      },
    }
    const locked = ruleset.events.apply(new Map(), envelope)
    expect(() => ruleset.events.apply(locked, envelope)).not.toThrow()
    expect(() =>
      ruleset.events.apply(locked, {
        ...envelope,
        data: { ...envelope.data, formalReason: 'all-gods-eliminated' },
      }),
    ).toThrow(/cannot be replaced/)
    expect(() =>
      ruleset.events.apply(locked, {
        ...envelope,
        data: { ...envelope.data, winningPlayerIds: [secondId] },
      }),
    ).toThrow(/cannot be replaced/)

    expect(() =>
      appendWolfKnifeVictoryLock({} as RuleRuntime, {
        winner: 'village',
        winningPlayerIds: [firstId],
        reason: 'all-werewolves-eliminated',
      }),
    ).toThrow(/Only a Werewolf victory/)
    const append = vi.fn(() => null as never)
    appendWolfKnifeVictoryLock({ append } as unknown as RuleRuntime, {
      winner: 'werewolf',
      winningPlayerIds: [secondId, firstId, firstId],
      reason: 'all-non-werewolves-eliminated',
    })
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ winningPlayerIds: [firstId, secondId] }),
      }),
      { kind: 'god' },
    )
  })
})

function duelBoard(opponentRoleId: 'role-hunter' | 'role-witch' | 'role-guard'): BoardManifest {
  return {
    ...sixPlayerBoard,
    playerCount: 2,
    roles: [
      { roleId: RoleIdSchema.parse('role-werewolf'), count: 1 },
      { roleId: RoleIdSchema.parse(opponentRoleId), count: 1 },
    ],
    sheriff: false,
    policies: {
      ...sixPlayerBoard.policies,
      nightLastWords: 'none',
      victory: 'slaughter-all',
    },
  }
}

function cupidTrioBoard(): BoardManifest {
  return {
    ...sixPlayerBoard,
    playerCount: 3,
    roles: [
      { roleId: RoleIdSchema.parse('role-werewolf'), count: 1 },
      { roleId: RoleIdSchema.parse('role-cupid'), count: 1 },
      { roleId: RoleIdSchema.parse('role-villager'), count: 1 },
    ],
    sheriff: false,
    policies: {
      ...sixPlayerBoard.policies,
      nightLastWords: 'none',
      victory: 'slaughter-all',
    },
  }
}

function submitWolfAttack(
  engine: GameEngine,
  wolfId: ReturnType<typeof actorsWithRole>[number],
  targetId: ReturnType<typeof actorsWithRole>[number],
): void {
  while (engine.state.phaseId === 'phase-night-wolf-council') {
    const actorId = engine.activeActor()
    if (!actorId) throw new Error('Wolf council is missing an actor')
    engine.submit({
      type: 'speech',
      matchId: engine.state.matchId,
      actorId,
      kind: 'wolf-council',
      text: '执行狼刀。',
    })
  }
  engine.submit({
    type: 'vote',
    matchId: engine.state.matchId,
    actorId: wolfId,
    targetId,
    kind: 'wolf-kill',
  })
}

function expectWerewolfKnifeVictory(engine: GameEngine): void {
  expect(engine.state.status).toBe('ended')
  expect(engine.state.winner).toBe('werewolf')
  expect(
    engine.events.findLast((event) => event.payload.type === 'match.ended')?.payload,
  ).toMatchObject({
    type: 'match.ended',
    winner: 'werewolf',
    reason: 'werewolf-knife-priority',
  })
  expect(hasWolfKnifeLock(engine)).toBe(true)
}

function hasWolfKnifeLock(engine: GameEngine): boolean {
  return engine.events.some(
    (event) =>
      event.payload.type === 'plugin.event' &&
      event.payload.eventType === 'event-wolf-knife-victory-locked',
  )
}
