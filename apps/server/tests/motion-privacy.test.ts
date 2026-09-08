import {
  AgentProfileIdSchema,
  GameEventSchema,
  MatchIdSchema,
  PlayerIdSchema,
  type GameEvent,
  type SpectatorView,
} from '@agentwolf/contracts'
import { GameEngine, createV1RoleRegistry, guardBoard } from '@agentwolf/game-engine'
import { describe, expect, it } from 'vitest'
import { projectMatch, type SessionStatus } from '../src/projector.js'

function fixture() {
  const matchId = MatchIdSchema.parse('match-motion-privacy')
  const roles = createV1RoleRegistry()
  const engine = GameEngine.create({
    matchId,
    board: guardBoard,
    roles,
    roleAssignment: 'manual',
    seed: 12,
    players: guardBoard.roles
      .flatMap(({ roleId, count }) => Array.from({ length: count }, () => roleId))
      .map((roleId, index) => ({
        id: PlayerIdSchema.parse(`player-${index + 1}`),
        seat: index + 1,
        name: `玩家${index + 1}`,
        profileId: AgentProfileIdSchema.parse(`profile-motion-${index + 1}`),
        roleId,
      })),
  })
  const player = (role: string) =>
    [...engine.state.players.values()].find((p) => p.roleId === role)!.id
  const event = (
    payload: GameEvent['payload'],
    visibility: GameEvent['visibility'],
    sequence = 100,
  ) =>
    GameEventSchema.parse({
      matchId,
      sequence,
      occurredAt: '2026-09-08T00:00:00.000Z',
      payload,
      visibility,
    })
  const project = (events: GameEvent[], view: SpectatorView, status: SessionStatus = 'thinking') =>
    projectMatch({
      matchId,
      board: guardBoard,
      boardName: '动效隐私',
      state: { ...engine.state, status: 'running' },
      events: [...engine.events, ...events],
      view,
      roles,
      sessionStatus: () => status,
    })
  return { player, event, project }
}

describe('motion observation boundary', () => {
  it('makes public observations independent of private listener activity and completion', () => {
    const { player, event, project } = fixture()
    const wolf = player('role-werewolf')
    const speaker = player('role-villager')
    const speech = event(
      { type: 'speech.started', playerId: speaker, kind: 'day' },
      { kind: 'public' },
    )
    for (const view of [
      { kind: 'closed-eye' },
      { kind: 'player', playerId: player('role-seer') },
    ] as const) {
      const idle = project([speech], view, 'idle')
      for (const status of ['thinking', 'syncing', 'ready', 'submitted', 'failed'] as const) {
        const observed = project([speech], view, status)
        const external = (value: typeof observed) =>
          value.seats.filter((s) => view.kind !== 'player' || s.playerId !== view.playerId)
        expect(external(observed)).toEqual(external(idle))
        expect(observed.seats.find((s) => s.playerId === wolf)).toMatchObject({
          active: false,
          sessionStatus: 'idle',
        })
        expect(observed.seats.find((s) => s.playerId === speaker)).toMatchObject({
          active: true,
          sessionStatus: 'thinking',
        })
      }
    }
    expect(
      project([speech], { kind: 'god' }).seats.find((s) => s.playerId === wolf)?.sessionStatus,
    ).toBe('thinking')
    expect(
      project([speech], { kind: 'player', playerId: wolf }).seats.find((s) => s.playerId === wolf)
        ?.sessionStatus,
    ).toBe('thinking')
  })

  it('keeps every private night effect and speech actor out of unauthorized projections', () => {
    const { player, event, project } = fixture()
    const targetId = player('role-villager')
    const cases = [
      ['role-werewolf', { type: 'night.attack-selected', targetId }],
      [
        'role-seer',
        { type: 'seer.inspected', actorId: player('role-seer'), targetId, result: 'village' },
      ],
      ['role-guard', { type: 'guard.protected', actorId: player('role-guard'), targetId }],
      ...(['antidote', 'poison'] as const).map(
        (potion) =>
          [
            'role-witch',
            { type: 'witch.potion-used', actorId: player('role-witch'), targetId, potion },
          ] as const,
      ),
    ] as const
    for (const [role, payload] of cases) {
      const actorId = player(role)
      const action = event(payload, { kind: 'players', playerIds: [actorId] })
      for (const view of [
        { kind: 'closed-eye' },
        { kind: 'player', playerId: targetId },
      ] as const) {
        const observed = project([action], view)
        expect(observed.effectCues).toEqual([])
        expect(observed.seats.find((s) => s.playerId === actorId)).toMatchObject({
          active: false,
          sessionStatus: 'idle',
        })
      }
      expect(project([action], { kind: 'player', playerId: actorId }).effectCues).toHaveLength(1)
      expect(project([action], { kind: 'god' }).effectCues).toHaveLength(1)
    }
    const council = event(
      { type: 'speech.started', playerId: player('role-werewolf'), kind: 'wolf-council' },
      { kind: 'faction', faction: 'werewolf' },
    )
    expect(project([council], { kind: 'closed-eye' }).activeSpeech).toBeNull()
    expect(project([council], { kind: 'player', playerId: targetId }).activeSpeech).toBeNull()
  })

  it('clears an unfinished public speech when a hidden phase or speech supersedes it', () => {
    const { player, event, project } = fixture()
    const started = event(
      { type: 'speech.started', playerId: player('role-werewolf'), kind: 'day' },
      { kind: 'public' },
    )
    const hidden = event(
      { type: 'speech.started', playerId: player('role-seer'), kind: 'wolf-council' },
      { kind: 'god' },
      101,
    )
    const interrupted = event(
      { type: 'day.interrupted', reason: 'self-destruct' },
      { kind: 'public' },
      101,
    )
    for (const end of [hidden, interrupted]) {
      expect(project([started, end], { kind: 'closed-eye' }).activeSpeech).toBeNull()
      expect(project([started, end], { kind: 'closed-eye' }).seats.every((s) => !s.active)).toBe(
        true,
      )
    }
  })
})
