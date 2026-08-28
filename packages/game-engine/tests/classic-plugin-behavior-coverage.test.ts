import {
  GameEventSchema,
  type AbilityId,
  PhaseIdSchema,
  PlayerIdSchema,
  RoleIdSchema,
  type EventVisibility,
  type GameEvent,
  type GameEventPayload,
  type PlayerAction,
  type PlayerId,
} from '@agentwolf/contracts'
import { describe, expect, it } from 'vitest'
import {
  awakenedHiddenWolfAbilityIds,
  awakenedHiddenWolfEventTypes,
  classicCapabilities,
  classicIdentityQueries,
  createClassicRuleset,
  mirrorHiddenBoard,
  standardBoard,
  type GameState,
  type RuleRuntime,
  type RulesetRuntime,
} from '../src/index.js'
import { classicPluginIds } from '../src/rulesets/classic/plugins/ids.js'
import { actorsWithRole, createManualEngine } from './helpers.js'

describe('classic day and sheriff plugin behavior', () => {
  it('selects day and sheriff actors across empty, live, dead, and tied states', () => {
    const engine = createManualEngine(standardBoard)
    const harness = ruleHarness(standardBoard, engine.state)
    const players = [...engine.state.players.values()]
    const first = players[0]!
    const second = players[1]!
    const deadSecond = { ...second, alive: false }

    harness.setState({
      ...engine.state,
      speechOrder: [second.id, first.id],
      players: new Map(engine.state.players).set(second.id, deadSecond),
      sheriff: {
        ...engine.state.sheriff,
        holderId: second.id,
        initialCandidates: new Set([first.id]),
        standingCandidates: new Set([first.id, second.id]),
      },
      lastVote: {
        kind: 'exile',
        selectedPlayerId: null,
        tiedPlayerIds: [first.id, second.id],
        totals: {},
      },
    })

    expect(harness.ruleset.rules.selectActors('day-speech-order', harness.runtime)).toEqual([
      second.id,
      first.id,
    ])
    expect(harness.ruleset.rules.selectActors('eligible-voters', harness.runtime)).not.toContain(
      second.id,
    )
    expect(harness.ruleset.rules.selectActors('exile-tied-players', harness.runtime)).toHaveLength(
      2,
    )
    expect(
      harness.ruleset.rules.selectActors('eligible-runoff-voters', harness.runtime),
    ).not.toEqual(expect.arrayContaining([first.id, second.id]))
    expect(harness.ruleset.rules.evaluate('exile-vote-tied', harness.runtime)).toBe(true)

    expect(harness.ruleset.rules.selectActors('publicly-alive', harness.runtime)).not.toContain(
      second.id,
    )
    expect(
      harness.ruleset.rules.selectActors('standing-sheriff-candidates', harness.runtime),
    ).toHaveLength(2)
    expect(
      harness.ruleset.rules.selectActors('original-sheriff-noncandidates', harness.runtime),
    ).not.toContain(first.id)
    expect(
      harness.ruleset.rules.selectActors('sheriff-tied-candidates', harness.runtime),
    ).toHaveLength(2)
    expect(harness.ruleset.rules.selectActors('sheriff-or-system', harness.runtime)).toEqual([])
    expect(harness.ruleset.rules.selectActors('dead-sheriff', harness.runtime)).toEqual([second.id])
    expect(harness.ruleset.rules.evaluate('multiple-standing-candidates', harness.runtime)).toBe(
      true,
    )
    expect(harness.ruleset.rules.evaluate('sheriff-vote-tied', harness.runtime)).toBe(true)
    expect(harness.ruleset.rules.evaluate('dead-sheriff-holds-badge', harness.runtime)).toBe(true)

    harness.setState({
      ...harness.runtime.state,
      day: 1,
      sheriff: {
        ...harness.runtime.state.sheriff,
        holderId: first.id,
        badgeLost: false,
        standingCandidates: new Set(),
      },
      lastVote: null,
    })
    expect(harness.ruleset.rules.selectActors('sheriff-or-system', harness.runtime)).toEqual([
      first.id,
    ])
    expect(harness.ruleset.rules.selectActors('dead-sheriff', harness.runtime)).toEqual([])
    expect(harness.ruleset.rules.evaluate('first-day-with-sheriff', harness.runtime)).toBe(true)
    expect(harness.ruleset.rules.evaluate('multiple-standing-candidates', harness.runtime)).toBe(
      false,
    )
    expect(harness.ruleset.rules.evaluate('sheriff-vote-tied', harness.runtime)).toBe(false)
  })

  it('routes detonation interrupts and resolves every exile result', () => {
    const engine = createManualEngine(standardBoard)
    const players = [...engine.state.players.values()]
    const hunter = players.find((player) => player.roleId === 'role-hunter')!
    const target = players.find((player) => player.roleId === 'role-villager')!
    const harness = ruleHarness(standardBoard, engine.state)
    const handler = harness.ruleset.interrupts.handler('classic-day-detonation')
    const election = {
      handlerId: handler.id,
      capabilityIds: [classicCapabilities.wolfSelfDestruct],
      context: 'sheriff-election' as const,
      visibility: 'public' as const,
    }
    const daytime = { ...election, context: 'daytime' as const }

    expect(handler.events?.(harness.runtime, election, {} as never)).toEqual([
      expect.objectContaining({ payload: expect.objectContaining({ type: 'sheriff.badge-lost' }) }),
    ])
    expect(handler.events?.(harness.runtime, daytime, {} as never)).toEqual([])

    harness.setState({
      ...engine.state,
      recentDeaths: new Map([[hunter.id, { playerId: hunter.id, causes: ['werewolf'] }]]),
    })
    expect(handler.nextPhase(harness.runtime, daytime, {} as never)).toBe('phase-death-triggers')

    harness.setState({
      ...engine.state,
      night: 1,
      players: new Map(
        [...engine.state.players].map(([id, player]) => [
          id,
          player.faction === 'werewolf' ? { ...player, alive: false } : player,
        ]),
      ),
      recentDeaths: new Map(),
    })
    expect(handler.nextPhase(harness.runtime, daytime, {} as never)).toBe('phase-match-ended')

    harness.setState(engine.state)
    expect(handler.nextPhase(harness.runtime, election, {} as never)).toBe('phase-day-announcement')
    harness.setState({
      ...engine.state,
      sheriff: { ...engine.state.sheriff, holderId: hunter.id },
      players: new Map(engine.state.players).set(hunter.id, { ...hunter, alive: false }),
    })
    expect(handler.nextPhase(harness.runtime, daytime, {} as never)).toBe('phase-sheriff-transfer')
    harness.setState(engine.state)
    expect(handler.nextPhase(harness.runtime, daytime, {} as never)).toBe('phase-last-words')

    for (const [selectedPlayerId, prevented] of [
      [null, null],
      [target.id, target.id],
      [target.id, null],
    ] as const) {
      harness.clearEvents()
      harness.setState({
        ...engine.state,
        preventedExilePlayerId: prevented,
        lastVote: {
          kind: 'exile',
          selectedPlayerId,
          tiedPlayerIds: [],
          totals: {},
        },
      })
      harness.ruleset.rules.complete(PhaseIdSchema.parse('phase-day-resolve'), harness.runtime)
      expect(harness.events.some((entry) => entry.payload.type === 'day.completed')).toBe(true)
      expect(harness.events.some((entry) => entry.payload.type === 'player.died')).toBe(
        selectedPlayerId !== null && prevented === null,
      )
    }
  })

  it('elects a sole candidate, a vote winner, or loses the badge', () => {
    const engine = createManualEngine(standardBoard)
    const [first, second] = [...engine.state.players.values()]
    const harness = ruleHarness(standardBoard, engine.state)
    const cases = [
      {
        standingCandidates: new Set([first!.id]),
        lastVote: null,
        expected: 'sheriff.elected',
      },
      {
        standingCandidates: new Set<PlayerId>(),
        lastVote: {
          kind: 'sheriff',
          selectedPlayerId: second!.id,
          tiedPlayerIds: [],
          totals: {},
        },
        expected: 'sheriff.elected',
      },
      {
        standingCandidates: new Set<PlayerId>(),
        lastVote: {
          kind: 'exile',
          selectedPlayerId: second!.id,
          tiedPlayerIds: [],
          totals: {},
        },
        expected: 'sheriff.badge-lost',
      },
      {
        standingCandidates: new Set<PlayerId>(),
        lastVote: null,
        expected: 'sheriff.badge-lost',
      },
    ] as const

    for (const entry of cases) {
      harness.clearEvents()
      harness.setState({
        ...engine.state,
        sheriff: { ...engine.state.sheriff, standingCandidates: entry.standingCandidates },
        lastVote: entry.lastVote,
      })
      harness.ruleset.rules.complete(PhaseIdSchema.parse('phase-sheriff-resolve'), harness.runtime)
      expect(harness.events.at(-1)?.payload.type).toBe(entry.expected)
    }
  })
})

describe('classic legacy event plugin behavior', () => {
  it('updates role memory, rejects unknown actors, and ignores a changing payload', () => {
    const engine = createManualEngine(standardBoard)
    const ruleset = createClassicRuleset()
    const idiotId = actorsWithRole(engine, 'role-idiot')[0]!
    const guardLikeId = [...engine.state.players.keys()][0]!
    const idiotEvent = gameEvent(engine.state, {
      type: 'idiot.revealed',
      playerId: idiotId,
    })
    expect(
      ruleset.events.applyLegacy(engine.state, idiotEvent)?.players.get(idiotId),
    ).toMatchObject({ canVote: false, roleState: { memory: { 'idiot.revealed': true } } })

    const guardEvent = gameEvent(engine.state, {
      type: 'guard.protected',
      actorId: guardLikeId,
      targetId: idiotId,
    })
    expect(
      ruleset.events.applyLegacy(engine.state, guardEvent)?.players.get(guardLikeId)?.roleState
        .memory,
    ).toMatchObject({ 'guard.lastTarget': idiotId })

    expect(() =>
      ruleset.events.applyLegacy(
        engine.state,
        gameEvent(engine.state, {
          type: 'idiot.revealed',
          playerId: PlayerIdSchema.parse('player-99'),
        }),
      ),
    ).toThrow(/Unknown Idiot reveal player/)
    expect(() =>
      ruleset.events.applyLegacy(
        engine.state,
        gameEvent(engine.state, {
          type: 'guard.protected',
          actorId: PlayerIdSchema.parse('player-99'),
          targetId: null,
        }),
      ),
    ).toThrow(/Unknown Guard actor/)

    let reads = 0
    const payload = new Proxy(
      { playerId: idiotId },
      {
        get(target, property, receiver) {
          if (property === 'type') return reads++ === 0 ? 'idiot.revealed' : 'day.completed'
          return Reflect.get(target, property, receiver)
        },
      },
    )
    const changing = { ...idiotEvent, payload } as GameEvent
    expect(ruleset.events.applyLegacy(engine.state, changing)).toBe(engine.state)
  })
})

describe('awakened hidden wolf plugin behavior', () => {
  it('reduces learned, status, attack, and informational plugin events', () => {
    const ruleset = createClassicRuleset()
    const actorId = PlayerIdSchema.parse('player-1')
    const otherId = PlayerIdSchema.parse('player-2')
    let states = new Map()
    for (const data of [
      { actorId, targetId: otherId, roleId: RoleIdSchema.parse('role-witch'), night: 1 },
      { actorId, targetId: otherId, roleId: RoleIdSchema.parse('role-guard'), night: 2 },
    ]) {
      states = new Map(
        ruleset.events.apply(states, {
          pluginId: classicPluginIds.awakenedHiddenWolf,
          eventType: awakenedHiddenWolfEventTypes.learned,
          schemaVersion: 1,
          data,
        }),
      )
    }
    for (const data of [
      { actorId, night: 1, armed: false },
      { actorId, night: 1, armed: true },
    ]) {
      states = new Map(
        ruleset.events.apply(states, {
          pluginId: classicPluginIds.awakenedHiddenWolf,
          eventType: awakenedHiddenWolfEventTypes.status,
          schemaVersion: 1,
          data,
        }),
      )
    }
    for (const data of [
      { actorId, night: 1, targetIds: [otherId] },
      { actorId, night: 1, targetIds: [actorId, otherId] },
    ]) {
      states = new Map(
        ruleset.events.apply(states, {
          pluginId: classicPluginIds.awakenedHiddenWolf,
          eventType: awakenedHiddenWolfEventTypes.attacked,
          schemaVersion: 1,
          data,
        }),
      )
    }
    for (const [eventType, data] of [
      [
        awakenedHiddenWolfEventTypes.inspected,
        { actorId, targetId: otherId, roleId: RoleIdSchema.parse('role-villager') },
      ],
      [awakenedHiddenWolfEventTypes.poisoned, { actorId, targetId: otherId }],
      [awakenedHiddenWolfEventTypes.protected, { actorId, targetId: otherId }],
    ] as const) {
      states = new Map(
        ruleset.events.apply(states, {
          pluginId: classicPluginIds.awakenedHiddenWolf,
          eventType,
          schemaVersion: 1,
          data,
        }),
      )
    }
    expect(states.get(classicPluginIds.awakenedHiddenWolf)).toMatchObject({
      learnings: [expect.objectContaining({ roleId: 'role-guard' })],
      statuses: [expect.objectContaining({ armed: true })],
      attacks: [expect.objectContaining({ targetIds: [actorId, otherId] })],
    })
  })

  it('selects actors, masks exact roles, and publishes status changes', () => {
    const engine = createManualEngine(mirrorHiddenBoard)
    const actorId = actorsWithRole(engine, 'role-awakened-hidden-wolf')[0]!
    const harness = ruleHarness(mirrorHiddenBoard, engine.state)

    expect(
      harness.ruleset.rules.selectActors('awakened-hidden-wolf-alive', harness.runtime),
    ).toEqual([actorId])
    expect(
      harness.ruleset.rules.selectActors('awakened-hidden-wolf-can-learn', harness.runtime),
    ).toEqual([actorId])
    expect(
      harness.ruleset.rules.selectActors('awakened-hidden-wolf-copy-active', harness.runtime),
    ).toEqual([])
    expect(harness.ruleset.rules.evaluate('has-awakened-hidden-wolf', harness.runtime)).toBe(true)
    expect(
      harness.ruleset.rules.evaluate('has-awakened-hidden-wolf-learning', harness.runtime),
    ).toBe(true)
    expect(harness.ruleset.rules.evaluate('has-awakened-hidden-wolf-copy', harness.runtime)).toBe(
      false,
    )

    const actor = engine.state.players.get(actorId)!
    harness.setState({
      ...engine.state,
      players: new Map(engine.state.players).set(actorId, {
        ...actor,
        roleState: {
          ...actor.roleState,
          capabilities: new Set([
            ...actor.roleState.capabilities,
            classicCapabilities.awakenedHiddenWolfInspect,
          ]),
        },
      }),
    })
    expect(
      harness.ruleset.rules.selectActors('awakened-hidden-wolf-copy-active', harness.runtime),
    ).toEqual([actorId])

    expect(
      harness.ruleset.queries.resolve(
        classicIdentityQueries.exactRole,
        { targetId: actorId },
        { state: harness.runtime.state, board: mirrorHiddenBoard, roles: harness.ruleset.roles },
      ),
    ).toBe('role-awakened-hidden-wolf')
    harness.setState({
      ...harness.runtime.state,
      pluginState: new Map(harness.runtime.state.pluginState).set(
        classicPluginIds.awakenedHiddenWolf,
        {
          learnings: [
            {
              actorId,
              targetId: [...engine.state.players.keys()][0]!,
              roleId: 'role-guard',
              night: 1,
            },
          ],
          statuses: [],
          attacks: [],
        },
      ),
    })
    expect(
      harness.ruleset.queries.resolve(
        classicIdentityQueries.exactRole,
        { targetId: actorId },
        { state: harness.runtime.state, board: mirrorHiddenBoard, roles: harness.ruleset.roles },
      ),
    ).toBe('role-guard')

    harness.clearEvents()
    harness.setState({
      ...engine.state,
      night: 1,
      players: new Map(
        [...engine.state.players].map(([id, player]) => [
          id,
          player.faction === 'werewolf' && id !== actorId ? { ...player, alive: false } : player,
        ]),
      ),
    })
    harness.ruleset.rules.complete(
      PhaseIdSchema.parse('phase-night-awakened-hidden-wolf-status'),
      harness.runtime,
    )
    expect(harness.events.map((entry) => entry.payload.type)).toEqual([
      'capability.granted',
      'plugin.event',
    ])

    harness.clearEvents()
    harness.setState({ ...engine.state, night: 2 })
    harness.ruleset.rules.complete(
      PhaseIdSchema.parse('phase-night-awakened-hidden-wolf-status'),
      harness.runtime,
    )
    expect(harness.events.at(-1)?.payload).toMatchObject({
      type: 'plugin.event',
      data: { armed: false },
    })
  })

  it('publishes attacks once and settles valid, skipped, and invalid learn actions', () => {
    const engine = createManualEngine(mirrorHiddenBoard)
    const actorId = actorsWithRole(engine, 'role-awakened-hidden-wolf')[0]!
    const witchId = actorsWithRole(engine, 'role-witch')[0]!
    const targetId = actorsWithRole(engine, 'role-villager')[0]!
    const attack = nightAction(engine.state, actorId, awakenedHiddenWolfAbilityIds.kill, [targetId])
    const attackHarness = ruleHarness(mirrorHiddenBoard, {
      ...engine.state,
      night: 1,
      phaseActions: [{ ...attack, option: 'pass' }, { ...attack, targetIds: [] }, attack],
    })
    attackHarness.ruleset.rules.complete(
      PhaseIdSchema.parse('phase-night-awakened-hidden-wolf-attack'),
      attackHarness.runtime,
    )
    expect(attackHarness.events.map((entry) => entry.payload.type)).toEqual([
      'plugin.event',
      'night.attack-selected',
    ])
    attackHarness.ruleset.rules.complete(
      PhaseIdSchema.parse('phase-night-awakened-hidden-wolf-attack'),
      attackHarness.runtime,
    )
    expect(attackHarness.events.map((entry) => entry.payload.type)).toEqual([
      'plugin.event',
      'night.attack-selected',
    ])

    const learn = nightAction(engine.state, actorId, awakenedHiddenWolfAbilityIds.learn, [witchId])
    const learnHarness = ruleHarness(mirrorHiddenBoard, {
      ...engine.state,
      night: 1,
      phaseActions: [
        { ...learn, option: 'pass' },
        { ...learn, abilityId: awakenedHiddenWolfAbilityIds.kill },
        { ...learn, targetIds: [] },
        { type: 'speech', matchId: engine.state.matchId, actorId, kind: 'day', text: 'skip' },
        learn,
      ],
    })
    learnHarness.ruleset.rules.complete(
      PhaseIdSchema.parse('phase-night-awakened-hidden-wolf-learn'),
      learnHarness.runtime,
    )
    expect(learnHarness.events.map((entry) => entry.payload.type)).toEqual([
      'plugin.event',
      'capability.granted',
    ])

    const missingRoleHarness = ruleHarness(mirrorHiddenBoard, {
      ...engine.state,
      night: 1,
      players: new Map(engine.state.players).set(witchId, {
        ...engine.state.players.get(witchId)!,
        roleId: null,
      }),
      phaseActions: [learn],
    })
    expect(() =>
      missingRoleHarness.ruleset.rules.complete(
        PhaseIdSchema.parse('phase-night-awakened-hidden-wolf-learn'),
        missingRoleHarness.runtime,
      ),
    ).toThrow(/has no role/)
  })
})

function nightAction(
  state: GameState,
  actorId: PlayerId,
  abilityId: AbilityId,
  targetIds: PlayerId[],
): Extract<PlayerAction, { type: 'night-action' }> {
  return { type: 'night-action', matchId: state.matchId, actorId, abilityId, targetIds }
}

function gameEvent(state: GameState, payload: GameEventPayload): GameEvent {
  return GameEventSchema.parse({
    matchId: state.matchId,
    sequence: 1,
    occurredAt: '2026-08-28T00:00:00.000Z',
    visibility: { kind: 'public' },
    payload,
  })
}

function ruleHarness(board: typeof standardBoard, initialState: GameState) {
  const ruleset = createClassicRuleset()
  let state = initialState
  const events: GameEvent[] = []
  let sequence = 0
  const runtime: RuleRuntime = {
    get state() {
      return state
    },
    board,
    get events() {
      return events
    },
    roles: ruleset.roles,
    resolution: ruleset.resolution,
    victories: ruleset.victories,
    queries: ruleset.queries,
    triggers: ruleset.triggers,
    append(payload: GameEventPayload, visibility: EventVisibility): GameEvent {
      const next = GameEventSchema.parse({
        matchId: state.matchId,
        sequence: ++sequence,
        occurredAt: `2026-08-28T00:00:${String(sequence).padStart(2, '0')}.000Z`,
        visibility,
        payload,
      })
      events.push(next)
      if (payload.type === 'plugin.event') {
        state = {
          ...state,
          pluginState: ruleset.events.apply(state.pluginState, payload),
        }
      }
      return next
    },
  }
  return {
    ruleset: ruleset as RulesetRuntime,
    runtime,
    events,
    setState(next: GameState) {
      state = next
    },
    clearEvents() {
      events.splice(0)
    },
  }
}
