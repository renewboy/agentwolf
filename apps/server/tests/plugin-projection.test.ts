import {
  AgentProfileIdSchema,
  GameEventSchema,
  MatchIdSchema,
  PhaseIdSchema,
  PlayerIdSchema,
  playerIdForSeat,
} from '@agentwolf/contracts'
import {
  GameEngine,
  awakenedHiddenWolfEventTypes,
  createClassicRuleset,
  cupidAbilityIds,
  cupidBoard,
  cupidEventTypes,
  magicMirrorInspectedEventType,
  mirrorHiddenBoard,
} from '@agentwolf/game-engine'
import { describe, expect, it } from 'vitest'
import { projectMatch } from '../src/projector.js'

describe('plugin event projection', () => {
  it('keeps Cupid phase and lovers private while presenting linked deaths by visibility', () => {
    const ruleset = createClassicRuleset()
    const matchId = MatchIdSchema.parse('match-cupid-private-projection')
    const roleIds = cupidBoard.roles.flatMap(({ roleId, count }) =>
      Array.from({ length: count }, () => roleId),
    )
    const engine = GameEngine.create({
      matchId,
      board: cupidBoard,
      ruleset,
      roleAssignment: 'manual',
      seed: 1,
      players: roleIds.map((roleId, index) => ({
        id: playerIdForSeat(index + 1),
        seat: index + 1,
        name: `Cupid player ${index + 1}`,
        profileId: AgentProfileIdSchema.parse(`profile-cupid-${index + 1}`),
        roleId,
      })),
    })
    engine.start()
    const cupid = [...engine.state.players.values()].find(
      (player) => player.roleId === 'role-cupid',
    )!
    const wolf = [...engine.state.players.values()].find(
      (player) => player.roleId === 'role-werewolf',
    )!
    const villager = [...engine.state.players.values()].find(
      (player) => player.roleId === 'role-villager',
    )!
    const unrelated = [...engine.state.players.values()].find(
      (player) => player.id !== cupid.id && player.id !== wolf.id && player.id !== villager.id,
    )!
    const phaseOptions = {
      matchId,
      board: cupidBoard,
      boardName: 'Cupid projection board',
      state: engine.state,
      events: engine.events,
      roles: ruleset.roles,
    }
    expect(projectMatch({ ...phaseOptions, view: { kind: 'closed-eye' } })).toMatchObject({
      phaseId: 'phase-night-hidden',
      phaseLabel: '夜间行动',
    })
    expect(
      projectMatch({ ...phaseOptions, view: { kind: 'player', playerId: unrelated.id } }),
    ).toMatchObject({ phaseId: 'phase-night-hidden' })
    expect(
      projectMatch({ ...phaseOptions, view: { kind: 'player', playerId: cupid.id } }),
    ).toMatchObject({ phaseId: 'phase-night-cupid', phaseLabel: '丘比特连线' })

    engine.submit({
      type: 'night-action',
      matchId,
      actorId: cupid.id,
      abilityId: cupidAbilityIds.link,
      targetIds: [wolf.id, villager.id],
    })
    const linkedOptions = { ...phaseOptions, state: engine.state, events: engine.events }
    for (const playerId of [cupid.id, wolf.id, villager.id]) {
      const view = projectMatch({
        ...linkedOptions,
        view: { kind: 'player', playerId },
      })
      expect(view.timeline.some((item) => item.title.includes('情侣'))).toBe(true)
      expect(view.effectCues.some((cue) => cue.effectId === 'cupid-link')).toBe(true)
      expect(
        view.seats
          .filter((seat) => seat.markers.includes('cupid-lover'))
          .map((seat) => seat.playerId),
      ).toEqual([wolf.id, villager.id])
    }
    const godView = projectMatch({ ...linkedOptions, view: { kind: 'god' } })
    expect(
      godView.seats
        .filter((seat) => seat.markers.includes('cupid-lover'))
        .map((seat) => seat.playerId),
    ).toEqual([wolf.id, villager.id])
    for (const view of [
      { kind: 'closed-eye' as const },
      { kind: 'player' as const, playerId: unrelated.id },
    ]) {
      const projected = projectMatch({ ...linkedOptions, view })
      expect(projected.timeline.some((item) => item.title.includes('情侣'))).toBe(false)
      expect(projected.effectCues.some((cue) => cue.effectId === 'cupid-link')).toBe(false)
      expect(projected.seats.every((seat) => seat.markers.length === 0)).toBe(true)
    }
    const wolfView = projectMatch({
      ...linkedOptions,
      view: { kind: 'player', playerId: wolf.id },
    })
    expect(wolfView.seats.find((seat) => seat.playerId === villager.id)?.roleId).toBeUndefined()
    const cupidView = projectMatch({
      ...linkedOptions,
      view: { kind: 'player', playerId: cupid.id },
    })
    expect(cupidView.seats.find((seat) => seat.playerId === wolf.id)?.roleId).toBeUndefined()

    const linkedDeath = GameEventSchema.parse({
      matchId,
      sequence: engine.state.lastSequence + 1,
      occurredAt: '2026-08-29T00:00:00.000Z',
      visibility: { kind: 'public' },
      payload: {
        type: 'plugin.event',
        pluginId: 'plugin-role-cupid',
        eventType: cupidEventTypes.linkedDeath,
        schemaVersion: 2,
        data: {
          sourceId: wolf.id,
          targetId: villager.id,
          timing: 'day',
          presentation: 'partner-only',
        },
      },
    })
    const linkedDeathPublished = GameEventSchema.parse({
      matchId,
      sequence: linkedDeath.sequence + 1,
      occurredAt: '2026-08-29T00:00:00.500Z',
      visibility: { kind: 'public' },
      payload: { type: 'players.eliminated-publicly', playerIds: [villager.id] },
    })
    const publicView = projectMatch({
      ...linkedOptions,
      events: [...engine.events, linkedDeath, linkedDeathPublished],
      view: { kind: 'closed-eye' },
    })
    expect(publicView.timeline.at(-1)?.title).toContain('因情侣关系殉情')
    expect(publicView.timeline.at(-1)?.title).not.toContain('出局，')
    expect(publicView.effectCues.at(-1)?.effectId).toBe('cupid-linked-death')
    expect(publicView.seats.find((seat) => seat.playerId === villager.id)?.alive).toBe(false)

    const privateNightLinkedDeath = GameEventSchema.parse({
      matchId,
      sequence: linkedDeath.sequence,
      occurredAt: linkedDeath.occurredAt,
      visibility: { kind: 'god' },
      payload: {
        type: 'plugin.event',
        pluginId: 'plugin-role-cupid',
        eventType: cupidEventTypes.linkedDeath,
        schemaVersion: 2,
        data: {
          sourceId: wolf.id,
          targetId: villager.id,
          timing: 'night',
          presentation: 'partner-only',
        },
      },
    })
    const closedNightView = projectMatch({
      ...linkedOptions,
      events: [...engine.events, privateNightLinkedDeath],
      view: { kind: 'closed-eye' },
    })
    expect(closedNightView.timeline.some((item) => item.title.includes('殉情'))).toBe(false)
    expect(closedNightView.effectCues.some((cue) => cue.effectId === 'cupid-linked-death')).toBe(
      false,
    )
    const godNightView = projectMatch({
      ...linkedOptions,
      events: [...engine.events, privateNightLinkedDeath],
      view: { kind: 'god' },
    })
    expect(godNightView.timeline.at(-1)?.title).toContain('因情侣关系殉情')
    expect(godNightView.effectCues.at(-1)?.effectId).toBe('cupid-linked-death')

    const winningPlayerIds = [cupid.id, wolf.id, villager.id]
    const ended = GameEventSchema.parse({
      matchId,
      sequence: linkedDeathPublished.sequence + 1,
      occurredAt: '2026-08-29T00:00:01.000Z',
      visibility: { kind: 'public' },
      payload: {
        type: 'match.ended',
        winner: 'independent',
        winningPlayerIds,
        reason: 'cupid-lovers-last-standing',
      },
    })
    expect(
      projectMatch({
        ...linkedOptions,
        state: {
          ...engine.state,
          status: 'ended',
          winner: 'independent',
          winningPlayerIds,
          lastSequence: ended.sequence,
        },
        events: [...engine.events, linkedDeath, linkedDeathPublished, ended],
        view: { kind: 'closed-eye' },
      }),
    ).toMatchObject({
      winner: 'independent',
      winningPlayerIds,
      timeline: expect.arrayContaining([
        expect.objectContaining({ kind: 'match.ended', playerIds: winningPlayerIds }),
      ]),
    })

    const loversRevealed = GameEventSchema.parse({
      matchId,
      sequence: ended.sequence + 1,
      occurredAt: '2026-08-29T00:00:02.000Z',
      visibility: { kind: 'public' },
      payload: {
        type: 'public.announcement',
        code: 'cupid-lovers-revealed',
        playerIds: [wolf.id, villager.id],
        params: {},
      },
    })
    const terminalState = {
      ...engine.state,
      status: 'ended' as const,
      winner: 'independent' as const,
      winningPlayerIds,
      lastSequence: loversRevealed.sequence,
    }
    const terminalEvents = [
      ...engine.events,
      linkedDeath,
      linkedDeathPublished,
      ended,
      loversRevealed,
    ]
    for (const view of [
      { kind: 'god' as const },
      { kind: 'closed-eye' as const },
      { kind: 'player' as const, playerId: cupid.id },
      { kind: 'player' as const, playerId: wolf.id },
      { kind: 'player' as const, playerId: unrelated.id },
    ]) {
      const projected = projectMatch({
        ...linkedOptions,
        state: terminalState,
        events: terminalEvents,
        view,
      })
      expect(
        projected.seats
          .filter((seat) => seat.markers.includes('cupid-lover'))
          .map((seat) => seat.playerId),
      ).toEqual([wolf.id, villager.id])
      expect(projected.timeline.at(-1)?.title).toContain('最终情侣关系')
    }
  })

  it('narrates and animates a private Magic Mirror result only for permitted views', () => {
    const ruleset = createClassicRuleset()
    const matchId = MatchIdSchema.parse('match-plugin-projection')
    const roleIds = mirrorHiddenBoard.roles.flatMap(({ roleId, count }) =>
      Array.from({ length: count }, () => roleId),
    )
    const engine = GameEngine.create({
      matchId,
      board: mirrorHiddenBoard,
      ruleset,
      roleAssignment: 'manual',
      seed: 1,
      players: roleIds.map((roleId, index) => ({
        id: playerIdForSeat(index + 1),
        seat: index + 1,
        name: `Plugin player ${index + 1}`,
        profileId: AgentProfileIdSchema.parse(`profile-plugin-${index + 1}`),
        roleId,
      })),
    })
    const actor = [...engine.state.players.values()].find(
      (player) => player.roleId === 'role-magic-mirror-girl',
    )!
    const target = [...engine.state.players.values()].find(
      (player) => player.roleId === 'role-guard',
    )!
    const event = GameEventSchema.parse({
      matchId,
      sequence: engine.state.lastSequence + 1,
      occurredAt: '2026-08-24T00:00:00.000Z',
      visibility: { kind: 'players', playerIds: [actor.id] },
      payload: {
        type: 'plugin.event',
        pluginId: 'plugin-role-magic-mirror-girl',
        eventType: magicMirrorInspectedEventType,
        schemaVersion: 1,
        data: { actorId: actor.id, targetId: target.id, roleId: target.roleId },
      },
    })
    const options = {
      matchId,
      board: mirrorHiddenBoard,
      boardName: 'Plugin projection board',
      state: engine.state,
      events: [...engine.events, event],
      roles: ruleset.roles,
    }

    expect(projectMatch({ ...options, view: { kind: 'closed-eye' } }).effectCues).toEqual([])
    const playerView = projectMatch({
      ...options,
      view: { kind: 'player', playerId: PlayerIdSchema.parse(actor.id) },
    })
    expect(playerView.timeline.at(-1)?.title).toContain('具体身份是守卫')
    expect(playerView.effectCues.at(-1)).toMatchObject({
      effectId: 'magic-mirror-inspect',
      sourcePlayerIds: [actor.id],
      targetPlayerIds: [target.id],
    })
    expect(projectMatch({ ...options, view: { kind: 'god' } }).effectCues).toHaveLength(1)
  })

  it('keeps Awakened Hidden Wolf learning private to the actor and god views', () => {
    const ruleset = createClassicRuleset()
    const matchId = MatchIdSchema.parse('match-awakened-hidden-wolf-projection')
    const roleIds = mirrorHiddenBoard.roles.flatMap(({ roleId, count }) =>
      Array.from({ length: count }, () => roleId),
    )
    const engine = GameEngine.create({
      matchId,
      board: mirrorHiddenBoard,
      ruleset,
      roleAssignment: 'manual',
      seed: 1,
      players: roleIds.map((roleId, index) => ({
        id: playerIdForSeat(index + 1),
        seat: index + 1,
        name: `Hidden player ${index + 1}`,
        profileId: AgentProfileIdSchema.parse(`profile-hidden-${index + 1}`),
        roleId,
      })),
    })
    const actor = [...engine.state.players.values()].find(
      (player) => player.roleId === 'role-awakened-hidden-wolf',
    )!
    const target = [...engine.state.players.values()].find(
      (player) => player.roleId === 'role-guard',
    )!
    const event = GameEventSchema.parse({
      matchId,
      sequence: engine.state.lastSequence + 1,
      occurredAt: '2026-08-26T00:00:00.000Z',
      visibility: { kind: 'players', playerIds: [actor.id] },
      payload: {
        type: 'plugin.event',
        pluginId: 'plugin-role-awakened-hidden-wolf',
        eventType: awakenedHiddenWolfEventTypes.learned,
        schemaVersion: 1,
        data: {
          actorId: actor.id,
          targetId: target.id,
          roleId: target.roleId,
          night: 1,
        },
      },
    })
    const options = {
      matchId,
      board: mirrorHiddenBoard,
      boardName: 'Hidden projection board',
      state: engine.state,
      events: [...engine.events, event],
      roles: ruleset.roles,
    }

    expect(projectMatch({ ...options, view: { kind: 'closed-eye' } }).effectCues).toEqual([])
    const actorView = projectMatch({
      ...options,
      view: { kind: 'player', playerId: PlayerIdSchema.parse(actor.id) },
    })
    expect(actorView.timeline.at(-1)?.title).toContain('真实身份是守卫')
    expect(actorView.effectCues.at(-1)).toMatchObject({
      effectId: 'awakened-hidden-wolf-learn',
      sourcePlayerIds: [actor.id],
      targetPlayerIds: [target.id],
    })
    expect(projectMatch({ ...options, view: { kind: 'god' } }).effectCues).toHaveLength(1)
  })

  it('masks private Awakened Hidden Wolf phases outside god and actor views', () => {
    const ruleset = createClassicRuleset()
    const matchId = MatchIdSchema.parse('match-awakened-hidden-wolf-private-phase')
    const roleIds = mirrorHiddenBoard.roles.flatMap(({ roleId, count }) =>
      Array.from({ length: count }, () => roleId),
    )
    const engine = GameEngine.create({
      matchId,
      board: mirrorHiddenBoard,
      ruleset,
      roleAssignment: 'manual',
      seed: 1,
      players: roleIds.map((roleId, index) => ({
        id: playerIdForSeat(index + 1),
        seat: index + 1,
        name: `Phase player ${index + 1}`,
        profileId: AgentProfileIdSchema.parse(`profile-phase-${index + 1}`),
        roleId,
      })),
    })
    const actor = [...engine.state.players.values()].find(
      (player) => player.roleId === 'role-awakened-hidden-wolf',
    )!
    const unrelated = [...engine.state.players.values()].find(
      (player) => player.roleId === 'role-villager',
    )!
    const state = {
      ...engine.state,
      phaseId: PhaseIdSchema.parse('phase-night-awakened-hidden-wolf-attack'),
      phaseLabelKey: 'phases.nightAwakenedHiddenWolfAttack',
      phaseActors: [actor.id],
    }
    const options = {
      matchId,
      board: mirrorHiddenBoard,
      boardName: 'Private phase board',
      state,
      events: engine.events,
      roles: ruleset.roles,
    }

    for (const view of [
      { kind: 'closed-eye' as const },
      { kind: 'player' as const, playerId: unrelated.id },
    ]) {
      expect(projectMatch({ ...options, view })).toMatchObject({
        phaseId: 'phase-night-hidden',
        phaseLabel: '夜间行动',
      })
    }
    expect(
      projectMatch({ ...options, view: { kind: 'player', playerId: actor.id } }),
    ).toMatchObject({
      phaseId: 'phase-night-awakened-hidden-wolf-attack',
      phaseLabel: '觉醒隐狼行动',
    })
    expect(projectMatch({ ...options, view: { kind: 'god' } })).toMatchObject({
      phaseId: 'phase-night-awakened-hidden-wolf-attack',
      phaseLabel: '觉醒隐狼行动',
    })
  })

  it('projects a copied Hunter shot exactly like an ordinary Hunter shot', () => {
    const ruleset = createClassicRuleset()
    const matchId = MatchIdSchema.parse('match-awakened-hidden-wolf-hunter-projection')
    const roleIds = mirrorHiddenBoard.roles.flatMap(({ roleId, count }) =>
      Array.from({ length: count }, () => roleId),
    )
    const engine = GameEngine.create({
      matchId,
      board: mirrorHiddenBoard,
      ruleset,
      roleAssignment: 'manual',
      seed: 1,
      players: roleIds.map((roleId, index) => ({
        id: playerIdForSeat(index + 1),
        seat: index + 1,
        name: `Shot player ${index + 1}`,
        profileId: AgentProfileIdSchema.parse(`profile-shot-${index + 1}`),
        roleId,
      })),
    })
    const actor = [...engine.state.players.values()].find(
      (player) => player.roleId === 'role-awakened-hidden-wolf',
    )!
    const target = [...engine.state.players.values()].find(
      (player) => player.roleId === 'role-villager',
    )!
    const event = GameEventSchema.parse({
      matchId,
      sequence: engine.state.lastSequence + 1,
      occurredAt: '2026-08-26T00:00:00.000Z',
      visibility: { kind: 'public' },
      payload: { type: 'hunter.shot', playerId: actor.id, targetId: target.id },
    })
    const projected = projectMatch({
      matchId,
      board: mirrorHiddenBoard,
      boardName: 'Copied Hunter board',
      state: engine.state,
      events: [...engine.events, event],
      view: { kind: 'closed-eye' },
      roles: ruleset.roles,
    })

    expect(projected.timeline.at(-1)?.title).toContain('发动猎人技能')
    expect(projected.timeline.at(-1)?.title).not.toMatch(/觉醒隐狼|复制/u)
    expect(projected.effectCues.at(-1)).toMatchObject({
      effectId: 'hunter-shot',
      roleId: 'role-hunter',
      abilityId: 'ability-hunter-shot',
      sourcePlayerIds: [actor.id],
      targetPlayerIds: [target.id],
    })
    expect(projected.seats.find((seat) => seat.playerId === actor.id)?.roleId).toBeUndefined()
  })
})
