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
  magicMirrorInspectedEventType,
  mirrorHiddenBoard,
} from '@agentwolf/game-engine'
import { describe, expect, it } from 'vitest'
import { projectMatch } from '../src/projector.js'

describe('plugin event projection', () => {
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
