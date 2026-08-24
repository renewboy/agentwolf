import {
  AgentProfileIdSchema,
  CharacterCardSnapshotSchema,
  GameEventSchema,
  MatchIdSchema,
  PhaseIdSchema,
  PlayerIdSchema,
} from '@agentwolf/contracts'
import { builtInCharacterCards, formatCopy, getCopy } from '@agentwolf/assets'
import {
  GameEngine,
  createV1RoleRegistry,
  guardBoard,
  ninePlayerBoard,
  sixPlayerBoard,
  v1AbilityIds,
  type BoardManifest,
  type EnginePlayerInput,
} from '@agentwolf/game-engine'
import { describe, expect, it } from 'vitest'
import { ContextRenderer, promptContractVersion } from '../src/context-renderer.js'

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
    expect(ninePlayerPrompt).toContain(getCopy('promptContext.sheriffEnabledSpeechOrder'))
    expect(ninePlayerPrompt).toContain(
      formatCopy(getCopy('promptContext.witchPotionLimit'), { count: 1 }),
    )
  })

  it('gives every player one detailed public introduction for each role on the board', async () => {
    const roles = createV1RoleRegistry()
    const renderer = new ContextRenderer(roles)
    const { engine, players } = createBoardEngine(ninePlayerBoard)
    const sections = new Set<string>()
    for (const player of players) {
      const foundation = await renderer.foundation(
        engine.state,
        ninePlayerBoard,
        player.id,
        engine.events,
      )
      const section = foundation.prompt
        .split(getCopy('promptContext.roleRulesIntro').split('{{roles}}')[0]!)[1]
        ?.split(getCopy('promptContext.villageVictory'))[0]
        ?.trim()
      expect(section).toBeTruthy()
      expect(section).not.toMatch(/player-\d+/u)
      expect(section).not.toContain('号玩家')
      sections.add(section!)
    }
    expect(sections.size).toBe(1)
    const section = [...sections][0]!
    expect(section.split('\n')).toHaveLength(ninePlayerBoard.roles.length)
    for (const slot of ninePlayerBoard.roles) {
      expect(section).toContain(getCopy(roles.role(slot.roleId).publicRulesKey).split('。')[0]!)
    }
    const guardRole = roles.list().find((role) => role.id === 'role-guard')!
    expect(section).not.toContain(getCopy(guardRole.publicRulesKey).split('。')[0]!)

    const legacy = await renderer.foundation(
      engine.state,
      ninePlayerBoard,
      players[0]!.id,
      engine.events,
      10,
    )
    expect(legacy.prompt).not.toContain('本局角色介绍')
  })

  it('states the day and complete publicly living roster in every daytime prompt', async () => {
    const renderer = new ContextRenderer(createV1RoleRegistry())
    const { engine, players } = createBoardEngine(sixPlayerBoard)
    const dead = players[5]!
    const deadState = engine.state.players.get(dead.id)!
    const dayStarted = GameEventSchema.parse({
      matchId: engine.state.matchId,
      sequence: engine.state.lastSequence + 1,
      occurredAt: '2026-08-23T00:00:00.000Z',
      visibility: { kind: 'public' },
      payload: { type: 'day.started', day: 2 },
    })
    const state = {
      ...engine.state,
      day: 2,
      phaseId: PhaseIdSchema.parse('phase-day-speech'),
      phaseLabelKey: 'phases.daySpeech',
      lastSequence: dayStarted.sequence,
      players: new Map(engine.state.players).set(dead.id, { ...deadState, alive: false }),
    }
    for (const promptAsset of [
      'speech-turn',
      'vote-turn',
      'sheriff-turn',
      'sheriff-transfer-turn',
      'speech-order-turn',
      'skill-turn',
    ] as const) {
      const turn = await renderer.turn(state, [dayStarted], players[0]!.id, 0, promptAsset)
      expect(turn.prompt.match(/当前是第 2 天/gu)).toHaveLength(1)
      expect(turn.prompt).not.toContain('天亮了，现在是第 2 天')
      for (const living of players.filter((player) => player.id !== dead.id)) {
        expect(turn.prompt).toContain(
          formatCopy(getCopy('promptContext.rosterEntry'), {
            name: living.name,
            playerId: living.id,
            seat: living.seat,
          }),
        )
      }
      expect(turn.prompt).not.toContain(
        formatCopy(getCopy('promptContext.rosterEntry'), {
          name: dead.name,
          playerId: dead.id,
          seat: dead.seat,
        }),
      )
    }

    const campaign = await renderer.turn(
      {
        ...state,
        phaseId: PhaseIdSchema.parse('phase-sheriff-signup'),
        phaseLabelKey: 'phases.sheriffSignup',
        players: engine.state.players,
        pendingDeaths: new Map([[dead.id, { playerId: dead.id, causes: ['werewolf'] }]]),
      },
      [dayStarted],
      players[0]!.id,
      0,
      'sheriff-turn',
    )
    expect(campaign.prompt).toContain(
      formatCopy(getCopy('promptContext.rosterEntry'), {
        name: dead.name,
        playerId: dead.id,
        seat: dead.seat,
      }),
    )
    expect(campaign.prompt).not.toContain('昨夜死亡')

    const legacy = await renderer.turn(state, [dayStarted], players[0]!.id, 0, 'vote-turn', '', 13)
    expect(legacy.prompt).not.toContain('当前公开存活玩家')
    expect(legacy.prompt).toContain('天亮了，现在是第 2 天')

    const replacement = await renderer.foundation(state, sixPlayerBoard, players[0]!.id, [
      ...engine.events,
      dayStarted,
    ])
    expect(replacement.prompt.match(/当前是第 2 天/gu)).toHaveLength(1)
    expect(replacement.prompt).toContain('当前公开存活玩家')
    expect(replacement.prompt).not.toContain('天亮了，现在是第 2 天')

    const continuation = await renderer.turn(
      state,
      [dayStarted],
      players[0]!.id,
      dayStarted.sequence,
      'speech-turn',
      '本轮发言请尽量控制在 300 字以内。',
      promptContractVersion,
      true,
    )
    expect(continuation.continuation).toBe(true)
    expect(continuation.visibleEvents).toEqual([])
    expect(continuation.prompt).toContain('继续执行裁判当前阶段')
    expect(continuation.prompt).toContain('现在轮到你发言')
    expect(continuation.prompt).not.toContain('# 任务目标')
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
    expect(wolfFoundation.prompt).not.toContain(v1AbilityIds.werewolfKill)
    expect(wolfFoundation.prompt).toContain(v1AbilityIds.werewolfSelfDestruct)
    const legacyWolfFoundation = await renderer.foundation(
      engine.state,
      sixPlayerBoard,
      firstWolf.id,
      engine.events,
      11,
    )
    expect(legacyWolfFoundation.prompt).toContain(v1AbilityIds.werewolfKill)

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

  it('delivers the regular wolf target only to wolves and a Witch with an antidote', async () => {
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

  it('does not send a player their own already-known speech again', async () => {
    const renderer = new ContextRenderer(createV1RoleRegistry())
    const { engine, players } = createBoardEngine(sixPlayerBoard)
    const viewer = players[0]!
    const other = players[1]!
    const events = [
      GameEventSchema.parse({
        matchId: engine.state.matchId,
        sequence: engine.state.lastSequence + 1,
        occurredAt: '2026-08-22T00:00:00.000Z',
        visibility: { kind: 'public' },
        payload: {
          type: 'speech.committed',
          playerId: viewer.id,
          kind: 'day',
          text: '自己的已知发言。',
          sanitized: false,
        },
      }),
      GameEventSchema.parse({
        matchId: engine.state.matchId,
        sequence: engine.state.lastSequence + 2,
        occurredAt: '2026-08-22T00:00:01.000Z',
        visibility: { kind: 'public' },
        payload: {
          type: 'speech.committed',
          playerId: other.id,
          kind: 'day',
          text: '其他玩家的发言。',
          sanitized: false,
        },
      }),
    ]
    const current = await renderer.turn(engine.state, events, viewer.id, 0, 'vote-turn')
    expect(current.prompt).not.toContain('自己的已知发言。')
    expect(current.prompt).toContain('其他玩家的发言。')
    expect(current.visibleEvents).toHaveLength(2)

    const legacy = await renderer.turn(engine.state, events, viewer.id, 0, 'vote-turn', '', 9)
    expect(legacy.prompt).toContain('自己的已知发言。')
  })

  it('injects versioned speech constraints while preserving legacy prompt reconstruction', async () => {
    const renderer = new ContextRenderer(createV1RoleRegistry())
    const { engine, players } = createBoardEngine(sixPlayerBoard)
    const instruction = 'VERSIONED_SPEECH_CONSTRAINT'
    const current = await renderer.turn(
      engine.state,
      engine.events,
      players[0]!.id,
      0,
      'speech-turn',
      instruction,
    )
    expect(promptContractVersion).toBeGreaterThanOrEqual(17)
    expect(current.prompt).toContain(instruction)

    const legacy = await renderer.turn(
      engine.state,
      engine.events,
      players[0]!.id,
      0,
      'speech-turn',
      instruction,
      7,
    )
    expect(legacy.prompt).not.toContain(instruction)

    for (const promptAsset of ['sheriff-turn', 'vote-turn'] as const) {
      const currentStructured = await renderer.turn(
        engine.state,
        engine.events,
        players[0]!.id,
        0,
        promptAsset,
        instruction,
      )
      expect(currentStructured.prompt).toContain(instruction)
      const legacyStructured = await renderer.turn(
        engine.state,
        engine.events,
        players[0]!.id,
        0,
        promptAsset,
        instruction,
        8,
      )
      expect(legacyStructured.prompt).not.toContain(instruction)
    }

    const currentWolfVote = await renderer.turn(
      engine.state,
      engine.events,
      players[0]!.id,
      0,
      'wolf-vote-turn',
      instruction,
    )
    expect(currentWolfVote.prompt).toContain(instruction)
    expect(currentWolfVote.prompt).toContain('选择空刀')
    expect(currentWolfVote.prompt).toContain('`null`')
    const versionSixteenWolfVote = await renderer.turn(
      engine.state,
      engine.events,
      players[0]!.id,
      0,
      'wolf-vote-turn',
      instruction,
      16,
    )
    expect(versionSixteenWolfVote.prompt).toContain('必须使用一名非狼人玩家')
    expect(versionSixteenWolfVote.prompt).not.toContain('选择空刀')
    const legacyWolfVote = await renderer.turn(
      engine.state,
      engine.events,
      players[0]!.id,
      0,
      'wolf-vote-turn',
      instruction,
      12,
    )
    expect(legacyWolfVote.prompt).not.toContain(instruction)
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

  it('adds only the acting player Character while preserving full game intelligence', async () => {
    const renderer = new ContextRenderer(createV1RoleRegistry())
    const { engine, players } = createBoardEngine(sixPlayerBoard)
    const ran = CharacterCardSnapshotSchema.parse(
      builtInCharacterCards.find((character) => character.id === 'character-mouri-ran'),
    )
    const prompt = (
      await renderer.foundation(
        engine.state,
        sixPlayerBoard,
        players[0]!.id,
        engine.events,
        promptContractVersion,
        ran,
      )
    ).prompt
    expect(prompt).toContain(ran.name)
    expect(prompt).toContain(players[0]!.name)
    expect(prompt).toContain('完整推理能力')
    expect(prompt).toContain('不得为了符合角色形象而故意漏判')
    expect(prompt).not.toContain('远山和叶')

    const withoutCharacter = await renderer.foundation(
      engine.state,
      sixPlayerBoard,
      players[0]!.id,
      engine.events,
    )
    expect(withoutCharacter.prompt).not.toContain('## 扮演角色')
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
