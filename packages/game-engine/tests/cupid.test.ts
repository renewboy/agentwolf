import { describe, expect, it } from 'vitest'
import {
  GameEventSchema,
  PhaseIdSchema,
  type EventVisibility,
  type GameEvent,
  type GameEventPayload,
  type PlayerAction,
  type PlayerId,
} from '@agentwolf/contracts'
import {
  GameEngine,
  classicIdentityQueries,
  createClassicRuleset,
  createClassicV4Ruleset,
  cupidAbilityIds,
  cupidBoard,
  cupidEventTypes,
  cupidState,
  reduceGameEvent,
  v1AbilityIds,
  type BoardManifest,
  type GameState,
  type RuleRuntime,
  type RulesetRuntime,
} from '../src/index.js'
import { actorsWithRole, createManualEngine, playNight, submitExpected } from './helpers.js'

const noSheriffCupidBoard: BoardManifest = { ...cupidBoard, sheriff: false }
const guardCupidBoard: BoardManifest = {
  ...noSheriffCupidBoard,
  roles: noSheriffCupidBoard.roles.map((slot) =>
    slot.roleId === 'role-hunter' ? { roleId: 'role-guard' as typeof slot.roleId, count: 1 } : slot,
  ),
}

describe('Cupid Role plugin', () => {
  it('forces a first-night two-player link, permits self-link, and persists only lover IDs', () => {
    const engine = createManualEngine(noSheriffCupidBoard)
    const cupidId = actor(engine, 'role-cupid')
    const wolfId = actor(engine, 'role-werewolf')
    const villagerId = actor(engine, 'role-villager')
    engine.start()

    expect(engine.state.phaseId).toBe('phase-night-cupid')
    expect(engine.currentTurn()).toMatchObject({
      actors: [cupidId],
      allowedAbilityIds: [cupidAbilityIds.link],
      passAllowed: false,
    })
    expect(() => engine.submit(linkAction(engine, cupidId, [], 'pass'))).toThrow(
      /does not allow pass/,
    )
    expect(() => engine.submit(linkAction(engine, cupidId, [wolfId, wolfId]))).toThrow(
      /two distinct players/,
    )

    engine.submit(linkAction(engine, cupidId, [cupidId, wolfId]))
    expect(cupidState(engine.state).loverIds).toEqual([wolfId, cupidId])
    const event = engine.events.find(
      (candidate) =>
        candidate.payload.type === 'plugin.event' &&
        candidate.payload.eventType === cupidEventTypes.linked,
    )
    expect(event?.visibility).toEqual({ kind: 'players', playerIds: [cupidId, wolfId] })
    expect(event?.payload).toMatchObject({
      type: 'plugin.event',
      data: { loverIds: [wolfId, cupidId] },
    })
    expect(
      JSON.stringify(event?.payload.type === 'plugin.event' ? event.payload.data : null),
    ).not.toContain('role-')

    const ruleset = createClassicRuleset()
    expect(
      ruleset.queries.resolve(
        classicIdentityQueries.alignment,
        { targetId: cupidId },
        { state: engine.state, board: noSheriffCupidBoard, roles: ruleset.roles },
      ),
    ).toBe('village')
    const restored = GameEngine.restore({
      matchId: engine.state.matchId,
      board: noSheriffCupidBoard,
      events: engine.events,
      status: engine.state.status,
      pausedReason: engine.state.pausedReason,
      ruleset,
    })
    expect(cupidState(restored.state)).toEqual(cupidState(engine.state))

    const ability = ruleset.roles.ability(cupidAbilityIds.link).ability
    const restoredCupid = restored.state.players.get(cupidId)!
    expect(() =>
      ability.validate({
        state: restored.state,
        board: noSheriffCupidBoard,
        roles: ruleset.roles,
        actor: restoredCupid,
        action: linkAction(restored, cupidId, [villagerId, wolfId]),
      }),
    ).toThrow(/already linked/)
    expect(() =>
      ability.validate({
        state: {
          ...restored.state,
          night: 2,
          pluginState: new Map(),
        },
        board: noSheriffCupidBoard,
        roles: ruleset.roles,
        actor: restoredCupid,
        action: linkAction(restored, cupidId, [villagerId, wolfId]),
      }),
    ).toThrow(/first night/)
    expect(() =>
      ability.validate({
        state: withDeadIds(
          {
            ...restored.state,
            night: 1,
            pluginState: new Map(),
          },
          [villagerId],
        ),
        board: noSheriffCupidBoard,
        roles: ruleset.roles,
        actor: restoredCupid,
        action: linkAction(restored, cupidId, [villagerId, wolfId]),
      }),
    ).toThrow(/is not alive/)
  })

  it('rejects only lover exile ballots and preserves same-turn correction', () => {
    const engine = linkedEngine('mixed')
    const [wolfId, villagerId] = cupidState(engine.state).loverIds!
    playNight(engine, { wolfTargetId: null })
    speakUntilVote(engine)
    expect(engine.state.phaseId).toBe('phase-day-vote')

    const before = engine.events.length
    expect(() => engine.submit(voteAction(engine, wolfId, villagerId, 'exile'))).toThrow(
      /Lovers cannot vote/,
    )
    expect(engine.events).toHaveLength(before)
    const otherTarget = [...engine.state.players.values()].find(
      (player) => player.alive && player.id !== wolfId && player.id !== villagerId,
    )!.id
    expect(() => engine.submit(voteAction(engine, wolfId, otherTarget, 'exile'))).not.toThrow()
  })

  it('wraps the recurring night entry but skips Cupid after the first night', () => {
    const engine = linkedEngine('good')
    playNight(engine, { wolfTargetId: null })
    speakUntilVote(engine)
    submitExpected(engine, (actorId) => voteAction(engine, actorId, null, 'exile'))

    expect(engine.state.night).toBe(2)
    expect(engine.state.phaseId).toBe('phase-night-wolf-council')
    expect(
      engine.events.filter(
        (event) =>
          event.payload.type === 'plugin.event' &&
          event.payload.eventType === cupidEventTypes.linked,
      ),
    ).toHaveLength(1)
  })

  it('publishes the final lover relationship after every Role reveal', () => {
    const ruleset = createClassicRuleset()
    expect(ruleset.plugins.find((plugin) => plugin.id === 'plugin-role-cupid')?.version).toBe(2)
    const engine = linkedEngine('mixed')
    const loverIds = cupidState(engine.state).loverIds!
    const cupidId = actor(engine, 'role-cupid')
    const cohort = new Set([cupidId, ...loverIds])
    const terminalState: GameState = {
      ...withDeadIds(
        engine.state,
        [...engine.state.players.keys()].filter((playerId) => !cohort.has(playerId)),
      ),
      phaseId: PhaseIdSchema.parse('phase-match-ended'),
      phaseLabelKey: 'phases.matchEnded',
    }
    const terminal = completeTerminal(ruleset, terminalState, noSheriffCupidBoard, engine.events)
    const revealIndex = terminal.events.findIndex(
      (event) =>
        event.payload.type === 'public.announcement' &&
        event.payload.code === 'cupid-lovers-revealed',
    )
    const lastRoleRevealIndex = terminal.events.findLastIndex(
      (event) => event.payload.type === 'role.revealed',
    )

    expect(terminal.state.status).toBe('ended')
    expect(revealIndex).toBeGreaterThan(lastRoleRevealIndex)
    expect(terminal.events[revealIndex]).toMatchObject({
      visibility: { kind: 'public' },
      payload: {
        type: 'public.announcement',
        code: 'cupid-lovers-revealed',
        playerIds: loverIds,
      },
    })
    expect(cupidState(terminal.state).loverIds).toEqual(loverIds)

    const classicV4 = createClassicV4Ruleset()
    expect(classicV4.plugins.find((plugin) => plugin.id === 'plugin-role-cupid')?.version).toBe(1)
    const legacyTerminal = completeTerminal(
      classicV4,
      terminalState,
      noSheriffCupidBoard,
      engine.events,
    )
    expect(
      legacyTerminal.events.some(
        (event) =>
          event.payload.type === 'public.announcement' &&
          event.payload.code === 'cupid-lovers-revealed',
      ),
    ).toBe(false)
  })

  it('expands every death cause once, inherits timing, and disables linked Hunter fire', () => {
    const ruleset = createClassicRuleset()
    const engine = linkedEngine('mixed')
    const [wolfId, villagerId] = cupidState(engine.state).loverIds!
    for (const cause of [
      'werewolf',
      'poison',
      'exile',
      'shot',
      'self-destruct',
      'white-wolf-detonate',
    ]) {
      const resolved = ruleset.triggers.resolveDeaths(
        [{ playerId: wolfId, causes: [cause], timing: cause === 'werewolf' ? 'night' : 'day' }],
        { state: engine.state, board: noSheriffCupidBoard, roles: ruleset.roles },
      )
      expect(resolved.map((entry) => entry.death.playerId)).toEqual([wolfId, villagerId])
      expect(resolved[1]?.death).toMatchObject({
        causes: ['linked'],
        timing: cause === 'werewolf' ? 'night' : 'day',
      })
    }
    const simultaneous = ruleset.triggers.resolveDeaths(
      [
        { playerId: wolfId, causes: ['werewolf'], timing: 'night' },
        { playerId: villagerId, causes: ['poison'], timing: 'night' },
      ],
      { state: engine.state, board: noSheriffCupidBoard, roles: ruleset.roles },
    )
    expect(simultaneous).toMatchObject([
      { death: { playerId: wolfId, causes: ['werewolf'] }, original: true, events: [] },
      { death: { playerId: villagerId, causes: ['poison'] }, original: true, events: [] },
    ])

    const hunterEngine = linkedEngine('hunter-wolf')
    const hunterId = actor(hunterEngine, 'role-hunter')
    const linkedWolfId = cupidState(hunterEngine.state).loverIds!.find(
      (playerId) => playerId !== hunterId,
    )!
    const state = withDeaths(hunterEngine.state, [
      { playerId: linkedWolfId, causes: ['werewolf'], timing: 'night' },
      { playerId: hunterId, causes: ['linked'], timing: 'night' },
    ])
    expect(
      ruleset.triggers.abilityIdsFor(
        'player-death',
        state.players.get(hunterId)!,
        state,
        noSheriffCupidBoard,
        ruleset.roles,
      ),
    ).not.toContain(v1AbilityIds.hunterShot)
  })

  it('settles linked night deaths before death skills and victory', () => {
    const engine = linkedEngine('mixed')
    const [wolfId, villagerId] = cupidState(engine.state).loverIds!
    playNight(engine, { wolfTargetId: villagerId })

    expect(engine.state.players.get(wolfId)?.alive).toBe(false)
    expect(engine.state.players.get(villagerId)?.alive).toBe(false)
    expect(engine.state.recentDeaths.get(villagerId)).toMatchObject({
      causes: ['werewolf'],
      timing: 'night',
    })
    expect(engine.state.recentDeaths.get(wolfId)).toMatchObject({
      causes: ['linked'],
      timing: 'night',
    })
    expect(
      engine.events.some(
        (event) =>
          event.payload.type === 'plugin.event' &&
          event.payload.eventType === cupidEventTypes.linkedDeath,
      ),
    ).toBe(true)
    expect(engine.state.status).toBe('running')
  })

  it('keeps an originally killed Hunter trigger while suppressing a linked Hunter trigger', () => {
    const engine = linkedEngine('hunter-wolf')
    const hunterId = actor(engine, 'role-hunter')
    const wolfId = cupidState(engine.state).loverIds!.find((playerId) => playerId !== hunterId)!
    playNight(engine, { wolfTargetId: hunterId })

    expect(engine.state.players.get(hunterId)?.alive).toBe(false)
    expect(engine.state.players.get(wolfId)?.alive).toBe(false)
    expect(engine.state.recentDeaths.get(hunterId)?.causes).toEqual(['werewolf'])
    expect(engine.state.recentDeaths.get(wolfId)?.causes).toEqual(['linked'])
    expect(engine.state.phaseId).toBe('phase-death-triggers')
    expect(engine.activeActor()).toBe(hunterId)
    expect(engine.currentTurn()?.allowedAbilityIds).toContain(v1AbilityIds.hunterShot)
  })

  it('does not let a Guard protection prevent linked death', () => {
    const engine = createManualEngine(guardCupidBoard)
    engine.start()
    const cupidId = actor(engine, 'role-cupid')
    const wolfId = actor(engine, 'role-werewolf')
    const guardId = actor(engine, 'role-guard')
    engine.submit(linkAction(engine, cupidId, [wolfId, guardId]))
    expect(engine.state.phaseId).toBe('phase-night-guard')
    engine.submit({
      type: 'night-action',
      matchId: engine.state.matchId,
      actorId: guardId,
      abilityId: v1AbilityIds.guardProtect,
      targetIds: [guardId],
    })
    while (engine.state.phaseId === 'phase-night-wolf-council') {
      const speakerId = engine.activeActor()
      if (!speakerId) throw new Error('Missing wolf speaker')
      engine.submit({
        type: 'speech',
        matchId: engine.state.matchId,
        actorId: speakerId,
        kind: 'wolf-council',
        text: '选择狼队成员作为目标。',
      })
    }
    submitExpected(engine, (actorId) => voteAction(engine, actorId, wolfId, 'wolf-kill'))
    submitExpected(engine, (actorId) => ({
      type: 'night-action',
      matchId: engine.state.matchId,
      actorId,
      abilityId: v1AbilityIds.witchAntidote,
      targetIds: [],
      option: 'pass',
    }))
    submitExpected(engine, (actorId) => ({
      type: 'night-action',
      matchId: engine.state.matchId,
      actorId,
      abilityId: v1AbilityIds.seerInspect,
      targetIds: [],
      option: 'pass',
    }))

    expect(engine.state.players.get(wolfId)?.alive).toBe(false)
    expect(engine.state.players.get(guardId)?.alive).toBe(false)
    expect(engine.state.recentDeaths.get(guardId)?.causes).toEqual(['linked'])
  })

  it('applies linked death to a daytime self-destruct before routing the interrupt', () => {
    const engine = linkedEngine('mixed')
    const [wolfId, villagerId] = cupidState(engine.state).loverIds!
    playNight(engine, { wolfTargetId: null })
    while (engine.activeActor() !== wolfId) {
      const speakerId = engine.activeActor()
      if (!speakerId) throw new Error('Missing speaker before linked Werewolf')
      engine.submit({
        type: 'speech',
        matchId: engine.state.matchId,
        actorId: speakerId,
        kind: 'day',
        text: '继续发言。',
      })
    }
    engine.submit({
      type: 'skill-trigger',
      matchId: engine.state.matchId,
      actorId: wolfId,
      abilityId: v1AbilityIds.werewolfSelfDestruct,
      targetId: null,
    })

    expect(engine.state.players.get(wolfId)?.alive).toBe(false)
    expect(engine.state.players.get(villagerId)?.alive).toBe(false)
    expect(engine.state.recentDeaths.get(villagerId)).toMatchObject({
      causes: ['linked'],
      timing: 'day',
    })
    expect(
      engine.events.some(
        (event) =>
          event.payload.type === 'public.announcement' &&
          event.payload.code === 'player-eliminated' &&
          event.payload.playerIds.includes(villagerId),
      ),
    ).toBe(true)
  })
})

describe('Cupid victory modifier', () => {
  it('shares same-side wins without changing ordinary terminal thresholds', () => {
    const ruleset = createClassicRuleset()
    const goodEngine = linkedEngine('good')
    const goodCupid = actor(goodEngine, 'role-cupid')
    const villageState = withDeadIds(goodEngine.state, actorsWithRole(goodEngine, 'role-werewolf'))
    expect(
      ruleset.victories.evaluate({
        state: villageState,
        board: noSheriffCupidBoard,
        roles: ruleset.roles,
      })?.winningPlayerIds,
    ).toContain(goodCupid)
    const wolvesBeatGoodLink = ruleset.victories.evaluate({
      state: withDeadIds(goodEngine.state, actorsWithRole(goodEngine, 'role-villager')),
      board: noSheriffCupidBoard,
      roles: ruleset.roles,
    })
    expect(wolvesBeatGoodLink?.winner).toBe('werewolf')
    expect(wolvesBeatGoodLink?.winningPlayerIds).not.toContain(goodCupid)

    const wolfEngine = linkedEngine('wolves')
    const wolfCupid = actor(wolfEngine, 'role-cupid')
    const villagers = actorsWithRole(wolfEngine, 'role-villager')
    const wolfVictory = ruleset.victories.evaluate({
      state: withDeadIds(wolfEngine.state, villagers),
      board: noSheriffCupidBoard,
      roles: ruleset.roles,
    })
    expect(wolfVictory?.winner).toBe('werewolf')
    expect(wolfVictory?.winningPlayerIds).toContain(wolfCupid)
    const villageBeatsWolfLink = ruleset.victories.evaluate({
      state: withDeadIds(wolfEngine.state, actorsWithRole(wolfEngine, 'role-werewolf')),
      board: noSheriffCupidBoard,
      roles: ruleset.roles,
    })
    expect(villageBeatsWolfLink?.winner).toBe('village')
    expect(villageBeatsWolfLink?.winningPlayerIds).not.toContain(wolfCupid)
  })

  it('blocks ordinary wins while a mixed cohort survives and returns exact winners', () => {
    const ruleset = createClassicRuleset()
    const engine = linkedEngine('mixed')
    const cupidId = actor(engine, 'role-cupid')
    const loverIds = cupidState(engine.state).loverIds!
    const cohort = new Set([cupidId, ...loverIds])
    const allOutsiders = [...engine.state.players.keys()].filter(
      (playerId) => !cohort.has(playerId),
    )

    const loversDead = withDeadIds(engine.state, [...loverIds, ...allOutsiders])
    expect(
      ruleset.victories.evaluate({
        state: loversDead,
        board: noSheriffCupidBoard,
        roles: ruleset.roles,
      }),
    ).toEqual({
      winner: 'independent',
      winningPlayerIds: [...cohort].sort(),
      reason: 'cupid-lovers-last-standing',
    })

    const pairAlive = withDeadIds(engine.state, [cupidId, ...allOutsiders])
    expect(
      ruleset.victories.evaluate({
        state: pairAlive,
        board: noSheriffCupidBoard,
        roles: ruleset.roles,
      })?.winningPlayerIds,
    ).toEqual([...cohort].sort())

    const ordinaryThreshold = withDeadIds(engine.state, actorsWithRole(engine, 'role-villager'))
    expect(
      ruleset.victories.evaluate({
        state: ordinaryThreshold,
        board: noSheriffCupidBoard,
        roles: ruleset.roles,
      }),
    ).toBeNull()

    const cohortDead = withDeadIds(engine.state, [
      ...cohort,
      ...actorsWithRole(engine, 'role-werewolf'),
    ])
    const normal = ruleset.victories.evaluate({
      state: cohortDead,
      board: noSheriffCupidBoard,
      roles: ruleset.roles,
    })
    expect(normal?.winner).toBe('village')
    expect(normal?.winningPlayerIds.some((playerId) => cohort.has(playerId))).toBe(false)

    const everyoneDead = ruleset.victories.evaluate({
      state: withDeadIds(engine.state, [...engine.state.players.keys()]),
      board: noSheriffCupidBoard,
      roles: ruleset.roles,
    })
    expect(everyoneDead?.winner).toBe('village')
    expect(everyoneDead?.winningPlayerIds.some((playerId) => cohort.has(playerId))).toBe(false)
  })

  it('treats a Cupid self-link with a Werewolf as a two-player mixed cohort', () => {
    const ruleset = createClassicRuleset()
    const engine = createManualEngine(noSheriffCupidBoard)
    engine.start()
    const cupidId = actor(engine, 'role-cupid')
    const wolfId = actor(engine, 'role-werewolf')
    engine.submit(linkAction(engine, cupidId, [cupidId, wolfId]))
    const outsiders = [...engine.state.players.keys()].filter(
      (playerId) => playerId !== cupidId && playerId !== wolfId,
    )
    expect(
      ruleset.victories.evaluate({
        state: withDeadIds(engine.state, outsiders),
        board: noSheriffCupidBoard,
        roles: ruleset.roles,
      }),
    ).toEqual({
      winner: 'independent',
      winningPlayerIds: [cupidId, wolfId].sort(),
      reason: 'cupid-lovers-last-standing',
    })
  })
})

function linkedEngine(kind: 'good' | 'wolves' | 'mixed' | 'hunter-wolf'): GameEngine {
  const engine = createManualEngine(noSheriffCupidBoard)
  engine.start()
  const cupidId = actor(engine, 'role-cupid')
  const targets =
    kind === 'good'
      ? actorsWithRole(engine, 'role-villager').slice(0, 2)
      : kind === 'wolves'
        ? actorsWithRole(engine, 'role-werewolf').slice(0, 2)
        : kind === 'hunter-wolf'
          ? [actor(engine, 'role-hunter'), actor(engine, 'role-werewolf')]
          : [actor(engine, 'role-werewolf'), actor(engine, 'role-villager')]
  engine.submit(linkAction(engine, cupidId, targets))
  return engine
}

function actor(engine: GameEngine, roleId: string): PlayerId {
  return actorsWithRole(engine, roleId)[0]!
}

function linkAction(
  engine: GameEngine,
  actorId: PlayerId,
  targetIds: readonly PlayerId[],
  option?: string,
): Extract<PlayerAction, { type: 'night-action' }> {
  return {
    type: 'night-action',
    matchId: engine.state.matchId,
    actorId,
    abilityId: cupidAbilityIds.link,
    targetIds: [...targetIds],
    ...(option ? { option } : {}),
  }
}

function voteAction(
  engine: GameEngine,
  actorId: PlayerId,
  targetId: PlayerId | null,
  kind: Extract<PlayerAction, { type: 'vote' }>['kind'],
): Extract<PlayerAction, { type: 'vote' }> {
  return { type: 'vote', matchId: engine.state.matchId, actorId, targetId, kind }
}

function speakUntilVote(engine: GameEngine): void {
  while (engine.state.phaseId === 'phase-day-speech') {
    const actorId = engine.activeActor()
    if (!actorId) throw new Error('Missing day speaker')
    engine.submit({
      type: 'speech',
      matchId: engine.state.matchId,
      actorId,
      kind: 'day',
      text: '继续发言。',
    })
  }
}

function withDeadIds(state: GameState, playerIds: readonly PlayerId[]): GameState {
  const dead = new Set(playerIds)
  return {
    ...state,
    players: new Map(
      [...state.players].map(([playerId, player]) => [
        playerId,
        dead.has(playerId) ? { ...player, alive: false, canVote: false } : player,
      ]),
    ),
  }
}

function withDeaths(
  state: GameState,
  deaths: readonly { playerId: PlayerId; causes: readonly string[]; timing: 'day' | 'night' }[],
): GameState {
  const next = withDeadIds(
    state,
    deaths.map((death) => death.playerId),
  )
  return {
    ...next,
    recentDeaths: new Map(deaths.map((death) => [death.playerId, death])),
  }
}

function completeTerminal(
  ruleset: RulesetRuntime,
  initialState: GameState,
  board: BoardManifest,
  initialEvents: readonly GameEvent[],
): { readonly state: GameState; readonly events: readonly GameEvent[] } {
  let state = initialState
  const events = [...initialEvents]
  const runtime: RuleRuntime = {
    get state() {
      return state
    },
    board,
    events,
    roles: ruleset.roles,
    resolution: ruleset.resolution,
    victories: ruleset.victories,
    queries: ruleset.queries,
    triggers: ruleset.triggers,
    append: (payload: GameEventPayload, eventVisibility: EventVisibility) => {
      const event = GameEventSchema.parse({
        matchId: state.matchId,
        sequence: state.lastSequence + 1,
        occurredAt: '2026-08-30T00:00:00.000Z',
        visibility: eventVisibility,
        payload,
      })
      events.push(event)
      state = reduceGameEvent(state, event, ruleset.events)
      return event
    },
  }
  ruleset.rules.complete(PhaseIdSchema.parse('phase-match-ended'), runtime)
  return { state, events }
}
