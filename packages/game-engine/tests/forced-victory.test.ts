import {
  BoardIdSchema,
  GameEventSchema,
  PhaseIdSchema,
  PluginIdSchema,
  RoleIdSchema,
  type GameEvent,
  type PlayerId,
} from '@agentwolf/contracts'
import { describe, expect, it } from 'vitest'
import {
  createClassicRuleset,
  awakenedHiddenWolfEventTypes,
  classicCapabilities,
  classicBoardPolicyDefaults,
  classicPhaseGraph,
  cupidAbilityIds,
  cupidBoard,
  guardBoard,
  mirrorHiddenBoard,
  sixPlayerBoard,
  standardBoard,
  whiteWolfKingBoard,
  type GameState,
} from '../src/index.js'
import { actorsWithRole, createManualEngine, playNight, submitExpected } from './helpers.js'

describe('Werewolf forced victory', () => {
  it('ends before another day when a wolf Sheriff controls every hidden-role continuation', () => {
    const engine = createManualEngine(standardBoard)
    engine.start()
    const wolves = actorsWithRole(engine, 'role-werewolf')
    const villager = actorsWithRole(engine, 'role-villager')[0]!
    const witch = actorsWithRole(engine, 'role-witch')[0]!
    const state = materialState(engine.state, new Set([...wolves, villager, witch]), {
      phaseId: 'phase-day-announcement',
      sheriffId: wolves[0]!,
    })

    expect(evaluate(state, standardBoard, engine.events)).toMatchObject({
      winner: 'werewolf',
      winningPlayerIds: [...wolves].sort(),
      reason: 'werewolf-forced-win',
    })
    const terminalEvents = [
      ...engine.events,
      phaseChanged(state, 'phase-day-announcement', engine.events.length + 1),
      phaseChanged(state, 'phase-match-ended', engine.events.length + 2),
    ]
    expect(
      evaluate(
        { ...state, phaseId: PhaseIdSchema.parse('phase-match-ended') },
        standardBoard,
        terminalEvents,
      )?.reason,
    ).toBe('werewolf-forced-win')
  })

  it('continues when a night-first hidden-role continuation can remove the wolf majority', () => {
    const engine = createManualEngine(standardBoard)
    engine.start()
    const wolves = actorsWithRole(engine, 'role-werewolf').slice(0, 3)
    const livingGood = [
      actorsWithRole(engine, 'role-villager')[0]!,
      actorsWithRole(engine, 'role-witch')[0]!,
      actorsWithRole(engine, 'role-hunter')[0]!,
    ]
    const state = materialState(engine.state, new Set([...wolves, ...livingGood]), {
      phaseId: 'phase-day-resolve',
      sheriffId: wolves[0]!,
    })

    expect(evaluate(state, standardBoard, engine.events)).toBeNull()
  })

  it('does not use a Cupid relationship hidden from the wolf faction', () => {
    const engine = createManualEngine(cupidBoard)
    engine.start()
    const cupidId = actorsWithRole(engine, 'role-cupid')[0]!
    const lovers = actorsWithRole(engine, 'role-villager').slice(0, 2)
    engine.submit({
      type: 'night-action',
      matchId: engine.state.matchId,
      actorId: cupidId,
      abilityId: cupidAbilityIds.link,
      targetIds: lovers,
    })
    const wolves = actorsWithRole(engine, 'role-werewolf')
    const witchId = actorsWithRole(engine, 'role-witch')[0]!
    const state = materialState(engine.state, new Set([...wolves, ...lovers, witchId]), {
      phaseId: 'phase-day-announcement',
      sheriffId: wolves[0]!,
    })
    expect(evaluate(state, cupidBoard, engine.events)).toBeNull()

    const publicEvents = engine.events.map((event) =>
      event.payload.type === 'plugin.event' && event.payload.eventType === 'event-cupid-linked'
        ? ({ ...event, visibility: { kind: 'public' as const } } as GameEvent)
        : event,
    )
    expect(evaluate(state, cupidBoard, publicEvents)?.reason).toBe('werewolf-forced-win')
  })

  it('keeps an active mixed lover out of the controllable wolf team', () => {
    const engine = createManualEngine(cupidBoard)
    engine.start()
    const cupidId = actorsWithRole(engine, 'role-cupid')[0]!
    const wolfId = actorsWithRole(engine, 'role-werewolf')[0]!
    const villagerId = actorsWithRole(engine, 'role-villager')[0]!
    engine.submit({
      type: 'night-action',
      matchId: engine.state.matchId,
      actorId: cupidId,
      abilityId: cupidAbilityIds.link,
      targetIds: [wolfId, villagerId],
    })
    const wolves = actorsWithRole(engine, 'role-werewolf')
    const otherGood = actorsWithRole(engine, 'role-villager')[1]!
    const state = materialState(engine.state, new Set([...wolves, villagerId, otherGood]), {
      phaseId: 'phase-day-announcement',
      sheriffId: wolves[1]!,
    })
    expect(evaluate(state, cupidBoard, engine.events)).toBeNull()
  })

  it('proves a no-Sheriff one-on-one even when the hidden opponent may be Hunter', () => {
    const engine = createManualEngine(sixPlayerBoard)
    engine.start()
    const wolfId = actorsWithRole(engine, 'role-werewolf')[0]!
    const villagerId = actorsWithRole(engine, 'role-villager')[0]!
    const state = materialState(engine.state, new Set([wolfId, villagerId]), {
      phaseId: 'phase-day-announcement',
      sheriffId: null,
    })
    expect(evaluate(state, sixPlayerBoard, engine.events)?.reason).toBe('werewolf-forced-win')
  })

  it('proves a one-on-one when the hidden opponent may be Witch or Guard', () => {
    for (const board of [
      {
        ...standardBoard,
        policies: { ...standardBoard.policies, victory: 'slaughter-all' as const },
      },
      { ...guardBoard, policies: { ...guardBoard.policies, victory: 'slaughter-all' as const } },
    ]) {
      const engine = createManualEngine(board)
      engine.start()
      const wolfId = actorsWithRole(engine, 'role-werewolf')[0]!
      const opponentId = [...engine.state.players.values()].find(
        (player) => player.faction !== 'werewolf',
      )!.id
      const state = materialState(engine.state, new Set([wolfId, opponentId]), {
        phaseId: 'phase-day-announcement',
        sheriffId: null,
      })
      expect(evaluate(state, board, engine.events)?.reason).toBe('werewolf-forced-win')
    }
  })

  it('does not prove a daytime one-on-one against a good Sheriff', () => {
    const board = {
      ...standardBoard,
      policies: { ...standardBoard.policies, victory: 'slaughter-all' as const },
    }
    const engine = createManualEngine(board)
    engine.start()
    const wolfId = actorsWithRole(engine, 'role-werewolf')[0]!
    const villagerId = actorsWithRole(engine, 'role-villager')[0]!
    const state = materialState(engine.state, new Set([wolfId, villagerId]), {
      phaseId: 'phase-day-announcement',
      sheriffId: villagerId,
    })
    expect(evaluate(state, board, engine.events)).toBeNull()
  })

  it('models first-vote tie, runoff tie, and no-exile before entering night', () => {
    const engine = createManualEngine(sixPlayerBoard)
    engine.start()
    const wolves = actorsWithRole(engine, 'role-werewolf')
    const villagers = actorsWithRole(engine, 'role-villager')
    const seer = actorsWithRole(engine, 'role-seer')[0]!
    const hunter = actorsWithRole(engine, 'role-hunter')[0]!
    const state = materialState(engine.state, new Set([...wolves, ...villagers]), {
      phaseId: 'phase-day-announcement',
      sheriffId: null,
    })
    const events = [
      ...engine.events,
      publicRoleReveal(state, seer, 'role-seer', engine.events.length + 1),
      publicRoleReveal(state, hunter, 'role-hunter', engine.events.length + 2),
    ]
    expect(evaluate(state, sixPlayerBoard, events)?.reason).toBe('werewolf-forced-win')
  })

  it('keeps Awakened Hidden Wolf outside the ordinary pack vote calculation', () => {
    const engine = createManualEngine(mirrorHiddenBoard)
    engine.start()
    const wolves = actorsWithRole(engine, 'role-werewolf')
    const hidden = actorsWithRole(engine, 'role-awakened-hidden-wolf')[0]!
    const livingGood = [
      actorsWithRole(engine, 'role-villager')[0]!,
      actorsWithRole(engine, 'role-witch')[0]!,
    ]
    const state = materialState(engine.state, new Set([...wolves, hidden, ...livingGood]), {
      phaseId: 'phase-day-announcement',
      sheriffId: wolves[0]!,
    })
    expect(evaluate(state, mirrorHiddenBoard, engine.events)).toBeNull()
  })

  it('keeps running when Guard and an unused Witch can preserve night counterplay', () => {
    const engine = createManualEngine(guardBoard)
    engine.start()
    const wolves = actorsWithRole(engine, 'role-werewolf').slice(0, 3)
    const livingGood = [
      actorsWithRole(engine, 'role-villager')[0]!,
      actorsWithRole(engine, 'role-witch')[0]!,
      actorsWithRole(engine, 'role-guard')[0]!,
    ]
    const state = materialState(engine.state, new Set([...wolves, ...livingGood]), {
      phaseId: 'phase-day-resolve',
      sheriffId: wolves[0]!,
    })
    expect(evaluate(state, guardBoard, engine.events)).toBeNull()
  })

  it('models Idiot exile prevention before proving the remaining wolf vote lock', () => {
    const engine = createManualEngine(standardBoard)
    engine.start()
    const wolves = actorsWithRole(engine, 'role-werewolf').slice(0, 2)
    const idiot = actorsWithRole(engine, 'role-idiot')[0]!
    const villager = actorsWithRole(engine, 'role-villager')[0]!
    const witch = actorsWithRole(engine, 'role-witch')[0]!
    const hunter = actorsWithRole(engine, 'role-hunter')[0]!
    const state = materialState(engine.state, new Set([...wolves, idiot, villager]), {
      phaseId: 'phase-day-announcement',
      sheriffId: wolves[0]!,
    })
    const events = [
      ...engine.events,
      publicRoleReveal(state, witch, 'role-witch', engine.events.length + 1),
      publicRoleReveal(state, hunter, 'role-hunter', engine.events.length + 2),
    ]
    expect(evaluate(state, standardBoard, events)?.reason).toBe('werewolf-forced-win')
  })

  it('keeps White Wolf King inside the shared wolf control group', () => {
    const engine = createManualEngine(whiteWolfKingBoard)
    engine.start()
    const wolves = [
      ...actorsWithRole(engine, 'role-werewolf'),
      ...actorsWithRole(engine, 'role-white-wolf-king'),
    ]
    const livingGood = [
      actorsWithRole(engine, 'role-villager')[0]!,
      actorsWithRole(engine, 'role-witch')[0]!,
    ]
    const state = materialState(engine.state, new Set([...wolves, ...livingGood]), {
      phaseId: 'phase-day-announcement',
      sheriffId: wolves[0]!,
    })
    expect(evaluate(state, whiteWolfKingBoard, engine.events)?.reason).toBe('werewolf-forced-win')
  })

  it('allows an armed isolated wolf to prove a visible night-first inert endgame', () => {
    const engine = createManualEngine(mirrorHiddenBoard)
    engine.start()
    const hidden = actorsWithRole(engine, 'role-awakened-hidden-wolf')[0]!
    const villager = actorsWithRole(engine, 'role-villager')[0]!
    const mirror = actorsWithRole(engine, 'role-magic-mirror-girl')[0]!
    const witch = actorsWithRole(engine, 'role-witch')[0]!
    const guard = actorsWithRole(engine, 'role-guard')[0]!
    const base = materialState(engine.state, new Set([hidden, villager, mirror]), {
      phaseId: 'phase-night-awakened-hidden-wolf-attack',
      sheriffId: null,
    })
    const hiddenPlayer = base.players.get(hidden)!
    const state: GameState = {
      ...base,
      players: new Map(base.players).set(hidden, {
        ...hiddenPlayer,
        roleState: {
          ...hiddenPlayer.roleState,
          capabilities: new Set([
            ...hiddenPlayer.roleState.capabilities,
            classicCapabilities.awakenedHiddenWolfKill,
          ]),
        },
      }),
    }
    const events = [
      ...engine.events,
      publicRoleReveal(state, witch, 'role-witch', engine.events.length + 1),
      publicRoleReveal(state, guard, 'role-guard', engine.events.length + 2),
    ]
    expect(evaluate(state, mirrorHiddenBoard, events)?.reason).toBe('werewolf-forced-win')
  })

  it('uses an Awakened Hidden Wolf learning only inside its isolated control group', () => {
    const fixture = armedHiddenKnowledgeFixture()
    expect(evaluate(fixture.state, mirrorHiddenBoard, fixture.events)).toBeNull()

    const learning = hiddenRoleObservation(
      fixture.state,
      fixture.hiddenId,
      fixture.witchId,
      'role-witch',
      awakenedHiddenWolfEventTypes.learned,
      fixture.nextSequence,
      { night: 2 },
    )
    const invisibleLearning: GameEvent = {
      ...learning,
      visibility: { kind: 'players', playerIds: [fixture.ordinaryWolfId] },
    }
    expect(
      evaluate(fixture.state, mirrorHiddenBoard, [...fixture.events, invisibleLearning]),
    ).toBeNull()
    expect(evaluate(fixture.state, mirrorHiddenBoard, [...fixture.events, learning])).toMatchObject(
      {
        winner: 'werewolf',
        reason: 'werewolf-forced-win',
      },
    )

    const ruleset = createClassicRuleset()
    const context = {
      state: fixture.state,
      board: mirrorHiddenBoard,
      roles: ruleset.roles,
      events: [...fixture.events, learning],
    }
    expect(
      ruleset.endgames.observeWerewolfKnowledge(context, new Set([fixture.hiddenId])),
    ).toMatchObject([
      {
        observerId: fixture.hiddenId,
        targetId: fixture.witchId,
        roleId: 'role-witch',
      },
    ])
    expect(
      ruleset.endgames.observeWerewolfKnowledge(context, new Set([fixture.ordinaryWolfId])),
    ).toEqual([])
  })

  it('uses only the copied Magic Mirror inspection performed by the Awakened Hidden Wolf', () => {
    const fixture = armedHiddenKnowledgeFixture()
    const learnedMirror = hiddenRoleObservation(
      fixture.state,
      fixture.hiddenId,
      fixture.mirrorId,
      'role-magic-mirror-girl',
      awakenedHiddenWolfEventTypes.learned,
      fixture.nextSequence,
      { night: 1 },
    )
    expect(
      evaluate(fixture.state, mirrorHiddenBoard, [...fixture.events, learnedMirror]),
    ).toBeNull()

    const inspectedWitch = hiddenRoleObservation(
      fixture.state,
      fixture.hiddenId,
      fixture.witchId,
      'role-witch',
      awakenedHiddenWolfEventTypes.inspected,
      fixture.nextSequence + 1,
    )
    expect(
      evaluate(fixture.state, mirrorHiddenBoard, [
        ...fixture.events,
        learnedMirror,
        inspectedWitch,
      ]),
    ).toMatchObject({ winner: 'werewolf', reason: 'werewolf-forced-win' })
  })

  it('ends after exile last words when a slaughter-edge trio has no compatible defense', () => {
    const board = {
      id: BoardIdSchema.parse('board-forced-edge-after-exile'),
      playerCount: 4,
      reserveCount: 0,
      roles: [
        { roleId: RoleIdSchema.parse('role-werewolf'), count: 1 },
        { roleId: RoleIdSchema.parse('role-villager'), count: 2 },
        { roleId: RoleIdSchema.parse('role-seer'), count: 1 },
      ],
      sheriff: false,
      policies: { ...classicBoardPolicyDefaults, victory: 'slaughter-edge' as const },
      phases: classicPhaseGraph,
    }
    const engine = createManualEngine(board)
    engine.start()
    playNight(engine, { wolfTargetId: null })
    const exiledId = actorsWithRole(engine, 'role-villager')[0]!
    while (engine.state.phaseId === 'phase-day-speech') {
      const actorId = engine.activeActor()
      if (!actorId) throw new Error('Expected a day speaker')
      engine.submit({
        type: 'speech',
        matchId: engine.state.matchId,
        actorId,
        kind: 'day',
        text: '结束发言。',
      })
    }
    submitExpected(engine, (actorId) => ({
      type: 'vote',
      matchId: engine.state.matchId,
      actorId,
      targetId: exiledId,
      kind: 'exile',
    }))
    expect(engine.state.phaseId).toBe('phase-last-words')
    engine.submit({
      type: 'speech',
      matchId: engine.state.matchId,
      actorId: exiledId,
      kind: 'last-words',
      text: '遗言结束。',
    })

    expect(engine.state.phaseId).toBe('phase-match-ended')
    expect(
      engine.events.findLast((event) => event.payload.type === 'match.ended')?.payload,
    ).toMatchObject({ winner: 'werewolf', reason: 'werewolf-forced-win' })
    expect(
      engine.events.flatMap((event) =>
        event.payload.type === 'night.started' ? [event.payload.night] : [],
      ),
    ).toEqual([1])
  })
})

function armedHiddenKnowledgeFixture() {
  const engine = createManualEngine(mirrorHiddenBoard)
  engine.start()
  const hiddenId = actorsWithRole(engine, 'role-awakened-hidden-wolf')[0]!
  const ordinaryWolfId = actorsWithRole(engine, 'role-werewolf')[0]!
  const villagerId = actorsWithRole(engine, 'role-villager')[0]!
  const witchId = actorsWithRole(engine, 'role-witch')[0]!
  const mirrorId = actorsWithRole(engine, 'role-magic-mirror-girl')[0]!
  const base = materialState(engine.state, new Set([hiddenId, villagerId, witchId]), {
    phaseId: 'phase-night-awakened-hidden-wolf-attack',
    sheriffId: null,
  })
  const hidden = base.players.get(hiddenId)!
  const state: GameState = {
    ...base,
    players: new Map(base.players).set(hiddenId, {
      ...hidden,
      roleState: {
        ...hidden.roleState,
        capabilities: new Set([
          ...hidden.roleState.capabilities,
          classicCapabilities.awakenedHiddenWolfKill,
        ]),
      },
    }),
  }
  let nextSequence = engine.events.at(-1)?.sequence ?? 0
  const events = [...engine.events]
  for (const player of state.players.values()) {
    if (player.alive) continue
    events.push(publicRoleReveal(state, player.id, player.roleId!, ++nextSequence))
  }
  return {
    state,
    events,
    hiddenId,
    ordinaryWolfId,
    witchId,
    mirrorId,
    nextSequence: nextSequence + 1,
  }
}

function hiddenRoleObservation(
  state: GameState,
  actorId: PlayerId,
  targetId: PlayerId,
  roleId: string,
  eventType: (typeof awakenedHiddenWolfEventTypes)[keyof typeof awakenedHiddenWolfEventTypes],
  sequence: number,
  extra: Record<string, number> = {},
): GameEvent {
  return GameEventSchema.parse({
    matchId: state.matchId,
    sequence,
    occurredAt: '2026-09-03T00:00:00.000Z',
    visibility: { kind: 'players', playerIds: [actorId] },
    payload: {
      type: 'plugin.event',
      pluginId: PluginIdSchema.parse('plugin-role-awakened-hidden-wolf'),
      eventType,
      schemaVersion: 1,
      data: { actorId, targetId, roleId, ...extra },
    },
  })
}

function evaluate(state: GameState, board: typeof standardBoard, events: readonly GameEvent[]) {
  const ruleset = createClassicRuleset()
  return ruleset.victories.evaluate({ state, board, roles: ruleset.roles, events })
}

function materialState(
  state: GameState,
  livingPlayerIds: ReadonlySet<PlayerId>,
  options: { readonly phaseId: string; readonly sheriffId: PlayerId | null },
): GameState {
  return {
    ...state,
    status: 'running',
    day: 2,
    night: 2,
    phaseId: PhaseIdSchema.parse(options.phaseId),
    players: new Map(
      [...state.players].map(([playerId, player]) => [
        playerId,
        livingPlayerIds.has(playerId) ? player : { ...player, alive: false, canVote: false },
      ]),
    ),
    sheriff: {
      ...state.sheriff,
      holderId: options.sheriffId,
      badgeLost: options.sheriffId === null,
    },
    pendingDeaths: new Map(),
    recentDeaths: new Map(),
  }
}

function publicRoleReveal(
  state: GameState,
  playerId: PlayerId,
  roleId: string,
  sequence: number,
): GameEvent {
  return GameEventSchema.parse({
    matchId: state.matchId,
    sequence,
    occurredAt: '2026-09-01T00:00:00.000Z',
    visibility: { kind: 'public' },
    payload: { type: 'role.revealed', playerId, roleId },
  })
}

function phaseChanged(state: GameState, phaseId: string, sequence: number): GameEvent {
  return GameEventSchema.parse({
    matchId: state.matchId,
    sequence,
    occurredAt: '2026-09-01T00:00:00.000Z',
    visibility: { kind: 'public' },
    payload: {
      type: 'phase.changed',
      phaseId,
      day: state.day,
      labelKey: 'phases.dayAnnouncement',
    },
  })
}
