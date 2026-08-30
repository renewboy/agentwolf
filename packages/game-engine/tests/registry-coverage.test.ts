import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  AbilityIdSchema,
  CapabilityIdSchema,
  PhaseIdSchema,
  PlayerIdSchema,
  PluginEventTypeSchema,
  PluginIdSchema,
  QueryTypeSchema,
  RoleIdSchema,
  TriggerIdSchema,
  type GameEvent,
  type PlayerId,
} from '@agentwolf/contracts'
import {
  InterruptRegistry,
  PhaseGraphRegistry,
  PluginEventRegistry,
  QueryRegistry,
  ResolutionFrame,
  ResolutionRegistry,
  Role,
  RoleRegistry,
  RuleRegistry,
  SemanticOwnershipRecorder,
  TriggerRegistry,
  VictoryRegistry,
  classicCapabilities,
  classicIdentityQueries,
  createClassicRuleset,
  standardBoard,
  v1AbilityIds,
  visibility,
  type AbilityDefinition,
  type GameState,
  type RuleRuntime,
} from '../src/index.js'
import {
  appendFinalDeath,
  bySeat,
  currentNightActions,
  phase,
} from '../src/rulesets/classic/plugins/shared.js'
import { createManualEngine } from './helpers.js'

const pluginId = PluginIdSchema.parse('plugin-test-registry')
const eventType = PluginEventTypeSchema.parse('event-test-registry')
const queryType = QueryTypeSchema.parse('query-test-registry')
const roleId = RoleIdSchema.parse('role-test-registry')
const abilityId = AbilityIdSchema.parse('ability-test-registry')
const capabilityId = CapabilityIdSchema.parse('capability-test-registry')
const phaseA = PhaseIdSchema.parse('phase-test-a')
const phaseB = PhaseIdSchema.parse('phase-test-b')
const phaseC = PhaseIdSchema.parse('phase-test-c')

class TestRole extends Role {
  public readonly id = roleId
  public readonly displayNameKey = 'roles.test'
  public readonly faction = 'village' as const
  public readonly kind = 'god' as const
  public override readonly capabilities = [capabilityId]
  public readonly abilities: readonly AbilityDefinition[]

  public constructor(required = true) {
    super()
    this.abilities = [
      {
        id: abilityId,
        ...(required ? { requiredCapability: capabilityId } : {}),
        actionTypes: ['night-action'],
        validate: () => undefined,
        effects: () => [],
      },
    ]
  }
}

function engineRuntime() {
  const engine = createManualEngine(standardBoard)
  const ruleset = createClassicRuleset()
  return {
    state: engine.state,
    board: standardBoard,
    events: engine.events,
    roles: ruleset.roles,
    resolution: ruleset.resolution,
    victories: ruleset.victories,
    queries: ruleset.queries,
    triggers: ruleset.triggers,
    append: vi.fn((payload, eventVisibility) => ({
      matchId: engine.state.matchId,
      sequence: 1,
      occurredAt: '2026-08-28T00:00:00.000Z',
      visibility: eventVisibility,
      payload,
    })) as never,
  } satisfies RuleRuntime
}

describe('small registries', () => {
  it('registers and resolves interrupt handlers with duplicate/unknown protection', () => {
    const registry = new InterruptRegistry()
    const handler = { id: 'interrupt', nextPhase: () => phaseA }
    registry.register(handler)
    expect(registry.handler('interrupt')).toBe(handler)
    expect(() => registry.register(handler)).toThrow(/Duplicate interrupt/)
    expect(() => registry.handler('missing')).toThrow(/Unknown interrupt/)
  })

  it('registers roles, abilities, capabilities, ownership, and failure paths', () => {
    const owner = new SemanticOwnershipRecorder()
    owner.begin(pluginId)
    const registry = new RoleRegistry(owner)
    const role = new TestRole()
    registry.register(role)
    owner.end(pluginId)
    expect(registry.role(roleId)).toBe(role)
    expect(registry.ability(abilityId).role).toBe(role)
    expect(registry.hasAbility(abilityId)).toBe(true)
    expect(registry.list()).toEqual([role])
    expect(owner.contributions([pluginId])[0]).toMatchObject({
      roleIds: [roleId],
      abilityIds: [abilityId],
    })
    expect(() => registry.register(role)).toThrow(/Duplicate role/)
    const duplicateAbilityRole = new (class extends TestRole {
      public override readonly id = RoleIdSchema.parse('role-test-other')
    })()
    expect(() => registry.register(duplicateAbilityRole)).toThrow(/Duplicate ability/)
    expect(() => registry.role(RoleIdSchema.parse('role-unknown'))).toThrow(/Unknown role/)
    expect(() => registry.ability(AbilityIdSchema.parse('ability-unknown'))).toThrow(
      /Unknown ability/,
    )

    const base = [...createManualEngine(standardBoard).state.players.values()][0]!
    const player = {
      ...base,
      roleId,
      roleState: { ...base.roleState, capabilities: new Set([capabilityId]) },
    }
    expect(registry.capabilitiesFor(player)).toEqual(new Set([capabilityId]))
    expect(registry.hasCapability(player, capabilityId)).toBe(true)
    expect(registry.canUseAbility(player, abilityId)).toBe(true)
    expect(registry.abilitiesFor(player)).toHaveLength(1)
    expect(registry.abilityIdsForCapability(capabilityId)).toEqual([abilityId])
    expect(registry.capabilitiesFor({ ...player, roleId: null })).toEqual(new Set([capabilityId]))

    const direct = new RoleRegistry()
    const directRole = new TestRole(false)
    direct.register(directRole)
    expect(
      direct.canUseAbility(
        { ...player, roleState: { ...player.roleState, capabilities: new Set() } },
        abilityId,
      ),
    ).toBe(true)
    expect(direct.canUseAbility({ ...player, roleId: null }, abilityId)).toBe(false)
  })

  it('orders query modifiers, validates schemas, records ownership, and rejects duplicates', () => {
    const owner = new SemanticOwnershipRecorder()
    owner.begin(pluginId)
    const registry = new QueryRegistry(owner)
    const definition = {
      type: queryType,
      inputSchema: z.object({ value: z.number() }),
      resultSchema: z.number(),
      resolve: ({ value }: { value: number }) => value,
    }
    registry.register(definition as never)
    owner.end(pluginId)
    const calls: string[] = []
    for (const [id, order, amount] of [
      ['later', 2, 10],
      ['first', 1, 1],
      ['same-order', 2, 100],
    ] as const) {
      registry.registerModifier({
        id,
        type: queryType,
        order,
        inputSchema: z.object({ value: z.number() }),
        resultSchema: z.number(),
        transform: (_input: unknown, current: number) => {
          calls.push(id)
          return current + amount
        },
      } as never)
    }
    expect(registry.resolve(queryType, { value: 5 }, {} as never)).toBe(116)
    expect(calls).toEqual(['first', 'later', 'same-order'])
    expect(owner.contributions([pluginId])[0]?.queryTypes).toEqual([queryType])
    expect(() => registry.register(definition as never)).toThrow(/Duplicate query/)
    expect(() => registry.registerModifier({ id: 'later', type: queryType } as never)).toThrow(
      /Duplicate query modifier/,
    )
    expect(() => registry.resolve(QueryTypeSchema.parse('query-unknown'), {}, {} as never)).toThrow(
      /Unknown query/,
    )
    expect(() => registry.resolve(queryType, { value: 'bad' }, {} as never)).toThrow()
  })

  it('evaluates, canonicalizes, and rejects victory candidates', () => {
    const context = {} as never
    const empty = new VictoryRegistry()
    expect(empty.evaluate(context)).toBeNull()
    empty.register({ id: 'none', evaluate: () => null })
    expect(empty.evaluate(context)).toBeNull()
    expect(() => empty.register({ id: 'none', evaluate: () => null })).toThrow(/Duplicate/)

    const registry = new VictoryRegistry()
    registry.register({
      id: 'one',
      evaluate: () => ({
        winner: 'village',
        winningPlayerIds: [PlayerIdSchema.parse('player-2'), PlayerIdSchema.parse('player-1')],
        reason: 'done',
      }),
    })
    registry.register({
      id: 'two',
      evaluate: () => ({
        winner: 'village',
        winningPlayerIds: [PlayerIdSchema.parse('player-1'), PlayerIdSchema.parse('player-2')],
        reason: 'done',
      }),
    })
    expect(registry.evaluate(context)?.winningPlayerIds).toEqual(['player-1', 'player-2'])
    const modifierCalls: string[] = []
    registry.registerModifier({
      id: 'later',
      order: 10,
      transform: (_context, current) => {
        modifierCalls.push('later')
        return current
      },
    })
    registry.registerModifier({
      id: 'first',
      order: -10,
      transform: (_context, current) => {
        modifierCalls.push('first')
        return current
          ? {
              ...current,
              winningPlayerIds: [...current.winningPlayerIds, PlayerIdSchema.parse('player-3')],
            }
          : null
      },
    })
    expect(registry.evaluate(context)?.winningPlayerIds).toEqual([
      'player-1',
      'player-2',
      'player-3',
    ])
    expect(modifierCalls).toEqual(['first', 'later'])
    expect(() =>
      registry.registerModifier({ id: 'first', transform: (_context, current) => current }),
    ).toThrow(/Duplicate victory modifier/)

    const created = new VictoryRegistry()
    created.registerModifier({
      id: 'create',
      transform: () => ({
        winner: 'independent',
        winningPlayerIds: [player1()],
        reason: 'created',
      }),
    })
    expect(created.evaluate(context)?.winner).toBe('independent')
    created.registerModifier({ id: 'suppress', transform: () => null })
    expect(created.evaluate(context)).toBeNull()

    const repeated = new VictoryRegistry()
    repeated.register({
      id: 'repeat',
      evaluate: () => ({
        winner: 'village',
        winningPlayerIds: [player1(), player1()],
        reason: 'x',
      }),
    })
    expect(() => repeated.evaluate(context)).toThrow(/repeats a player/)
    const noPlayers = new VictoryRegistry()
    noPlayers.register({
      id: 'empty',
      evaluate: () => ({ winner: 'village', winningPlayerIds: [], reason: 'x' }),
    })
    expect(() => noPlayers.evaluate(context)).toThrow(/no winning players/)
    const conflicting = new VictoryRegistry()
    conflicting.register({
      id: 'a',
      evaluate: () => ({ winner: 'village', winningPlayerIds: [player1()], reason: 'x' }),
    })
    conflicting.register({
      id: 'b',
      evaluate: () => ({ winner: 'werewolf', winningPlayerIds: [player1()], reason: 'y' }),
    })
    expect(() => conflicting.evaluate(context)).toThrow(/Conflicting victory/)
  })
})

describe('semantic ownership', () => {
  it('records every semantic kind and freezes contributions', () => {
    const recorder = new SemanticOwnershipRecorder()
    recorder.begin(pluginId)
    recorder.role(roleId)
    recorder.ability(abilityId)
    recorder.phase(phaseA)
    recorder.pluginEvent(pluginId, eventType)
    recorder.query(queryType)
    recorder.trigger(TriggerIdSchema.parse('trigger-test'))
    recorder.end(pluginId)
    const contribution = recorder.contributions([pluginId])[0]!
    expect(contribution).toMatchObject({
      roleIds: [roleId],
      abilityIds: [abilityId],
      phaseIds: [phaseA],
      pluginEvents: [{ pluginId, eventType }],
      queryTypes: [queryType],
      triggerIds: ['trigger-test'],
    })
    expect(Object.isFrozen(contribution)).toBe(true)
  })

  it('rejects scope mismatches, duplicates, missing records, cross-owned events, and unfinished work', () => {
    const recorder = new SemanticOwnershipRecorder()
    expect(() => recorder.role(roleId)).toThrow(/active plugin/)
    recorder.begin(pluginId)
    expect(() => recorder.begin(PluginIdSchema.parse('plugin-other'))).toThrow(/cannot install/)
    expect(() => recorder.end(PluginIdSchema.parse('plugin-other'))).toThrow(/scope mismatch/)
    expect(() => recorder.pluginEvent(PluginIdSchema.parse('plugin-other'), eventType)).toThrow(
      /cannot register event/,
    )
    for (const invoke of [
      () => {
        recorder.role(roleId)
        recorder.role(roleId)
      },
      () => {
        recorder.ability(abilityId)
        recorder.ability(abilityId)
      },
      () => {
        recorder.phase(phaseA)
        recorder.phase(phaseA)
      },
      () => {
        recorder.query(queryType)
        recorder.query(queryType)
      },
      () => {
        const id = TriggerIdSchema.parse('trigger-duplicate')
        recorder.trigger(id)
        recorder.trigger(id)
      },
    ]) {
      expect(invoke).toThrow(/registered twice/)
    }
    recorder.pluginEvent(pluginId, eventType)
    expect(() => recorder.pluginEvent(pluginId, eventType)).toThrow(/registered twice/)
    expect(() => recorder.contributions([pluginId])).toThrow(/unfinished/)
    recorder.end(pluginId)
    expect(() => recorder.begin(pluginId)).toThrow(/installed twice/)
    expect(() => recorder.contributions([PluginIdSchema.parse('plugin-missing')])).toThrow(
      /no semantic install record/,
    )
  })
})

describe('automatic death trigger registry', () => {
  it('expands, de-duplicates, records ownership, and rejects invalid reactions', () => {
    const engine = createManualEngine(standardBoard)
    const players = [...engine.state.players.values()]
    const first = players[0]!
    const second = players[1]!
    const owner = new SemanticOwnershipRecorder()
    owner.begin(pluginId)
    const registry = new TriggerRegistry(owner)
    const triggerId = TriggerIdSchema.parse('trigger-test-automatic-death')
    registry.registerAutomaticDeath({
      id: triggerId,
      signal: 'player-death',
      react: ({ death }) =>
        death.playerId === first.id
          ? [{ death: { playerId: second.id, causes: ['linked'], timing: death.timing } }]
          : [],
    })
    owner.end(pluginId)
    expect(
      registry.resolveDeaths([{ playerId: first.id, causes: ['poison'], timing: 'night' }], {
        state: engine.state,
        board: standardBoard,
        roles: createClassicRuleset().roles,
      }),
    ).toMatchObject([
      { death: { playerId: first.id, causes: ['poison'], timing: 'night' }, original: true },
      { death: { playerId: second.id, causes: ['linked'], timing: 'night' }, original: false },
    ])
    expect(
      registry.resolveDeaths(
        [
          { playerId: first.id, causes: ['poison'], timing: 'night' },
          { playerId: first.id, causes: ['werewolf'], timing: 'night' },
        ],
        { state: engine.state, board: standardBoard, roles: createClassicRuleset().roles },
      )[0]?.death.causes,
    ).toEqual(['poison', 'werewolf'])
    expect(
      registry.resolveDeaths(
        [
          { playerId: first.id, causes: ['poison'], timing: 'night' },
          { playerId: second.id, causes: ['werewolf'], timing: 'night' },
        ],
        { state: engine.state, board: standardBoard, roles: createClassicRuleset().roles },
      )[1]?.death.causes,
    ).toEqual(['werewolf', 'linked'])
    expect(owner.contributions([pluginId])[0]?.triggerIds).toEqual([triggerId])
    expect(() =>
      registry.registerAutomaticDeath({ id: triggerId, signal: 'player-death', react: () => [] }),
    ).toThrow(/Duplicate trigger/)

    const duplicateDecision = new TriggerRegistry()
    const decisionId = TriggerIdSchema.parse('trigger-test-duplicate-decision')
    duplicateDecision.registerDecision({
      id: decisionId,
      signal: 'test',
      abilityId,
      eligible: () => true,
    })
    expect(() =>
      duplicateDecision.registerDecision({
        id: decisionId,
        signal: 'test',
        abilityId,
        eligible: () => true,
      }),
    ).toThrow(/Duplicate decision trigger/)
    expect(() =>
      duplicateDecision.registerAutomaticDeath({
        id: decisionId,
        signal: 'player-death',
        react: () => [],
      }),
    ).toThrow(/Duplicate trigger/)

    const ruleset = createClassicRuleset()
    const hunter = players.find((player) => player.roleId === 'role-hunter')!
    const hunterState: GameState = {
      ...engine.state,
      recentDeaths: new Map([
        [hunter.id, { playerId: hunter.id, causes: ['werewolf'], timing: 'night' }],
      ]),
    }
    expect(
      ruleset.triggers.abilityIdsFor(
        'player-death',
        hunter,
        hunterState,
        standardBoard,
        ruleset.roles,
      ),
    ).toContain(v1AbilityIds.hunterShot)

    const conflict = new TriggerRegistry()
    conflict.registerAutomaticDeath({
      id: TriggerIdSchema.parse('trigger-test-conflicting-death'),
      signal: 'player-death',
      react: () => [{ death: { playerId: second.id, causes: ['linked'], timing: 'day' } }],
    })
    expect(() =>
      conflict.resolveDeaths(
        [
          { playerId: first.id, causes: ['poison'], timing: 'night' },
          { playerId: second.id, causes: ['werewolf'], timing: 'night' },
        ],
        { state: engine.state, board: standardBoard, roles: createClassicRuleset().roles },
      ),
    ).toThrow(/conflicting timing/)

    const unknown = new TriggerRegistry()
    unknown.registerAutomaticDeath({
      id: TriggerIdSchema.parse('trigger-test-unknown-death'),
      signal: 'player-death',
      react: () => [
        {
          death: {
            playerId: PlayerIdSchema.parse('player-99'),
            causes: ['linked'],
            timing: 'day',
          },
        },
      ],
    })
    expect(() =>
      unknown.resolveDeaths([{ playerId: first.id, causes: ['exile'], timing: 'day' }], {
        state: engine.state,
        board: standardBoard,
        roles: createClassicRuleset().roles,
      }),
    ).toThrow(/unknown player/)
  })
})

describe('plugin event and rule registries', () => {
  it('validates/applies typed plugin events and legacy reducers', () => {
    const owner = new SemanticOwnershipRecorder()
    owner.begin(pluginId)
    const registry = new PluginEventRegistry(owner)
    const definition = {
      pluginId,
      eventType,
      schemaVersion: 1,
      stateSchema: z.object({ count: z.number() }),
      dataSchema: z.object({ amount: z.number() }),
      initialState: { count: 0 },
      reduce: (state: { count: number }, data: { amount: number }) => ({
        count: state.count + data.amount,
      }),
    }
    registry.register(definition as never)
    owner.end(pluginId)
    const envelope = { pluginId, eventType, schemaVersion: 1, data: { amount: 2 } }
    expect(registry.validate(envelope)).toEqual(envelope)
    expect(registry.apply(new Map(), envelope).get(pluginId)).toEqual({ count: 2 })
    expect(registry.apply(new Map([[pluginId, { count: 3 }]]), envelope).get(pluginId)).toEqual({
      count: 5,
    })
    expect(() => registry.register(definition as never)).toThrow(/Duplicate plugin event/)
    expect(() => registry.validate({ ...envelope, schemaVersion: 2 })).toThrow(
      /Unknown plugin event/,
    )
    expect(() => registry.validate({ ...envelope, data: { amount: 'bad' } } as never)).toThrow()
    const state = createManualEngine(standardBoard).state
    const legacyEvent = { payload: { type: 'match.resumed' } } as GameEvent
    expect(registry.applyLegacy(state, legacyEvent)).toBeNull()
    registry.registerLegacyReducer('match.resumed', (current) => ({ ...current, day: 99 }))
    expect(registry.applyLegacy(state, legacyEvent)?.day).toBe(99)
    expect(() => registry.registerLegacyReducer('match.resumed', (value) => value)).toThrow(
      /Duplicate legacy event reducer/,
    )
  })

  it('selects/evaluates dynamic and registered rules and orders phase handlers', () => {
    const registry = new RuleRegistry()
    const runtime = engineRuntime()
    expect(registry.selectActors(undefined, runtime)).toEqual([])
    expect(registry.evaluate(undefined, runtime)).toBe(true)
    expect(registry.selectActors('faction-alive:village', runtime).length).toBeGreaterThan(0)
    expect(registry.selectActors('faction-alive:independent', runtime)).toEqual([])
    expect(
      registry.selectActors(`capability-alive:${classicCapabilities.witchPoison}`, runtime),
    ).toHaveLength(1)
    expect(registry.evaluate(`capability-active:${classicCapabilities.witchPoison}`, runtime)).toBe(
      true,
    )
    expect(registry.evaluate('capability-active:capability-test-missing', runtime)).toBe(false)
    registry.registerActorSelector('custom', () => [player1()])
    registry.registerPredicate('custom', () => false)
    expect(registry.selectActors('custom', runtime)).toEqual([player1()])
    expect(registry.evaluate('custom', runtime)).toBe(false)
    expect(() => registry.registerActorSelector('custom', () => [])).toThrow(/Duplicate actor/)
    expect(() => registry.registerPredicate('custom', () => true)).toThrow(/Duplicate rule/)
    expect(() => registry.selectActors('missing', runtime)).toThrow(/Unknown actor/)
    expect(() => registry.evaluate('missing', runtime)).toThrow(/Unknown rule/)

    const calls: string[] = []
    registry.registerPhaseHandler(phaseA, () => calls.push('late'), { id: 'late', order: 2 })
    registry.registerPhaseHandler(phaseA, () => calls.push('first'), { id: 'first', order: 1 })
    registry.registerPhaseHandler(phaseA, () => calls.push('same'), { order: 2 })
    expect(() => registry.registerPhaseHandler(phaseA, () => undefined, { id: 'late' })).toThrow(
      /Duplicate phase handler/,
    )
    registry.complete(phaseA, runtime)
    registry.complete(phaseB, runtime)
    expect(calls).toEqual(['first', 'late', 'same'])
    const validationCalls: string[] = []
    registry.registerActionValidator('late', () => validationCalls.push('late'), { order: 2 })
    registry.registerActionValidator('first', () => validationCalls.push('first'), { order: 1 })
    registry.registerActionValidator('same', () => validationCalls.push('same'), { order: 2 })
    expect(() => registry.registerActionValidator('first', () => undefined)).toThrow(
      /Duplicate action validator/,
    )
    registry.validateAction(
      { id: phaseA, labelKey: 'phases.dayResolve', mode: 'automatic', edges: [] },
      {
        type: 'vote',
        matchId: runtime.state.matchId,
        actorId: player1(),
        targetId: null,
        kind: 'exile',
      },
      runtime,
    )
    expect(validationCalls).toEqual(['first', 'late', 'same'])
    expect(visibility.public).toEqual({ kind: 'public' })
    expect(visibility.god).toEqual({ kind: 'god' })
    expect(visibility.players([player1()])).toEqual({ kind: 'players', playerIds: [player1()] })
    expect(visibility.faction('werewolf')).toEqual({ kind: 'faction', faction: 'werewolf' })
  })
})

describe('resolution registry', () => {
  const context = {} as never
  const damage = {
    kind: 'damage',
    priority: 1,
    sourceId: player1(),
    targetId: PlayerIdSchema.parse('player-2'),
    cause: 'poison',
  } as const
  const protect = {
    kind: 'protect',
    priority: 1,
    sourceId: player1(),
    targetId: PlayerIdSchema.parse('player-2'),
    protection: 'test',
    blocks: ['poison'],
  } as const

  it('caches frame facts, enqueues effects, orders lanes/finalizers, and merges contributions', () => {
    const enqueued: unknown[] = []
    const frame = new ResolutionFrame((effect) => enqueued.push(effect))
    const create = vi.fn(() => ({ value: 1 }))
    expect(frame.fact('fact', create)).toEqual({ value: 1 })
    expect(frame.fact('fact', create)).toEqual({ value: 1 })
    expect(create).toHaveBeenCalledOnce()
    expect(frame.read('missing', 'fallback')).toBeUndefined()
    frame.enqueue(damage)
    expect(enqueued).toEqual([damage])

    const registry = new ResolutionRegistry()
    const calls: string[] = []
    registry.registerEffect({
      kind: 'damage',
      schema: z.any(),
      lane: 'damage',
      apply: (_effect: typeof damage, _context: unknown, currentFrame: ResolutionFrame) => {
        calls.push('damage')
        currentFrame.fact('deaths', () => new Set()).add(player1())
      },
    } as never)
    registry.registerEffect({
      kind: 'protect',
      schema: z.any(),
      lane: 'protection',
      apply: () => calls.push('protect'),
    } as never)
    registry.registerFinalizer({
      id: 'later',
      order: 2,
      finalize: () => ({
        pendingDeaths: [{ playerId: player1(), causes: ['poison', 'poison'] }],
        savedPlayerIds: [player1(), player1()],
        inspections: [{ sourceId: player1(), targetId: player1(), result: 'village' }],
      }),
    } as never)
    registry.registerFinalizer({
      id: 'first',
      finalize: () => ({
        pendingDeaths: [{ playerId: player1(), causes: ['werewolf'] }],
        exactInspections: [{ sourceId: player1(), targetId: player1(), roleId: roleId }],
        consumedAbilityIds: [{ playerId: player1(), abilityId }],
      }),
    } as never)
    registry.registerFinalizer({ id: 'empty', finalize: () => ({}) })
    const result = registry.settle([damage, protect], context)
    expect(calls).toEqual(['protect', 'damage'])
    expect(result.pendingDeaths).toEqual([{ playerId: player1(), causes: ['werewolf', 'poison'] }])
    expect(result.savedPlayerIds).toEqual([player1()])
    expect(result.inspections).toHaveLength(1)
    expect(result.exactInspections).toHaveLength(1)
    expect(result.consumedAbilityIds).toHaveLength(1)
    expect(() => registry.registerEffect({ kind: 'damage' } as never)).toThrow(/Duplicate effect/)
    expect(() => registry.registerFinalizer({ id: 'first' } as never)).toThrow(
      /Duplicate resolution finalizer/,
    )
    expect(() =>
      registry.settle([{ ...damage, kind: 'consume-ability' }] as never, context),
    ).toThrow(/Unknown resolution effect/)
  })

  it('honors before/after ordering and rejects missing/cross-lane/cyclic dependencies', () => {
    const ordered = new ResolutionRegistry()
    const calls: string[] = []
    ordered.registerEffect({
      kind: 'damage',
      schema: z.any(),
      lane: 'damage',
      after: ['protect'],
      apply: () => calls.push('damage'),
    } as never)
    ordered.registerEffect({
      kind: 'protect',
      schema: z.any(),
      lane: 'damage',
      apply: () => calls.push('protect'),
    } as never)
    ordered.settle([damage, protect], context)
    expect(calls).toEqual(['protect', 'damage'])

    const before = new ResolutionRegistry()
    before.registerEffect({
      kind: 'damage',
      schema: z.any(),
      lane: 'damage',
      before: ['protect'],
      apply: () => undefined,
    } as never)
    before.registerEffect({
      kind: 'protect',
      schema: z.any(),
      lane: 'damage',
      apply: () => undefined,
    } as never)
    expect(() => before.settle([], context)).not.toThrow()

    const missing = new ResolutionRegistry()
    missing.registerEffect({
      kind: 'damage',
      schema: z.any(),
      lane: 'damage',
      after: ['protect'],
      apply: () => undefined,
    } as never)
    expect(() => missing.settle([], context)).toThrow(/orders against unknown/)

    const cross = new ResolutionRegistry()
    cross.registerEffect({
      kind: 'damage',
      schema: z.any(),
      lane: 'damage',
      after: ['protect'],
      apply: () => undefined,
    } as never)
    cross.registerEffect({
      kind: 'protect',
      schema: z.any(),
      lane: 'protection',
      apply: () => undefined,
    } as never)
    expect(() => cross.settle([], context)).toThrow(/cannot order across/)

    const cycle = new ResolutionRegistry()
    cycle.registerEffect({
      kind: 'damage',
      schema: z.any(),
      lane: 'damage',
      after: ['protect'],
      apply: () => undefined,
    } as never)
    cycle.registerEffect({
      kind: 'protect',
      schema: z.any(),
      lane: 'damage',
      after: ['damage'],
      apply: () => undefined,
    } as never)
    expect(() => cycle.settle([], context)).toThrow(/ordering cycle/)
  })

  it('bounds recursively enqueued effects', () => {
    const registry = new ResolutionRegistry()
    registry.registerEffect({
      kind: 'damage',
      schema: z.any(),
      lane: 'damage',
      apply: (effect: typeof damage, _context: unknown, frame: ResolutionFrame) =>
        frame.enqueue(effect),
    } as never)
    expect(() => registry.settle([damage], context)).toThrow(/exceeded 1000 steps/)
  })
})

describe('phase graph registry', () => {
  const node = (id: typeof phaseA, edges: (typeof phaseA)[] = []) => ({
    id,
    labelKey: 'phases.matchEnded',
    mode: 'automatic' as const,
    edges: edges.map((to) => ({ to })),
  })

  it('builds base graphs and ordered before/after insertions', () => {
    const registry = new PhaseGraphRegistry()
    registry.registerBase({
      id: 'graph',
      entry: phaseA,
      nodes: new Map([
        [phaseA, node(phaseA, [phaseB])],
        [phaseB, node(phaseB)],
      ]),
    })
    registry.insert({ node: node(phaseC), after: phaseA, before: phaseB })
    const built = registry.build()
    expect(built.nodes.get(phaseA)?.edges[0]?.to).toBe(phaseC)
    expect(built.nodes.get(phaseC)?.edges[0]?.to).toBe(phaseB)
    expect(() => registry.configure({ id: 'again', entry: phaseA })).toThrow(
      /Duplicate phase graph/,
    )
    expect(() => registry.register(node(phaseA))).toThrow(/Duplicate phase node/)
    expect(() => registry.insert({ node: node(phaseC), after: null, before: phaseA })).toThrow(
      /Duplicate phase insertion/,
    )
  })

  it('rejects missing configuration, targets, edges, entries, unreachable nodes, and cycles', () => {
    expect(() => new PhaseGraphRegistry().build()).toThrow(/no configured phase graph/)
    const missingTarget = new PhaseGraphRegistry()
    missingTarget.registerBase({ id: 'g', entry: phaseA, nodes: new Map([[phaseA, node(phaseA)]]) })
    missingTarget.insert({ node: node(phaseB), after: phaseA, before: phaseC })
    expect(() => missingTarget.build()).toThrow(/targets missing/)

    const wrongEntry = new PhaseGraphRegistry()
    wrongEntry.registerBase({ id: 'g', entry: phaseA, nodes: new Map([[phaseA, node(phaseA)]]) })
    wrongEntry.insert({ node: node(phaseB), after: null, before: phaseC })
    expect(() => wrongEntry.build()).toThrow(/targets missing|cannot precede/)

    const missingAfter = new PhaseGraphRegistry()
    missingAfter.registerBase({ id: 'g', entry: phaseA, nodes: new Map([[phaseA, node(phaseA)]]) })
    missingAfter.insert({ node: node(phaseB), after: phaseC, before: phaseA })
    expect(() => missingAfter.build()).toThrow(/follows missing/)

    const noEdge = new PhaseGraphRegistry()
    noEdge.registerBase({
      id: 'g',
      entry: phaseA,
      nodes: new Map([
        [phaseA, node(phaseA)],
        [phaseB, node(phaseB)],
      ]),
    })
    noEdge.insert({ node: node(phaseC), after: phaseA, before: phaseB })
    expect(() => noEdge.build()).toThrow(/cannot insert between/)

    const edgeMissing = new PhaseGraphRegistry()
    edgeMissing.registerBase({
      id: 'g',
      entry: phaseA,
      nodes: new Map([[phaseA, node(phaseA, [phaseB])]]),
    })
    expect(() => edgeMissing.build()).toThrow(/targets missing/)

    const unreachable = new PhaseGraphRegistry()
    unreachable.registerBase({
      id: 'g',
      entry: phaseA,
      nodes: new Map([
        [phaseA, node(phaseA)],
        [phaseB, node(phaseB)],
      ]),
    })
    expect(() => unreachable.build()).toThrow(/unreachable/)

    const cycle = new PhaseGraphRegistry()
    cycle.registerBase({ id: 'g', entry: phaseA, nodes: new Map([[phaseA, node(phaseA)]]) })
    cycle.insert({ node: node(phaseB), after: phaseC, before: phaseA })
    cycle.insert({ node: node(phaseC), after: phaseB, before: phaseA })
    expect(() => cycle.build()).toThrow(/insertion cycle/)
  })
})

describe('classic query/shared helpers', () => {
  it('resolves identity queries and rejects targets without roles', () => {
    const engine = createManualEngine(standardBoard)
    const ruleset = createClassicRuleset()
    const players = [...engine.state.players.values()]
    const wolf = players.find((player) => player.faction === 'werewolf')!
    const villager = players.find((player) => player.faction === 'village')!
    const context = { state: engine.state, board: standardBoard, roles: ruleset.roles }
    expect(
      ruleset.queries.resolve(classicIdentityQueries.alignment, { targetId: wolf.id }, context),
    ).toBe('werewolf')
    expect(
      ruleset.queries.resolve(classicIdentityQueries.alignment, { targetId: villager.id }, context),
    ).toBe('village')
    expect(
      ruleset.queries.resolve(classicIdentityQueries.exactRole, { targetId: wolf.id }, context),
    ).toBe(wolf.roleId)
    const hiddenState = {
      ...engine.state,
      players: new Map(engine.state.players).set(villager.id, { ...villager, roleId: null }),
    } as GameState
    expect(() =>
      ruleset.queries.resolve(
        classicIdentityQueries.alignment,
        { targetId: villager.id },
        { ...context, state: hiddenState },
      ),
    ).toThrow(/unknown role/)
    expect(() =>
      ruleset.queries.resolve(
        classicIdentityQueries.exactRole,
        { targetId: villager.id },
        { ...context, state: hiddenState },
      ),
    ).toThrow(/unknown role/)
  })

  it('sorts seats, appends death events, and extracts current-night actions', () => {
    const runtime = engineRuntime()
    const ids = [...runtime.state.players.keys()]
    expect(bySeat(runtime, [ids[2]!, 'player-99' as PlayerId, ids[0]!])).toEqual([
      ids[0],
      ids[2],
      'player-99',
    ])
    appendFinalDeath(runtime, ids[0]!, ['poison'])
    expect(runtime.append).toHaveBeenCalledTimes(2)
    expect(() => appendFinalDeath(runtime, 'player-99' as PlayerId, ['poison'])).toThrow(
      /Unknown death target/,
    )
    expect(currentNightActions(runtime)).toEqual([])
    const night = {
      ...runtime,
      events: [
        { sequence: 1, payload: { type: 'action.submitted', action: { type: 'speech' } } },
        { sequence: 2, payload: { type: 'night.started' } },
        {
          sequence: 3,
          payload: {
            type: 'action.submitted',
            action: { type: 'night-action', actorId: ids[0]!, targetIds: [] },
          },
        },
      ],
    } as unknown as RuleRuntime
    expect(currentNightActions(night)).toEqual([expect.objectContaining({ type: 'night-action' })])
    expect(phase('phase-test-shared')).toBe('phase-test-shared')
  })
})

function player1(): PlayerId {
  return PlayerIdSchema.parse('player-1')
}
