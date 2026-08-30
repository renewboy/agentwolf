import {
  AgentProfileIdSchema,
  MatchIdSchema,
  PlayerActionSchema,
  PlayerIdSchema,
  RoleIdSchema,
} from '@agentwolf/contracts'
import { AgentWolfGameModule, createClassicRuleset, sixPlayerBoard } from '@agentwolf/game-engine'
import { MatchIdSchema as CoreMatchIdSchema } from '@agent-arena/contracts'
import { describe, expect, it, vi } from 'vitest'
import { runCoreMatchTurn } from '../src/arena-match-turn.js'
import type { MatchTurnLoopOptions } from '../src/match-turn-loop.js'

describe('AgentWolf Core Match turn adapter', () => {
  it('fails when the engine has no actionable decision', async () => {
    const module = new AgentWolfGameModule(sixPlayerBoard, createClassicRuleset())
    const machine = module.create({
      matchId: CoreMatchIdSchema.parse('match-arena-turn'),
      setup: { ...setup(), start: false },
      seed: 1,
    })
    await expect(runCoreMatchTurn(options(machine.engine, module))).rejects.toThrow(
      /without an actionable turn/,
    )
  })

  it('returns disposed before submitting a collected action', async () => {
    const module = new AgentWolfGameModule(sixPlayerBoard, createClassicRuleset())
    const machine = module.create({
      matchId: CoreMatchIdSchema.parse('match-arena-turn'),
      setup: setup(),
      seed: 1,
    })
    advanceToWolfVote(machine.engine)
    const settled = vi.fn()
    const result = await runCoreMatchTurn(
      options(machine.engine, module, {
        isDisposed: () => true,
        settled,
        takeActorTurn: async (actor) => vote(actor.playerId),
      }),
    )
    expect(result).toBe('disposed')
    expect(settled).toHaveBeenCalled()
  })

  it('treats a phase change during collection as a superseded turn', async () => {
    const module = new AgentWolfGameModule(sixPlayerBoard, createClassicRuleset())
    const machine = module.create({
      matchId: CoreMatchIdSchema.parse('match-arena-turn'),
      setup: setup(),
      seed: 1,
    })
    const broadcast = vi.fn()
    advanceToWolfVote(machine.engine)
    const turn = machine.engine.currentTurn()!
    let advanced = false
    const result = await runCoreMatchTurn(
      options(machine.engine, module, {
        broadcast,
        takeActorTurn: async (actor) => {
          if (!advanced) {
            advanced = true
            for (const playerId of turn.actors) machine.engine.submit(vote(playerId))
          }
          return vote(actor.playerId)
        },
      }),
    )
    expect(result).toBe('continue')
    expect(broadcast).toHaveBeenCalled()
  })
})

function options(
  engine: Parameters<typeof runCoreMatchTurn>[0]['engine'],
  arenaModule: AgentWolfGameModule,
  overrides: {
    isDisposed?: () => boolean
    settled?: () => void
    broadcast?: () => void
    takeActorTurn?: MatchTurnLoopOptions['takeActorTurn']
  } = {},
): MatchTurnLoopOptions {
  const settled = overrides.settled ?? (() => undefined)
  return {
    engine,
    arena: { module: arenaModule },
    arenaSessions: undefined as never,
    speechInterrupts: null,
    playback: undefined as never,
    isDisposed: overrides.isDisposed ?? (() => false),
    playerRuntime: () => null,
    prepareActorTurn: async (playerId) =>
      ({ playerId, runtime: { actionSettled: settled } }) as never,
    takeActorTurn:
      overrides.takeActorTurn ?? (async (actor) => speech(actor.playerId, 'collected')),
    record: () => undefined,
    broadcastSnapshot: overrides.broadcast ?? (() => undefined),
  }
}

function setup() {
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

function speech(actorId: ReturnType<typeof PlayerIdSchema.parse>, text: string) {
  return PlayerActionSchema.parse({
    type: 'speech',
    matchId: MatchIdSchema.parse('match-arena-turn'),
    actorId,
    kind: 'wolf-council',
    text,
  })
}

function vote(actorId: ReturnType<typeof PlayerIdSchema.parse>) {
  return PlayerActionSchema.parse({
    type: 'vote',
    matchId: MatchIdSchema.parse('match-arena-turn'),
    actorId,
    kind: 'wolf-kill',
    targetId: null,
  })
}

function advanceToWolfVote(engine: Parameters<typeof runCoreMatchTurn>[0]['engine']): void {
  const turn = engine.currentTurn()!
  for (const [index, playerId] of turn.actors.entries()) {
    engine.submit(speech(playerId, `speech-${index}`))
  }
  expect(engine.currentTurn()?.actionType).toBe('vote')
}
