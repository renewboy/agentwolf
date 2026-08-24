import {
  AgentProfileIdSchema,
  GameEventSchema,
  MatchIdSchema,
  PlayerIdSchema,
  playerIdForSeat,
} from '@agentwolf/contracts'
import {
  GameEngine,
  createClassicRuleset,
  magicMirrorBoard,
  magicMirrorInspectedEventType,
} from '@agentwolf/game-engine'
import { describe, expect, it } from 'vitest'
import { projectMatch } from '../src/projector.js'

describe('plugin event projection', () => {
  it('narrates and animates a private Magic Mirror result only for permitted views', () => {
    const ruleset = createClassicRuleset()
    const matchId = MatchIdSchema.parse('match-plugin-projection')
    const roleIds = magicMirrorBoard.roles.flatMap(({ roleId, count }) =>
      Array.from({ length: count }, () => roleId),
    )
    const engine = GameEngine.create({
      matchId,
      board: magicMirrorBoard,
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
      (player) => player.roleId === 'role-hunter',
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
      board: magicMirrorBoard,
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
    expect(playerView.timeline.at(-1)?.title).toContain('具体身份是猎人')
    expect(playerView.effectCues.at(-1)).toMatchObject({
      effectId: 'magic-mirror-inspect',
      sourcePlayerIds: [actor.id],
      targetPlayerIds: [target.id],
    })
    expect(projectMatch({ ...options, view: { kind: 'god' } }).effectCues).toHaveLength(1)
  })
})
