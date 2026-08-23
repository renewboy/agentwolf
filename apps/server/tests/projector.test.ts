import {
  AgentProfileIdSchema,
  GameEventSchema,
  MatchIdSchema,
  PhaseIdSchema,
  PlayerIdSchema,
} from '@agentwolf/contracts'
import type { NarrationCatalog } from '@agentwolf/assets'
import {
  GameEngine,
  createV1RoleRegistry,
  ninePlayerBoard,
  sixPlayerBoard,
} from '@agentwolf/game-engine'
import { describe, expect, it } from 'vitest'
import { projectMatch, projectRoleEffectCues, projectTimeline } from '../src/projector.js'

describe('vote timeline projection', () => {
  it('projects a raised-hand state only while a standing candidate is in the election', () => {
    const matchId = MatchIdSchema.parse('match-sheriff-candidate-projection')
    const roleIds = sixPlayerBoard.roles.flatMap(({ roleId, count }) =>
      Array.from({ length: count }, () => roleId),
    )
    const engine = GameEngine.create({
      matchId,
      board: sixPlayerBoard,
      roleAssignment: 'manual',
      seed: 4,
      roles: createV1RoleRegistry(),
      players: roleIds.map((roleId, index) => ({
        id: PlayerIdSchema.parse(`player-${index + 1}`),
        seat: index + 1,
        name: `Candidate player ${index + 1}`,
        profileId: AgentProfileIdSchema.parse(`profile-candidate-${index + 1}`),
        roleId,
      })),
    })
    const candidateId = PlayerIdSchema.parse('player-2')
    const electionState = {
      ...engine.state,
      phaseId: PhaseIdSchema.parse('phase-sheriff-speech'),
      sheriff: {
        ...engine.state.sheriff,
        standingCandidates: new Set([candidateId]),
      },
    }
    const options = {
      matchId,
      board: sixPlayerBoard,
      boardName: 'Candidate projection board',
      events: engine.events,
      view: { kind: 'god' } as const,
      roles: createV1RoleRegistry(),
      model: () => 'projection-model',
    }
    const godSeats = projectMatch({ ...options, state: electionState }).seats
    expect(godSeats).toContainEqual(
      expect.objectContaining({ playerId: candidateId, sheriffCandidate: true }),
    )
    expect(godSeats[0]?.model).toBe('projection-model')
    const closedEyeSeat = projectMatch({
      ...options,
      state: electionState,
      view: { kind: 'closed-eye' },
    }).seats[0]
    expect(closedEyeSeat).toMatchObject({ model: 'projection-model' })
    expect(closedEyeSeat?.roleId).toBeUndefined()
    expect(
      projectMatch({
        ...options,
        state: { ...electionState, phaseId: PhaseIdSchema.parse('phase-day-speech') },
      }).seats.find((seat) => seat.playerId === candidateId)?.sheriffCandidate,
    ).toBe(false)
  })

  it('groups ballots by target using seat numbers without player names', () => {
    const matchId = MatchIdSchema.parse('match-vote-projection')
    const players = new Map(
      Array.from({ length: 6 }, (_, index) => {
        const playerId = PlayerIdSchema.parse(`player-${index + 1}`)
        return [
          playerId,
          { playerId, seat: index + 1, name: `不应展示的名字${index + 1}` },
        ] as const
      }),
    )
    const catalog: NarrationCatalog = {
      players,
      roleName: (roleId) => roleId,
    }
    const votes = [
      ['player-2', 'player-1'],
      ['player-3', 'player-1'],
      ['player-4', 'player-1'],
      ['player-1', 'player-4'],
      ['player-5', 'player-4'],
      ['player-6', 'player-4'],
    ] as const
    const events = votes.map(([voterId, targetId], index) =>
      GameEventSchema.parse({
        matchId,
        sequence: index + 1,
        occurredAt: '2026-08-23T00:00:00.000Z',
        visibility: { kind: 'public' },
        payload: {
          type: 'vote.cast',
          voterId,
          targetId,
          kind: 'exile',
          weight: 1,
        },
      }),
    )
    events.push(
      GameEventSchema.parse({
        matchId,
        sequence: 7,
        occurredAt: '2026-08-23T00:00:01.000Z',
        visibility: { kind: 'public' },
        payload: {
          type: 'vote.resolved',
          kind: 'exile',
          totals: { 'player-1': 3, 'player-4': 3 },
          tiedPlayerIds: ['player-1', 'player-4'],
          selectedPlayerId: null,
        },
      }),
    )

    const result = projectTimeline(events, catalog)
    expect(result).toHaveLength(1)
    expect(result[0]?.title).toBe('投票结算：1号、4号同为3票。')
    expect(result[0]?.detail).toBe('投1号：2号、3号、4号\n投4号：1号、5号、6号')
    expect(`${result[0]?.title}\n${result[0]?.detail}`).not.toContain('不应展示的名字')
  })

  it('keeps weighted ballots and abstentions visible in grouped rows', () => {
    const matchId = MatchIdSchema.parse('match-weighted-vote-projection')
    const player1 = PlayerIdSchema.parse('player-1')
    const player2 = PlayerIdSchema.parse('player-2')
    const player3 = PlayerIdSchema.parse('player-3')
    const catalog: NarrationCatalog = {
      players: new Map([
        [player1, { playerId: player1, seat: 1, name: '甲' }],
        [player2, { playerId: player2, seat: 2, name: '乙' }],
        [player3, { playerId: player3, seat: 3, name: '丙' }],
      ]),
      roleName: (roleId) => roleId,
    }
    const events = [
      GameEventSchema.parse({
        matchId,
        sequence: 1,
        occurredAt: '2026-08-23T00:00:00.000Z',
        visibility: { kind: 'public' },
        payload: {
          type: 'vote.cast',
          voterId: player1,
          targetId: player3,
          kind: 'sheriff',
          weight: 1.5,
        },
      }),
      GameEventSchema.parse({
        matchId,
        sequence: 2,
        occurredAt: '2026-08-23T00:00:00.000Z',
        visibility: { kind: 'public' },
        payload: {
          type: 'vote.cast',
          voterId: player2,
          targetId: null,
          kind: 'sheriff',
          weight: 1,
        },
      }),
      GameEventSchema.parse({
        matchId,
        sequence: 3,
        occurredAt: '2026-08-23T00:00:01.000Z',
        visibility: { kind: 'public' },
        payload: {
          type: 'vote.resolved',
          kind: 'sheriff',
          totals: { 'player-3': 1.5 },
          tiedPlayerIds: [player3],
          selectedPlayerId: player3,
        },
      }),
    ]

    const result = projectTimeline(events, catalog)
    expect(result[0]?.title).toBe('投票结算：3号以1.5票获得最高票。')
    expect(result[0]?.detail).toBe('投3号：1号（1.5票）\n弃票：2号')
  })

  it('shows a detailed tied wolf ballot only to god and Werewolf player views', () => {
    const matchId = MatchIdSchema.parse('match-wolf-vote-projection')
    const roleIds = ninePlayerBoard.roles.flatMap(({ roleId, count }) =>
      Array.from({ length: count }, () => roleId),
    )
    const engine = GameEngine.create({
      matchId,
      board: ninePlayerBoard,
      roleAssignment: 'manual',
      seed: 7,
      players: roleIds.map((roleId, index) => ({
        id: PlayerIdSchema.parse(`player-${index + 1}`),
        seat: index + 1,
        name: `Wolf ballot player ${index + 1}`,
        profileId: AgentProfileIdSchema.parse(`profile-wolf-ballot-${index + 1}`),
        roleId,
      })),
    })
    const [firstWolf, secondWolf, thirdWolf] = [...engine.state.players.values()].filter(
      (player) => player.roleId === 'role-werewolf',
    )
    const [firstTarget, secondTarget] = [...engine.state.players.values()].filter(
      (player) => player.roleId === 'role-villager',
    )
    const witch = [...engine.state.players.values()].find(
      (player) => player.roleId === 'role-witch',
    )
    if (!firstWolf || !secondWolf || !thirdWolf || !firstTarget || !secondTarget || !witch) {
      throw new Error('Expected wolf vote projection roles')
    }
    const sequence = engine.state.lastSequence
    const events = [
      ...engine.events,
      GameEventSchema.parse({
        matchId,
        sequence: sequence + 1,
        occurredAt: '2026-08-23T00:00:00.000Z',
        visibility: { kind: 'faction', faction: 'werewolf' },
        payload: {
          type: 'vote.cast',
          voterId: firstWolf.id,
          targetId: firstTarget.id,
          kind: 'wolf-kill',
          weight: 1,
        },
      }),
      GameEventSchema.parse({
        matchId,
        sequence: sequence + 2,
        occurredAt: '2026-08-23T00:00:00.000Z',
        visibility: { kind: 'faction', faction: 'werewolf' },
        payload: {
          type: 'vote.cast',
          voterId: secondWolf.id,
          targetId: secondTarget.id,
          kind: 'wolf-kill',
          weight: 1,
        },
      }),
      GameEventSchema.parse({
        matchId,
        sequence: sequence + 3,
        occurredAt: '2026-08-23T00:00:00.000Z',
        visibility: { kind: 'faction', faction: 'werewolf' },
        payload: {
          type: 'vote.cast',
          voterId: thirdWolf.id,
          targetId: null,
          kind: 'wolf-kill',
          weight: 1,
        },
      }),
      GameEventSchema.parse({
        matchId,
        sequence: sequence + 4,
        occurredAt: '2026-08-23T00:00:01.000Z',
        visibility: { kind: 'faction', faction: 'werewolf' },
        payload: {
          type: 'vote.resolved',
          kind: 'wolf-kill',
          totals: { [firstTarget.id]: 1, [secondTarget.id]: 1 },
          tiedPlayerIds: [firstTarget.id, secondTarget.id],
          selectedPlayerId: firstTarget.id,
        },
      }),
    ]
    const options = {
      matchId,
      board: ninePlayerBoard,
      boardName: 'Wolf vote projection board',
      state: engine.state,
      events,
      roles: createV1RoleRegistry(),
    }
    const godVote = projectMatch({ ...options, view: { kind: 'god' } }).timeline.find(
      (item) => item.kind === 'vote.resolved',
    )
    expect(godVote).toMatchObject({
      title: '狼人投票平票：4号、5号、空刀同为1票，随机选择4号作为袭击目标。',
      detail: '投4号：1号\n投5号：2号\n空刀：3号',
    })
    expect(godVote?.playerIds.at(-1)).toBe(firstTarget.id)
    expect(
      projectMatch({
        ...options,
        view: { kind: 'player', playerId: firstWolf.id },
      }).timeline,
    ).toContainEqual(godVote)
    for (const view of [
      { kind: 'closed-eye' } as const,
      { kind: 'player', playerId: firstTarget.id } as const,
      { kind: 'player', playerId: witch.id } as const,
    ]) {
      expect(projectMatch({ ...options, view }).timeline).not.toContainEqual(
        expect.objectContaining({ kind: 'vote.resolved' }),
      )
    }
  })

  it('projects role-effect cues only after event visibility has been filtered', () => {
    const matchId = MatchIdSchema.parse('match-effect-visibility')
    const roleIds = sixPlayerBoard.roles.flatMap(({ roleId, count }) =>
      Array.from({ length: count }, () => roleId),
    )
    const engine = GameEngine.create({
      matchId,
      board: sixPlayerBoard,
      roleAssignment: 'manual',
      seed: 1,
      roles: createV1RoleRegistry(),
      players: roleIds.map((roleId, index) => ({
        id: PlayerIdSchema.parse(`player-${index + 1}`),
        seat: index + 1,
        name: `Effect player ${index + 1}`,
        profileId: AgentProfileIdSchema.parse(`profile-effect-${index + 1}`),
        roleId,
      })),
    })
    const seer = [...engine.state.players.values()].find((player) => player.roleId === 'role-seer')!
    const target = [...engine.state.players.values()].find((player) => player.id !== seer.id)!
    const privateEvent = GameEventSchema.parse({
      matchId,
      sequence: engine.events.at(-1)!.sequence + 1,
      occurredAt: '2026-08-23T00:00:01.000Z',
      visibility: { kind: 'players', playerIds: [seer.id] },
      payload: {
        type: 'seer.inspected',
        actorId: seer.id,
        targetId: target.id,
        result: 'village',
      },
    })
    const events = [...engine.events, privateEvent]
    const options = {
      matchId,
      board: sixPlayerBoard,
      boardName: 'Effect visibility board',
      state: engine.state,
      events,
      roles: createV1RoleRegistry(),
      model: () => 'effect-model',
    }
    expect(projectMatch({ ...options, view: { kind: 'closed-eye' } }).effectCues).toHaveLength(0)
    expect(
      projectMatch({ ...options, view: { kind: 'player', playerId: seer.id } }).effectCues,
    ).toMatchObject([{ effectId: 'seer-inspect', targetPlayerIds: [target.id] }])
    expect(projectMatch({ ...options, view: { kind: 'god' } }).effectCues).toMatchObject([
      { effectId: 'seer-inspect', variant: 'village' },
    ])
    expect(projectRoleEffectCues([privateEvent])).toMatchObject([
      { effectId: 'seer-inspect', roleId: 'role-seer' },
    ])
  })

  it('maps sheriff election and transfer events to role-neutral effect cues', () => {
    const matchId = MatchIdSchema.parse('match-sheriff-effects')
    const events = [
      GameEventSchema.parse({
        matchId,
        sequence: 1,
        occurredAt: '2026-08-23T00:00:00.000Z',
        visibility: { kind: 'public' },
        payload: { type: 'sheriff.elected', playerId: 'player-1' },
      }),
      GameEventSchema.parse({
        matchId,
        sequence: 2,
        occurredAt: '2026-08-23T00:00:01.000Z',
        visibility: { kind: 'public' },
        payload: {
          type: 'sheriff.transferred',
          fromPlayerId: 'player-1',
          toPlayerId: 'player-2',
        },
      }),
    ]
    expect(projectRoleEffectCues(events)).toMatchObject([
      {
        effectId: 'sheriff-elected',
        roleId: null,
        sourcePlayerIds: [],
        targetPlayerIds: ['player-1'],
      },
      {
        effectId: 'sheriff-transferred',
        roleId: null,
        sourcePlayerIds: ['player-1'],
        targetPlayerIds: ['player-2'],
      },
    ])
  })
})
