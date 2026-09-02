import { describe, expect, it } from 'vitest'
import {
  AbilityIdSchema,
  GameEventSchema,
  RoleIdSchema,
  type PlayerAction,
  type PlayerId,
} from '@agentwolf/contracts'
import {
  AwakenedHiddenWolfRole,
  GuardRole,
  IdiotRole,
  WhiteWolfKingRole,
  WitchRole,
  awakenedHiddenWolfAbilityIds,
  awakenedHiddenWolfCapabilityFor,
  awakenedHiddenWolfEventTypes,
  awakenedHiddenWolfLearning,
  classicCapabilities,
  createClassicRuleset,
  guardBoard,
  mirrorHiddenBoard,
  standardBoard,
  v1AbilityIds,
  whiteWolfAbilityIds,
  whiteWolfKingBoard,
  type ActionValidationContext,
  type BoardManifest,
  type GameState,
} from '../src/index.js'
import { appendFinalRoleReveals } from '../src/role-reveal.js'
import { classicPluginIds } from '../src/rulesets/classic/plugins/ids.js'
import { actorsWithRole, createManualEngine } from './helpers.js'

describe('Witch ability matrix', () => {
  it('validates antidote policies, prior use, targets, effects, and outcomes', () => {
    const engine = createManualEngine(standardBoard)
    const ruleset = createClassicRuleset()
    const witchId = actorsWithRole(engine, 'role-witch')[0]!
    const targetId = actorsWithRole(engine, 'role-villager')[0]!
    const role = new WitchRole()
    const antidote = role.abilities[0]!
    const action = nightAction(engine.state, witchId, v1AbilityIds.witchAntidote, [targetId])
    const attacked = { ...engine.state, nightAttackTargetId: targetId }
    const context = abilityContext(attacked, standardBoard, ruleset.roles, witchId, action)
    expect(() => antidote.validate(context)).not.toThrow()
    expect(antidote.effects(context)).toEqual([
      expect.objectContaining({ kind: 'protect', protection: 'antidote', targetId }),
    ])
    expect(antidote.outcomes?.(context, emptyResolution())).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({ potion: 'antidote', targetId }),
      }),
    ])
    expect(
      antidote.outcomes?.(
        { ...context, action: { ...action, option: 'pass', targetIds: [] } },
        emptyResolution(),
      ),
    ).toEqual([])
    expect(
      antidote.outcomes?.(
        { ...context, action: speechAction(engine.state, witchId) },
        emptyResolution(),
      ),
    ).toEqual([])

    expect(() =>
      antidote.validate({ ...context, action: speechAction(engine.state, witchId) }),
    ).toThrow(/night action/)
    expect(() =>
      antidote.effects({ ...context, action: speechAction(engine.state, witchId) }),
    ).toThrow(/night action/)
    expect(() =>
      antidote.validate({ ...context, state: { ...attacked, nightAttackTargetId: null } }),
    ).toThrow(/no werewolf attack/)
    expect(() =>
      antidote.validate({ ...context, action: { ...action, targetIds: [witchId] } }),
    ).toThrow(/attacked player/)

    const selfAction = { ...action, targetIds: [witchId] }
    const selfAttacked = { ...attacked, nightAttackTargetId: witchId }
    expect(() =>
      antidote.validate(
        abilityContext(selfAttacked, standardBoard, ruleset.roles, witchId, selfAction),
      ),
    ).toThrow(/cannot save herself/)
    const firstNightBoard = boardWithPolicies(standardBoard, { witchSelfSave: 'first-night' })
    expect(() =>
      antidote.validate(
        abilityContext(selfAttacked, firstNightBoard, ruleset.roles, witchId, selfAction),
      ),
    ).not.toThrow()
    expect(() =>
      antidote.validate(
        abilityContext(
          { ...selfAttacked, day: 1 },
          firstNightBoard,
          ruleset.roles,
          witchId,
          selfAction,
        ),
      ),
    ).toThrow(/cannot save herself/)
    const alwaysBoard = boardWithPolicies(standardBoard, { witchSelfSave: 'always' })
    expect(() =>
      antidote.validate(
        abilityContext(selfAttacked, alwaysBoard, ruleset.roles, witchId, selfAction),
      ),
    ).not.toThrow()

    const used = withAbilityUse(attacked, witchId, v1AbilityIds.witchAntidote)
    expect(() =>
      antidote.validate(abilityContext(used, standardBoard, ruleset.roles, witchId, action)),
    ).toThrow(/already been used/)
  })

  it('validates poison usage, one-potion policy, targets, effects, and outcomes', () => {
    const engine = createManualEngine(standardBoard)
    const ruleset = createClassicRuleset()
    const witchId = actorsWithRole(engine, 'role-witch')[0]!
    const targetId = actorsWithRole(engine, 'role-villager')[0]!
    const poison = new WitchRole().abilities[1]!
    const action = nightAction(engine.state, witchId, v1AbilityIds.witchPoison, [targetId])
    const context = abilityContext(engine.state, standardBoard, ruleset.roles, witchId, action)
    expect(() => poison.validate(context)).not.toThrow()
    expect(poison.effects(context)).toEqual([
      expect.objectContaining({ kind: 'damage', cause: 'poison' }),
    ])
    expect(poison.outcomes?.(context, emptyResolution())).toEqual([
      expect.objectContaining({ payload: expect.objectContaining({ potion: 'poison', targetId }) }),
    ])
    expect(
      poison.outcomes?.(
        { ...context, action: { ...action, option: 'pass', targetIds: [] } },
        emptyResolution(),
      ),
    ).toEqual([])
    expect(
      poison.outcomes?.(
        { ...context, action: speechAction(engine.state, witchId) },
        emptyResolution(),
      ),
    ).toEqual([])
    expect(() =>
      poison.validate({ ...context, action: speechAction(engine.state, witchId) }),
    ).toThrow(/night action/)
    expect(() =>
      poison.effects({ ...context, action: speechAction(engine.state, witchId) }),
    ).toThrow(/night action/)
    expect(() =>
      poison.validate({ ...context, action: { ...action, targetIds: [witchId] } }),
    ).toThrow(/cannot target its owner/)

    const used = withAbilityUse(engine.state, witchId, v1AbilityIds.witchPoison)
    expect(() =>
      poison.validate(abilityContext(used, standardBoard, ruleset.roles, witchId, action)),
    ).toThrow(/already been used/)
    const phaseUsed: GameState = {
      ...engine.state,
      phaseActions: [nightAction(engine.state, witchId, v1AbilityIds.witchAntidote, [targetId])],
    }
    expect(() =>
      poison.validate(abilityContext(phaseUsed, standardBoard, ruleset.roles, witchId, action)),
    ).toThrow(/one potion/)
    const twoPotionBoard = boardWithPolicies(standardBoard, { witchPotionsPerNight: 2 })
    expect(() =>
      poison.validate(abilityContext(phaseUsed, twoPotionBoard, ruleset.roles, witchId, action)),
    ).not.toThrow()
  })
})

describe('Awakened Hidden Wolf ability matrix', () => {
  const role = new AwakenedHiddenWolfRole()

  it('maps learnings and copied capabilities', () => {
    const engine = createManualEngine(mirrorHiddenBoard)
    const actorId = actorsWithRole(engine, 'role-awakened-hidden-wolf')[0]!
    expect(awakenedHiddenWolfLearning(engine.state, actorId)).toBeNull()
    const learning = { actorId, targetId: 'player-1', roleId: 'role-guard', night: 1 }
    const state = {
      ...engine.state,
      pluginState: new Map(engine.state.pluginState).set(classicPluginIds.awakenedHiddenWolf, {
        learnings: [learning],
        statuses: [],
        attacks: [],
      }),
    } as GameState
    expect(awakenedHiddenWolfLearning(state, actorId)).toMatchObject(learning)
    expect(awakenedHiddenWolfLearning(state, 'player-99' as PlayerId)).toBeNull()
    expect(
      ['role-magic-mirror-girl', 'role-witch', 'role-guard', 'role-hunter', 'role-werewolf'].map(
        (id) => awakenedHiddenWolfCapabilityFor(RoleIdSchema.parse(id)),
      ),
    ).toEqual([
      classicCapabilities.awakenedHiddenWolfInspect,
      classicCapabilities.awakenedHiddenWolfPoison,
      classicCapabilities.awakenedHiddenWolfShield,
      classicCapabilities.hunterShot,
      classicCapabilities.awakenedHiddenWolfDoubleKill,
    ])
    expect(awakenedHiddenWolfCapabilityFor(RoleIdSchema.parse('role-villager'))).toBeNull()
  })

  it('validates learning, inspection, poison, shield, and attack behaviors', () => {
    const engine = createManualEngine(mirrorHiddenBoard)
    const ruleset = createClassicRuleset()
    const actorId = actorsWithRole(engine, 'role-awakened-hidden-wolf')[0]!
    const targetId = actorsWithRole(engine, 'role-villager')[0]!
    const secondTargetId = actorsWithRole(engine, 'role-werewolf')[0]!

    const learn = role.abilities.find((entry) => entry.id === awakenedHiddenWolfAbilityIds.learn)!
    const learnAction = nightAction(engine.state, actorId, awakenedHiddenWolfAbilityIds.learn, [
      targetId,
    ])
    const learnContext = abilityContext(
      engine.state,
      mirrorHiddenBoard,
      ruleset.roles,
      actorId,
      learnAction,
    )
    expect(() => learn.validate(learnContext)).not.toThrow()
    expect(learn.effects(learnContext)).toEqual([])
    expect(() =>
      learn.validate({ ...learnContext, action: speechAction(engine.state, actorId) }),
    ).toThrow(/night action/)
    expect(() =>
      learn.validate({ ...learnContext, action: { ...learnAction, targetIds: [actorId] } }),
    ).toThrow(/cannot target its owner/)
    expect(() =>
      learn.validate(
        abilityContext(
          withAbilityUse(engine.state, actorId, awakenedHiddenWolfAbilityIds.learn),
          mirrorHiddenBoard,
          ruleset.roles,
          actorId,
          learnAction,
        ),
      ),
    ).toThrow(/already learned/)

    const inspect = role.abilities.find(
      (entry) => entry.id === awakenedHiddenWolfAbilityIds.inspect,
    )!
    const inspectAction = nightAction(engine.state, actorId, awakenedHiddenWolfAbilityIds.inspect, [
      targetId,
    ])
    const inspectContext = abilityContext(
      engine.state,
      mirrorHiddenBoard,
      ruleset.roles,
      actorId,
      inspectAction,
    )
    expect(inspect.effects(inspectContext)).toEqual([
      expect.objectContaining({ kind: 'inspect-role', sourceId: actorId, targetId }),
    ])
    expect(
      inspect.outcomes?.(inspectContext, {
        ...emptyResolution(),
        exactInspections: [
          { sourceId: actorId, targetId, roleId: RoleIdSchema.parse('role-villager') },
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({ eventType: awakenedHiddenWolfEventTypes.inspected }),
      }),
    ])
    expect(inspect.outcomes?.(inspectContext, emptyResolution())).toEqual([])
    expect(() =>
      inspect.validate({ ...inspectContext, action: speechAction(engine.state, actorId) }),
    ).toThrow(/night action/)
    expect(() =>
      inspect.effects({ ...inspectContext, action: speechAction(engine.state, actorId) }),
    ).toThrow(/night action/)

    for (const [abilityId, capability, effectKind, eventType] of [
      [
        awakenedHiddenWolfAbilityIds.poison,
        classicCapabilities.awakenedHiddenWolfPoison,
        'damage',
        awakenedHiddenWolfEventTypes.poisoned,
      ],
      [
        awakenedHiddenWolfAbilityIds.shield,
        classicCapabilities.awakenedHiddenWolfShield,
        'protect',
        awakenedHiddenWolfEventTypes.protected,
      ],
    ] as const) {
      const ability = role.abilities.find((entry) => entry.id === abilityId)!
      const action = nightAction(engine.state, actorId, abilityId, [targetId])
      const context = abilityContext(
        engine.state,
        mirrorHiddenBoard,
        ruleset.roles,
        actorId,
        action,
      )
      expect(() => ability.validate(context)).not.toThrow()
      expect(ability.effects(context)[0]).toMatchObject({ kind: effectKind, targetId })
      expect(ability.outcomes?.(context, emptyResolution())).toEqual([
        expect.objectContaining({ payload: expect.objectContaining({ eventType }) }),
        expect.objectContaining({
          payload: { type: 'capability.revoked', playerId: actorId, capabilityId: capability },
        }),
      ])
      expect(
        ability.outcomes?.(
          { ...context, action: { ...action, option: 'pass', targetIds: [] } },
          emptyResolution(),
        ),
      ).toEqual([])
      expect(() =>
        ability.validate(
          abilityContext(
            withAbilityUse(engine.state, actorId, abilityId),
            mirrorHiddenBoard,
            ruleset.roles,
            actorId,
            action,
          ),
        ),
      ).toThrow(/used/)
      expect(() =>
        ability.effects({ ...context, action: speechAction(engine.state, actorId) }),
      ).toThrow(/night action/)
    }

    const kill = role.abilities.find((entry) => entry.id === awakenedHiddenWolfAbilityIds.kill)!
    const killAction = nightAction(engine.state, actorId, awakenedHiddenWolfAbilityIds.kill, [
      targetId,
    ])
    const killContext = abilityContext(
      engine.state,
      mirrorHiddenBoard,
      ruleset.roles,
      actorId,
      killAction,
    )
    expect(() => kill.validate(killContext)).not.toThrow()
    expect(kill.effects(killContext)).toEqual([expect.objectContaining({ cause: 'werewolf' })])
    expect(() =>
      kill.effects({ ...killContext, action: speechAction(engine.state, actorId) }),
    ).toThrow(/night action/)

    const doubleKill = role.abilities.find(
      (entry) => entry.id === awakenedHiddenWolfAbilityIds.doubleKill,
    )!
    const capableState = withCapability(
      engine.state,
      actorId,
      classicCapabilities.awakenedHiddenWolfKill,
    )
    const doubleAction = nightAction(
      capableState,
      actorId,
      awakenedHiddenWolfAbilityIds.doubleKill,
      [targetId, secondTargetId],
    )
    const doubleContext = abilityContext(
      capableState,
      mirrorHiddenBoard,
      ruleset.roles,
      actorId,
      doubleAction,
    )
    expect(() => doubleKill.validate(doubleContext)).not.toThrow()
    expect(doubleKill.effects(doubleContext)).toHaveLength(2)
    expect(
      doubleKill.effects({
        ...doubleContext,
        action: { ...doubleAction, targetIds: [targetId, targetId] },
      }),
    ).toEqual([expect.objectContaining({ ignoredProtections: ['guard', 'antidote'] })])
    expect(doubleKill.outcomes?.(doubleContext, emptyResolution())).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({
          capabilityId: classicCapabilities.awakenedHiddenWolfDoubleKill,
        }),
      }),
    ])
    expect(
      doubleKill.outcomes?.(
        { ...doubleContext, action: { ...doubleAction, option: 'pass' } },
        emptyResolution(),
      ),
    ).toEqual([])
    expect(
      doubleKill.outcomes?.(
        { ...doubleContext, action: speechAction(engine.state, actorId) },
        emptyResolution(),
      ),
    ).toEqual([])
    expect(() =>
      doubleKill.validate(
        abilityContext(engine.state, mirrorHiddenBoard, ruleset.roles, actorId, doubleAction),
      ),
    ).toThrow(/requires the awakened attack/)
    expect(() =>
      doubleKill.validate(
        abilityContext(
          withAbilityUse(capableState, actorId, awakenedHiddenWolfAbilityIds.doubleKill),
          mirrorHiddenBoard,
          ruleset.roles,
          actorId,
          doubleAction,
        ),
      ),
    ).toThrow(/has been used/)
    expect(() =>
      doubleKill.validate({ ...doubleContext, action: speechAction(engine.state, actorId) }),
    ).toThrow(/night action/)
    expect(() =>
      doubleKill.effects({ ...doubleContext, action: speechAction(engine.state, actorId) }),
    ).toThrow(/night action/)
  })

  it('exposes the Idiot reveal guard', () => {
    const idiot = new IdiotRole()
    expect(idiot.canPreventExile(false)).toBe(true)
    expect(idiot.canPreventExile(true)).toBe(false)
  })
})

describe('Guard and White Wolf King matrices', () => {
  it('validates Guard self-target policy, alive targets, effects, and outcomes', () => {
    const engine = createManualEngine(guardBoard)
    const ruleset = createClassicRuleset()
    const guardId = actorsWithRole(engine, 'role-guard')[0]!
    const targetId = actorsWithRole(engine, 'role-villager')[0]!
    const ability = new GuardRole().abilities[0]!
    const action = nightAction(engine.state, guardId, v1AbilityIds.guardProtect, [targetId])
    const context = abilityContext(engine.state, guardBoard, ruleset.roles, guardId, action)
    expect(() => ability.validate(context)).not.toThrow()
    expect(ability.effects(context)).toEqual([
      expect.objectContaining({ kind: 'protect', protection: 'guard', targetId }),
    ])
    expect(ability.outcomes?.(context, emptyResolution())).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({ type: 'guard.protected', targetId }),
      }),
    ])
    expect(
      ability.outcomes?.(
        { ...context, action: { ...action, option: 'pass', targetIds: [] } },
        emptyResolution(),
      ),
    ).toEqual([expect.objectContaining({ payload: expect.objectContaining({ targetId: null }) })])
    expect(
      ability.outcomes?.(
        { ...context, action: speechAction(engine.state, guardId) },
        emptyResolution(),
      ),
    ).toEqual([])
    expect(() =>
      ability.effects({ ...context, action: speechAction(engine.state, guardId) }),
    ).toThrow(/night action/)
    const noSelfBoard = boardWithPolicies(guardBoard, { guardCanSelfProtect: false })
    expect(() =>
      ability.validate(
        abilityContext(engine.state, noSelfBoard, ruleset.roles, guardId, {
          ...action,
          targetIds: [guardId],
        }),
      ),
    ).toThrow(/cannot target its owner/)
    const selfBoard = boardWithPolicies(guardBoard, { guardCanSelfProtect: true })
    expect(() =>
      ability.validate(
        abilityContext(engine.state, selfBoard, ruleset.roles, guardId, {
          ...action,
          targetIds: [guardId],
        }),
      ),
    ).not.toThrow()
    const deadTarget = engine.state.players.get(targetId)!
    const deadState = {
      ...engine.state,
      players: new Map(engine.state.players).set(targetId, { ...deadTarget, alive: false }),
    } as GameState
    expect(() =>
      ability.validate(abilityContext(deadState, guardBoard, ruleset.roles, guardId, action)),
    ).toThrow(/not alive/)
  })

  it('validates White Wolf detonation, effects, and public outcomes', () => {
    const engine = createManualEngine(whiteWolfKingBoard)
    const ruleset = createClassicRuleset()
    const actorId = actorsWithRole(engine, 'role-white-wolf-king')[0]!
    const targetId = actorsWithRole(engine, 'role-villager')[0]!
    const ability = new WhiteWolfKingRole().abilities[0]!
    const action = {
      type: 'skill-trigger' as const,
      matchId: engine.state.matchId,
      actorId,
      abilityId: whiteWolfAbilityIds.detonate,
      targetId,
    }
    const context = abilityContext(engine.state, whiteWolfKingBoard, ruleset.roles, actorId, action)
    expect(() => ability.validate(context)).not.toThrow()
    expect(ability.effects(context)).toHaveLength(2)
    expect(ability.outcomes?.(context, emptyResolution())).toHaveLength(4)
    expect(
      ability.outcomes?.(
        { ...context, action: { ...action, targetId: undefined } as never },
        emptyResolution(),
      ),
    ).toEqual([])
    expect(
      ability.outcomes?.(
        { ...context, action: speechAction(engine.state, actorId) },
        emptyResolution(),
      ),
    ).toEqual([])
    expect(() =>
      ability.validate({ ...context, action: speechAction(engine.state, actorId) }),
    ).toThrow(/skill/)
    expect(() =>
      ability.effects({ ...context, action: speechAction(engine.state, actorId) }),
    ).toThrow(/skill/)
    expect(() =>
      ability.validate({ ...context, action: { ...action, targetId: undefined } as never }),
    ).toThrow(/requires a target/)
    expect(() =>
      ability.effects({ ...context, action: { ...action, targetId: undefined } as never }),
    ).toThrow(/requires a target/)
    expect(() =>
      ability.validate({ ...context, action: { ...action, targetId: actorId } }),
    ).toThrow(/cannot target its owner/)
    expect(() =>
      ability.validate(
        abilityContext(
          withAbilityUse(engine.state, actorId, whiteWolfAbilityIds.detonate),
          whiteWolfKingBoard,
          ruleset.roles,
          actorId,
          action,
        ),
      ),
    ).toThrow(/already detonated/)
  })
})

describe('final role reveals', () => {
  it('appends missing players in seat order and skips existing reveals', () => {
    const engine = createManualEngine(standardBoard)
    const players = [...engine.state.players.values()].sort((left, right) => left.seat - right.seat)
    const existing = GameEventSchema.parse({
      matchId: engine.state.matchId,
      sequence: 1,
      occurredAt: '2026-08-28T00:00:00.000Z',
      visibility: { kind: 'public' },
      payload: { type: 'role.revealed', playerId: players[0]!.id, roleId: players[0]!.roleId },
    })
    const appended: unknown[] = []
    appendFinalRoleReveals({
      state: engine.state,
      board: standardBoard,
      events: [existing],
      roles: createClassicRuleset().roles,
      resolution: createClassicRuleset().resolution,
      victories: createClassicRuleset().victories,
      pluginEvents: createClassicRuleset().events,
      queries: createClassicRuleset().queries,
      triggers: createClassicRuleset().triggers,
      append: (payload, visibility) => {
        appended.push({ payload, visibility })
        return existing
      },
    })
    expect(appended).toHaveLength(players.length - 1)
    expect(appended[0]).toMatchObject({
      payload: { playerId: players[1]!.id },
      visibility: { kind: 'public' },
    })
  })

  it('rejects players without a Role', () => {
    const engine = createManualEngine(standardBoard)
    const player = [...engine.state.players.values()][0]!
    const state = {
      ...engine.state,
      players: new Map(engine.state.players).set(player.id, { ...player, roleId: null }),
    } as GameState
    expect(() =>
      appendFinalRoleReveals({
        state,
        board: standardBoard,
        events: [],
        roles: createClassicRuleset().roles,
        resolution: createClassicRuleset().resolution,
        victories: createClassicRuleset().victories,
        pluginEvents: createClassicRuleset().events,
        queries: createClassicRuleset().queries,
        triggers: createClassicRuleset().triggers,
        append: () => {
          throw new Error('unreachable')
        },
      }),
    ).toThrow(/has no role/)
  })
})

function nightAction(
  state: GameState,
  actorId: PlayerId,
  abilityId: ReturnType<typeof AbilityIdSchema.parse>,
  targetIds: PlayerId[],
): Extract<PlayerAction, { type: 'night-action' }> {
  return { type: 'night-action', matchId: state.matchId, actorId, abilityId, targetIds }
}

function speechAction(
  state: GameState,
  actorId: PlayerId,
): Extract<PlayerAction, { type: 'speech' }> {
  return { type: 'speech', matchId: state.matchId, actorId, kind: 'day', text: 'speech' }
}

function abilityContext(
  state: GameState,
  board: BoardManifest,
  roles: ReturnType<typeof createClassicRuleset>['roles'],
  actorId: PlayerId,
  action: PlayerAction,
): ActionValidationContext {
  return { state, board, roles, actor: state.players.get(actorId)!, action }
}

function withAbilityUse(state: GameState, actorId: PlayerId, abilityId: string): GameState {
  const actor = state.players.get(actorId)!
  return {
    ...state,
    players: new Map(state.players).set(actorId, {
      ...actor,
      roleState: {
        ...actor.roleState,
        abilityUses: { ...actor.roleState.abilityUses, [abilityId]: 1 },
      },
    }),
  }
}

function withCapability(state: GameState, actorId: PlayerId, capabilityId: string): GameState {
  const actor = state.players.get(actorId)!
  return {
    ...state,
    players: new Map(state.players).set(actorId, {
      ...actor,
      roleState: {
        ...actor.roleState,
        capabilities: new Set([...actor.roleState.capabilities, capabilityId as never]),
      },
    }),
  }
}

function boardWithPolicies(
  board: BoardManifest,
  policies: Partial<BoardManifest['policies']>,
): BoardManifest {
  return { ...board, policies: { ...board.policies, ...policies } }
}

function emptyResolution() {
  return {
    pendingDeaths: [],
    inspections: [],
    exactInspections: [],
    factionInspections: [],
    savedPlayerIds: [],
    blockedDamage: [],
    consumedAbilityIds: [],
  }
}
