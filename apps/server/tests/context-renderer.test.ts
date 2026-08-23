import {
  AgentProfileIdSchema,
  GameEventSchema,
  MatchIdSchema,
  PlayerIdSchema,
} from '@agentwolf/contracts'
import { formatCopy, getCopy } from '@agentwolf/assets'
import {
  GameEngine,
  createV1RoleRegistry,
  guardBoard,
  ninePlayerBoard,
  sixPlayerBoard,
  type BoardManifest,
  type EnginePlayerInput,
} from '@agentwolf/game-engine'
import { describe, expect, it } from 'vitest'
import { ContextRenderer } from '../src/context-renderer.js'

describe('ContextRenderer board rules', () => {
  it('renders the active player-count policies into the foundation prompt', async () => {
    const renderer = new ContextRenderer(createV1RoleRegistry())
    const sixPlayerPrompt = await foundationPrompt(renderer, sixPlayerBoard)
    expect(sixPlayerPrompt).toContain('身份配置：狼人 2 名、平民 2 名、预言家 1 名、猎人 1 名。')
    expect(sixPlayerPrompt).toContain(getCopy('promptContext.werewolfVictorySlaughterAll'))
    expect(sixPlayerPrompt).toContain(getCopy('promptContext.sheriffDisabled'))
    expect(sixPlayerPrompt).not.toContain(getCopy('promptContext.witchSelfSaveNever'))

    const ninePlayerPrompt = await foundationPrompt(renderer, ninePlayerBoard)
    expect(ninePlayerPrompt).toContain(getCopy('promptContext.werewolfVictorySlaughterEdge'))
    expect(ninePlayerPrompt).toContain(getCopy('promptContext.sheriffEnabled'))
    expect(ninePlayerPrompt).toContain(
      formatCopy(getCopy('promptContext.witchPotionLimit'), { count: 1 }),
    )
  })

  it('delivers exact wolf teammate knowledge in the bootstrap foundation', async () => {
    const renderer = new ContextRenderer(createV1RoleRegistry())
    const { engine, players } = createBoardEngine(sixPlayerBoard)
    const firstWolf = players[0]!
    const secondWolf = players[1]!
    const villager = players[2]!
    const wolfFoundation = await renderer.foundation(
      engine.state,
      sixPlayerBoard,
      firstWolf.id,
      engine.events,
    )
    const teammateLine = wolfFoundation.prompt
      .split('\n')
      .find((line) => line.includes('你的狼人队友'))
    expect(teammateLine).toContain(secondWolf.name)
    expect(teammateLine).not.toContain(firstWolf.name)
    expect(wolfFoundation.visibleEvents.map((event) => event.payload.type)).toContain(
      'faction.members',
    )
    expect(wolfFoundation.prompt).not.toContain(
      formatCopy(getCopy('narration.roleAssigned'), { role: getCopy('roles.werewolf') }),
    )

    const villagerFoundation = await renderer.foundation(
      engine.state,
      sixPlayerBoard,
      villager.id,
      engine.events,
    )
    expect(villagerFoundation.prompt).not.toContain('你的狼人队友')
  })

  it('rejects a foundation whose source history does not cover its delivery cursor', async () => {
    const renderer = new ContextRenderer(createV1RoleRegistry())
    const { engine, players } = createBoardEngine(sixPlayerBoard)
    await expect(
      renderer.foundation(engine.state, sixPlayerBoard, players[0]!.id, []),
    ).rejects.toThrow(`Foundation history ends at 0, expected ${engine.state.lastSequence}`)
  })

  it('delivers private night facts only to the players who require them', async () => {
    const renderer = new ContextRenderer(createV1RoleRegistry())
    const { engine, players } = createBoardEngine(ninePlayerBoard)
    const wolves = players.filter((player) => player.roleId === 'role-werewolf')
    const witch = players.find((player) => player.roleId === 'role-witch')!
    const target = players.find((player) => player.roleId === 'role-villager')!
    const otherVillager = players.find(
      (player) => player.roleId === 'role-villager' && player.id !== target.id,
    )!
    const attack = GameEventSchema.parse({
      matchId: engine.state.matchId,
      sequence: engine.state.lastSequence + 1,
      occurredAt: '2026-08-22T00:00:00.000Z',
      visibility: { kind: 'players', playerIds: [...wolves.map((player) => player.id), witch.id] },
      payload: { type: 'night.attack-selected', targetId: target.id },
    })
    const witchTurn = await renderer.turn(engine.state, [attack], witch.id, 0, 'night-turn')
    const targetLabel = formatCopy(getCopy('narration.playerLabel'), {
      seat: target.seat,
      name: target.name,
    })
    expect(witchTurn.prompt).toContain(
      formatCopy(getCopy('narration.nightAttackSelected'), { player: targetLabel }),
    )
    const villagerTurn = await renderer.turn(
      engine.state,
      [attack],
      otherVillager.id,
      0,
      'speech-turn',
    )
    expect(villagerTurn.visibleEvents).toHaveLength(0)
    expect(villagerTurn.prompt).not.toContain(targetLabel)

    const guardSetup = createBoardEngine(guardBoard)
    const guard = guardSetup.players.find((player) => player.roleId === 'role-guard')!
    const protectedPlayer = guardSetup.players.find((player) => player.id !== guard.id)!
    const protection = GameEventSchema.parse({
      matchId: guardSetup.engine.state.matchId,
      sequence: guardSetup.engine.state.lastSequence + 1,
      occurredAt: '2026-08-22T00:00:01.000Z',
      visibility: { kind: 'players', playerIds: [guard.id] },
      payload: { type: 'guard.protected', actorId: guard.id, targetId: protectedPlayer.id },
    })
    const guardTurn = await renderer.turn(
      guardSetup.engine.state,
      [protection],
      guard.id,
      0,
      'night-turn',
    )
    expect(guardTurn.prompt).toContain(
      formatCopy(getCopy('narration.guardProtected'), {
        player: formatCopy(getCopy('narration.playerLabel'), {
          seat: protectedPlayer.seat,
          name: protectedPlayer.name,
        }),
      }),
    )
  })

  it('delivers resolved public actions as natural game narration', async () => {
    const renderer = new ContextRenderer(createV1RoleRegistry())
    const { engine, players } = createBoardEngine(sixPlayerBoard)
    const voter = players[0]!
    const target = players[2]!
    const events = [
      GameEventSchema.parse({
        matchId: engine.state.matchId,
        sequence: engine.state.lastSequence + 1,
        occurredAt: '2026-08-22T00:00:00.000Z',
        visibility: { kind: 'public' },
        payload: {
          type: 'vote.resolved',
          kind: 'exile',
          totals: { [target.id]: 2 },
          tiedPlayerIds: [target.id],
          selectedPlayerId: target.id,
        },
      }),
      GameEventSchema.parse({
        matchId: engine.state.matchId,
        sequence: engine.state.lastSequence + 2,
        occurredAt: '2026-08-22T00:00:01.000Z',
        visibility: { kind: 'public' },
        payload: { type: 'hunter.shot', playerId: voter.id, targetId: target.id },
      }),
    ]
    const turn = await renderer.turn(engine.state, events, voter.id, 0, 'speech-turn')
    expect(turn.prompt).toContain('投票结算')
    expect(turn.prompt).toContain('发动猎人技能')
  })

  it('delivers a final public role reveal as natural game narration', async () => {
    const renderer = new ContextRenderer(createV1RoleRegistry())
    const { engine, players } = createBoardEngine(sixPlayerBoard)
    const viewer = players[0]!
    const revealed = players[2]!
    const event = GameEventSchema.parse({
      matchId: engine.state.matchId,
      sequence: engine.state.lastSequence + 1,
      occurredAt: '2026-08-22T00:00:00.000Z',
      visibility: { kind: 'public' },
      payload: { type: 'role.revealed', playerId: revealed.id, roleId: revealed.roleId },
    })
    const turn = await renderer.turn(engine.state, [event], viewer.id, 0, 'speech-turn')
    const player = formatCopy(getCopy('narration.playerLabel'), {
      seat: revealed.seat,
      name: revealed.name,
    })
    expect(turn.prompt).toContain(
      formatCopy(getCopy('narration.roleRevealed'), {
        player,
        role: getCopy('roles.villager'),
      }),
    )
  })
})

async function foundationPrompt(renderer: ContextRenderer, board: BoardManifest): Promise<string> {
  const { engine, players } = createBoardEngine(board)
  return (await renderer.foundation(engine.state, board, players[0]!.id, engine.events)).prompt
}

function createBoardEngine(board: BoardManifest): {
  readonly engine: GameEngine
  readonly players: EnginePlayerInput[]
} {
  const roles = board.roles.flatMap(({ roleId, count }) =>
    Array.from({ length: count }, () => roleId),
  )
  const players: EnginePlayerInput[] = roles.map((roleId, index) => ({
    id: PlayerIdSchema.parse(`player-${index + 1}`),
    seat: index + 1,
    name: `Foundation player ${index + 1}`,
    profileId: AgentProfileIdSchema.parse(`profile-foundation-${index + 1}`),
    roleId,
  }))
  return {
    engine: GameEngine.create({
      matchId: MatchIdSchema.parse(`match-foundation-${board.playerCount}`),
      board,
      players,
      roleAssignment: 'manual',
      seed: 1,
    }),
    players,
  }
}
