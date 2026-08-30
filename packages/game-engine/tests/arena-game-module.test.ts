import {
  AgentProfileIdSchema,
  MatchIdSchema,
  PlayerActionSchema,
  PlayerIdSchema,
  RoleIdSchema,
} from '@agentwolf/contracts'
import { MatchIdSchema as CoreMatchIdSchema, ParticipantIdSchema } from '@agent-arena/contracts'
import { describe, expect, it } from 'vitest'
import {
  AgentWolfGameMachine,
  AgentWolfGameModule,
  GameEngine,
  coreActionFor,
  createClassicRuleset,
  sixPlayerBoard,
} from '../src/index.js'

describe('AgentWolf Core GameModule adapter', () => {
  it('exposes stable decisions, privacy-safe observations, action batches, and restore', () => {
    const runtime = createClassicRuleset()
    const module = new AgentWolfGameModule(sixPlayerBoard, runtime)
    const setup = arenaSetup()
    const machine = module.create({
      matchId: CoreMatchIdSchema.parse('match-arena-adapter'),
      setup,
      seed: 1,
      clock: stableClock(),
    })
    const first = machine.currentDecision()!
    expect(first.mode).toBe('single')
    expect(first.actors[0]?.participantId).toBe('player-1')
    const firstId = first.id

    machine.engine.recordDeliveryStarted(PlayerIdSchema.parse('player-1'), 'delivery-one', 1, 10)
    machine.engine.recordDeliveryAcknowledged(PlayerIdSchema.parse('player-1'), 'delivery-one', 10)
    expect(machine.currentDecision()?.id).toBe(firstId)

    const host = module.observe(machine, { kind: 'host' })
    const spectator = module.observe(machine, { kind: 'spectator' })
    const wolf = module.observe(machine, {
      kind: 'participant',
      participantId: ParticipantIdSchema.parse('player-1'),
    })
    const villager = module.observe(machine, {
      kind: 'participant',
      participantId: ParticipantIdSchema.parse('player-3'),
    })
    expect(host.facts.visibleEvents.length).toBeGreaterThan(spectator.facts.visibleEvents.length)
    expect(wolf.visibleEventSequences).not.toEqual(villager.visibleEventSequences)
    expect(module.groups(machine).get('group-faction-werewolf')).toEqual(
      new Set(['player-1', 'player-2']),
    )

    const speech = PlayerActionSchema.parse({
      type: 'speech',
      matchId: MatchIdSchema.parse('match-arena-adapter'),
      actorId: PlayerIdSchema.parse('player-1'),
      kind: 'wolf-council',
      text: 'skip',
    })
    const coreSpeech = coreActionFor(first, speech)
    expect(machine.validate(coreSpeech)).toEqual(coreSpeech)
    expect(machine.submit([coreSpeech]).length).toBeGreaterThan(0)
    expect(machine.takeOriginalEvents().length).toBeGreaterThan(0)
    expect(machine.takeOriginalEvents()).toEqual([])

    const second = machine.currentDecision()!
    machine.submit([
      coreActionFor(
        second,
        PlayerActionSchema.parse({
          type: 'speech',
          matchId: MatchIdSchema.parse('match-arena-adapter'),
          actorId: PlayerIdSchema.parse('player-2'),
          kind: 'wolf-council',
          text: 'skip',
        }),
      ),
    ])
    const vote = machine.currentDecision()!
    expect(vote.mode).toBe('barrier')
    const votes = vote.actors.map((actor) =>
      coreActionFor(
        vote,
        PlayerActionSchema.parse({
          type: 'vote',
          matchId: MatchIdSchema.parse('match-arena-adapter'),
          actorId: PlayerIdSchema.parse(actor.participantId),
          kind: 'wolf-kill',
          targetId: null,
        }),
      ),
    )
    machine.submit(votes)
    const restored = module.restore({
      matchId: machine.matchId,
      setup,
      events: machine.events,
      clock: stableClock(),
    })
    expect(restored.state).toEqual(machine.state)
    expect(restored.currentDecision()?.id).toBe(machine.currentDecision()?.id)
  })

  it('fails closed for mismatched payloads and restores paused lifecycle state', () => {
    const runtime = createClassicRuleset()
    const module = new AgentWolfGameModule(sixPlayerBoard, runtime)
    const machine = module.create({
      matchId: CoreMatchIdSchema.parse('match-arena-invalid'),
      setup: arenaSetup(),
      seed: 1,
    })
    const boundary = machine.currentDecision()!
    const speech = coreActionFor(
      boundary,
      PlayerActionSchema.parse({
        type: 'speech',
        matchId: MatchIdSchema.parse('match-arena-invalid'),
        actorId: PlayerIdSchema.parse('player-1'),
        kind: 'wolf-council',
        text: 'skip',
      }),
    )
    expect(() =>
      machine.validate({ ...speech, actorId: ParticipantIdSchema.parse('player-2') }),
    ).toThrow()

    machine.engine.pause('manual pause')
    const restored = module.restore({
      matchId: machine.matchId,
      setup: arenaSetup(),
      events: machine.events,
    })
    expect(restored.state.status).toBe('paused')
    expect(restored.state.pausedReason).toBe('manual pause')
    expect(restored.outcome).toBeNull()
    expect(restored.currentDecision()).toBeNull()
  })

  it('projects an ended engine as a Core outcome', () => {
    const runtime = createClassicRuleset()
    const source = GameEngine.create({
      matchId: MatchIdSchema.parse('match-arena-ended'),
      board: sixPlayerBoard,
      players: arenaSetup().players,
      roleAssignment: 'manual',
      seed: 1,
      ruleset: runtime,
    })
    const ended = GameEngine.restore({
      matchId: MatchIdSchema.parse('match-arena-ended'),
      board: sixPlayerBoard,
      events: source.events,
      status: 'ended',
      pausedReason: null,
      ruleset: runtime,
    })
    expect(new AgentWolfGameMachine(ended).outcome).toMatchObject({ status: 'ended' })
  })
})

function arenaSetup() {
  const roles = [
    'role-werewolf',
    'role-werewolf',
    'role-villager',
    'role-villager',
    'role-seer',
    'role-hunter',
  ] as const
  return {
    players: roles.map((roleId, index) => ({
      id: PlayerIdSchema.parse(`player-${index + 1}`),
      seat: index + 1,
      name: `Player ${index + 1}`,
      profileId: AgentProfileIdSchema.parse(`profile-test-${index + 1}`),
      roleId: RoleIdSchema.parse(roleId),
    })),
    roleAssignment: 'manual' as const,
    start: true,
  }
}

function stableClock(): () => Date {
  let tick = 0
  return () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++))
}
