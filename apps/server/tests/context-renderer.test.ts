import {
  AgentProfileIdSchema,
  CharacterCardSnapshotSchema,
  GameEventSchema,
  MatchIdSchema,
  PhaseIdSchema,
  PlayerIdSchema,
  RoleCardIdSchema,
  RoleIdSchema,
} from '@agentwolf/contracts'
import { builtInCharacterCards } from '@agentwolf/assets'
import {
  GameEngine,
  createClassicRuleset,
  cupidAbilityIds,
  cupidBoard,
  guardBoard,
  mirrorHiddenBoard,
  ninePlayerBoard,
  sixPlayerBoard,
  thiefAbilityIds,
  thiefCupidBoard,
  v1AbilityIds,
  whiteWolfKingBoard,
  type BoardManifest,
  type EnginePlayerInput,
  type GameState,
  type TurnDescriptor,
} from '@agentwolf/game-engine'
import { describe, expect, it } from 'vitest'
import { ContextRenderer } from '../src/context-renderer.js'

describe('plugin-owned Prompt rendering', () => {
  it('renders private Thief choices and refreshes the selected Role owner contract', async () => {
    const ruleset = createClassicRuleset()
    const roleIds = [
      'role-werewolf',
      'role-werewolf',
      'role-villager',
      'role-villager',
      'role-villager',
      'role-villager',
      'role-seer',
      'role-witch',
      'role-hunter',
      'role-idiot',
      'role-cupid',
      'role-thief',
    ].map((roleId) => RoleIdSchema.parse(roleId))
    const players: EnginePlayerInput[] = roleIds.map((roleId, index) => ({
      id: PlayerIdSchema.parse(`player-${index + 1}`),
      seat: index + 1,
      name: `Thief prompt ${index + 1}`,
      profileId: AgentProfileIdSchema.parse(`profile-thief-prompt-${index + 1}`),
      roleId,
    }))
    const engine = GameEngine.create({
      matchId: MatchIdSchema.parse('match-thief-prompt'),
      board: thiefCupidBoard,
      players,
      roleAssignment: 'manual',
      manualReserveRoleIds: [
        RoleIdSchema.parse('role-werewolf'),
        RoleIdSchema.parse('role-villager'),
      ],
      seed: 1,
      ruleset,
    })
    const renderer = new ContextRenderer(ruleset)
    const thief = players.find((player) => player.roleId === 'role-thief')!
    const unrelated = players.find((player) => player.roleId === 'role-seer')!
    const foundation = await renderer.foundation(
      engine.state,
      thiefCupidBoard,
      thief.id,
      engine.events,
    )
    expect(foundation.prompt).toContain('你的初始身份是盗贼')
    expect(foundation.prompt).toContain('身份牌池共 14 张，发给 12 个席位，留下 2 张底牌')
    expect(foundation.prompt).toContain('盗贼选牌（仅首夜） → 丘比特连线（仅首夜）')

    engine.start()
    const turn = engine.currentTurn()
    if (!turn) throw new Error('Expected Thief turn')
    const choices = engine.roleCardChoicesFor(thief.id)
    const turnPrompt = await renderer.turn(
      engine.state,
      thiefCupidBoard,
      engine.events,
      thief.id,
      0,
      turn,
      300,
      false,
      choices,
    )
    expect(turnPrompt.prompt).toContain('`role-card-r01`：狼人')
    expect(turnPrompt.prompt).toContain('`role-card-r02`：村民（本轮不可选')
    expect(turnPrompt.prompt).not.toContain(thiefAbilityIds.chooseCard)

    const beforeChoice = engine.state.lastSequence
    engine.submit({
      type: 'night-action',
      matchId: engine.state.matchId,
      actorId: thief.id,
      abilityId: thiefAbilityIds.chooseCard,
      targetIds: [],
      roleCardId: RoleCardIdSchema.parse('role-card-r01'),
    })
    const selectedRolePrompt = await renderer.turn(
      engine.state,
      thiefCupidBoard,
      engine.events,
      thief.id,
      beforeChoice,
      daySpeechTurn(thief.id),
      300,
    )
    expect(selectedRolePrompt.prompt).toContain('你的最终身份是狼人')
    expect(selectedRolePrompt.prompt).toContain('你的身份是狼人，属于狼人阵营')
    expect(selectedRolePrompt.prompt).toContain('你的存活狼队友')
    expect(selectedRolePrompt.prompt).toContain('村民成为未入场底牌')
    const unrelatedPrompt = await renderer.turn(
      engine.state,
      thiefCupidBoard,
      engine.events,
      unrelated.id,
      beforeChoice,
      daySpeechTurn(unrelated.id),
      300,
    )
    expect(unrelatedPrompt.prompt).not.toContain('未入场底牌')
    expect(unrelatedPrompt.prompt).not.toContain('原为盗贼')
  })

  it('renders Cupid as a mandatory private first-night contract without leaking lover roles', async () => {
    const setup = createBoardEngine(cupidBoard)
    const cupid = setup.players.find((player) => player.roleId === 'role-cupid')!
    const wolf = setup.players.find((player) => player.roleId === 'role-werewolf')!
    const villager = setup.players.find((player) => player.roleId === 'role-villager')!
    const unrelated = setup.players.find(
      (player) => player.id !== cupid.id && player.id !== wolf.id && player.id !== villager.id,
    )!
    const foundation = await setup.renderer.foundation(
      setup.engine.state,
      cupidBoard,
      cupid.id,
      setup.engine.events,
    )
    expect(foundation.prompt).toContain('你的身份是丘比特')
    expect(foundation.prompt).toContain('属于第三方阵营')
    expect(foundation.prompt).toContain('丘比特是第三方阵营角色')
    expect(foundation.prompt).not.toContain('丘比特是第三方角色')
    expect(foundation.prompt).not.toContain('具体 Role')
    expect(foundation.prompt).toContain('夜间形成的情侣死亡在天亮合并到死亡名单中')
    expect(foundation.prompt).toContain('白天放逐先宣布被放逐者出局，再立即宣布另一方殉情')
    expect(foundation.prompt).toContain('两人继承同一死亡时点和遗言资格')
    expect(foundation.prompt).toContain(
      '夜间行动顺序（仅执行本夜可用的行动）：丘比特连线（仅首夜） → 狼队商议 → 狼队袭击投票 → 女巫行动 → 预言家行动。',
    )

    setup.engine.start()
    const turn = setup.engine.currentTurn()
    if (!turn) throw new Error('Expected Cupid turn')
    const turnPrompt = await setup.renderer.turn(
      setup.engine.state,
      cupidBoard,
      setup.engine.events,
      cupid.id,
      0,
      turn,
      300,
    )
    expect(turn.passAllowed).toBe(false)
    expect(turnPrompt.prompt).not.toContain(cupidAbilityIds.link)
    expect(turnPrompt.prompt).toContain('现在必须使用爱之箭')
    expect(turnPrompt.prompt).toContain('本阶段不能放弃')

    setup.engine.submit({
      type: 'night-action',
      matchId: setup.engine.state.matchId,
      actorId: cupid.id,
      abilityId: cupidAbilityIds.link,
      targetIds: [wolf.id, villager.id],
    })
    const linkEvent = setup.engine.events.find(
      (event) =>
        event.payload.type === 'plugin.event' && event.payload.eventType === 'event-cupid-linked',
    )!
    const renderFor = (playerId: typeof cupid.id) =>
      setup.renderer.turn(
        setup.engine.state,
        cupidBoard,
        setup.engine.events,
        playerId,
        linkEvent.sequence - 1,
        daySpeechTurn(playerId),
        300,
      )
    const wolfPrompt = (await renderFor(wolf.id)).prompt
    expect(wolfPrompt).toContain(`你与${villager.seat} 号玩家`)
    expect(wolfPrompt).toContain('不知道对方的具体身份')
    expect(wolfPrompt).not.toContain('具体 Role')
    expect(wolfPrompt).not.toContain(`你的情侣是${villager.seat} 号玩家（村民）`)
    const cupidPrompt = (await renderFor(cupid.id)).prompt
    expect(cupidPrompt).toContain(`你连接的情侣是${wolf.seat} 号玩家`)
    expect(cupidPrompt).toContain('你不知道他们的具体身份')
    expect(cupidPrompt).not.toContain(`${wolf.seat} 号玩家（狼人）`)
    expect(cupidPrompt).not.toContain(`${villager.seat} 号玩家（村民）`)
    expect((await renderFor(unrelated.id)).prompt).not.toContain('成为情侣')

    const linkedDeath = GameEventSchema.parse({
      matchId: setup.engine.state.matchId,
      sequence: setup.engine.state.lastSequence + 1,
      occurredAt: '2026-08-30T00:00:00.000Z',
      visibility: { kind: 'public' },
      payload: {
        type: 'plugin.event',
        pluginId: 'plugin-role-cupid',
        eventType: 'event-cupid-linked-death',
        schemaVersion: 2,
        data: {
          sourceId: wolf.id,
          targetId: villager.id,
          timing: 'day',
          presentation: 'partner-only',
        },
      },
    })
    const linkedDeathPrompt = await setup.renderer.turn(
      withEvent(setup.engine.state, linkedDeath),
      cupidBoard,
      [...setup.engine.events, linkedDeath],
      unrelated.id,
      linkedDeath.sequence - 1,
      daySpeechTurn(unrelated.id),
      300,
    )
    expect(linkedDeathPrompt.prompt).toContain(`${villager.seat} 号玩家因情侣关系殉情。`)
    expect(linkedDeathPrompt.prompt).not.toContain('出局，')

    const reveal = GameEventSchema.parse({
      matchId: setup.engine.state.matchId,
      sequence: linkedDeath.sequence + 1,
      occurredAt: '2026-08-30T00:00:01.000Z',
      visibility: { kind: 'public' },
      payload: {
        type: 'public.announcement',
        code: 'cupid-lovers-revealed',
        playerIds: [wolf.id, villager.id],
        params: {},
      },
    })
    const revealedPrompt = await setup.renderer.turn(
      withEvent(setup.engine.state, reveal),
      cupidBoard,
      [...setup.engine.events, linkedDeath, reveal],
      unrelated.id,
      reveal.sequence - 1,
      daySpeechTurn(unrelated.id),
      300,
    )
    expect(revealedPrompt.prompt).toContain(
      `最终情侣关系：${wolf.seat} 号玩家、${villager.seat} 号玩家。`,
    )
  })

  it('derives every board night action order from the installed phase graph', async () => {
    const cases = [
      {
        board: sixPlayerBoard,
        order: '狼队商议 → 狼队袭击投票 → 预言家行动',
      },
      {
        board: guardBoard,
        order: '守卫行动 → 狼队商议 → 狼队袭击投票 → 女巫行动 → 预言家行动',
      },
      {
        board: cupidBoard,
        order: '丘比特连线（仅首夜） → 狼队商议 → 狼队袭击投票 → 女巫行动 → 预言家行动',
      },
      {
        board: mirrorHiddenBoard,
        order:
          '守卫行动 → 狼队商议 → 狼队袭击投票 → 觉醒隐狼行动 → 女巫行动 → 魔镜少女行动 → 觉醒隐狼复制技能 → 觉醒隐狼学习',
      },
    ] as const

    for (const { board, order } of cases) {
      const setup = createBoardEngine(board)
      const prompt = (
        await setup.renderer.foundation(
          setup.engine.state,
          board,
          setup.players[0]!.id,
          setup.engine.events,
        )
      ).prompt
      expect(prompt).toContain(`夜间行动顺序（仅执行本夜可用的行动）：${order}。`)
    }
  })

  it('omits phase transitions while retaining the current action contract', async () => {
    const setup = createBoardEngine(guardBoard)
    setup.engine.start()
    const turn = setup.engine.currentTurn()
    const actorId = setup.engine.expectedActors()[0]
    if (!turn || !actorId) throw new Error('Expected the first private night turn')

    const rendered = await setup.renderer.turn(
      setup.engine.state,
      guardBoard,
      setup.engine.events,
      actorId,
      0,
      turn,
      300,
    )

    expect(rendered.prompt).not.toContain('阶段切换为')
    expect(rendered.prompt).not.toContain('守卫行动')
    expect(rendered.prompt).toContain('请选择需要守护的目标，或空守')
    expect(rendered.prompt).toContain('请调用 `submit_night_action` 提交本轮唯一一次行动')
    expect(rendered.prompt).toContain('不要输出发言')
    expect(rendered.prompt).not.toMatch(/abilityId|targetPlayerIds|option:/u)
    expect(setup.renderer.abilityContracts([v1AbilityIds.guardProtect])).toEqual([
      {
        abilityId: v1AbilityIds.guardProtect,
        label: '守护',
        description: '每夜守护一名存活玩家，可以选择自己；不能连续两晚守护同一名玩家，也可以空守。',
      },
    ])
    expect(setup.engine.state.phaseLabelKey).toBe('phases.nightGuard')
  })

  it('tells pack Werewolves that self and teammate attacks are legal', async () => {
    const setup = createBoardEngine(sixPlayerBoard)
    setup.engine.start()
    while (setup.engine.state.phaseId === 'phase-night-wolf-council') {
      const actorId = setup.engine.activeActor()
      if (!actorId) throw new Error('Expected a wolf council actor')
      setup.engine.submit({
        type: 'speech',
        matchId: setup.engine.state.matchId,
        actorId,
        kind: 'wolf-council',
        text: '讨论自刀安排。',
      })
    }
    const turn = setup.engine.currentTurn()
    const actorId = setup.engine.expectedActors()[0]
    if (!turn || !actorId) throw new Error('Expected a wolf vote turn')

    const rendered = await setup.renderer.turn(
      setup.engine.state,
      sixPlayerBoard,
      setup.engine.events,
      actorId,
      0,
      turn,
      300,
    )

    expect(rendered.prompt).toContain('包括自己或狼队友')
    expect(rendered.prompt).not.toContain('非狼人玩家')
  })

  it('renders canonical Mirror Hidden rules without leaking pack knowledge or strategy aliases', async () => {
    const setup = createBoardEngine(mirrorHiddenBoard)
    const hiddenWolf = setup.players.find(
      (player) => player.roleId === 'role-awakened-hidden-wolf',
    )!
    const wolves = setup.players.filter((player) => player.roleId === 'role-werewolf')
    const hiddenPrompt = (
      await setup.renderer.foundation(
        setup.engine.state,
        mirrorHiddenBoard,
        hiddenWolf.id,
        setup.engine.events,
      )
    ).prompt

    expect(hiddenPrompt).toContain(
      '身份牌池共 10 张，发给 10 个席位，留下 0 张底牌：狼人 2 张、觉醒隐狼 1 张、村民 4 张、魔镜少女 1 张、女巫 1 张、守卫 1 张。',
    )
    expect(hiddenPrompt).toContain('你的身份是觉醒隐狼')
    expect(hiddenPrompt).not.toContain('机械狼')
    expect(hiddenPrompt).not.toContain('通灵师')
    expect(hiddenPrompt).not.toContain('你的狼人队友是')
    for (const wolf of wolves) expect(hiddenPrompt).not.toContain(`你的狼人队友是：${wolf.name}`)

    const wolfPrompt = (
      await setup.renderer.foundation(
        setup.engine.state,
        mirrorHiddenBoard,
        wolves[0]!.id,
        setup.engine.events,
      )
    ).prompt
    expect(wolfPrompt).toContain(`你的存活狼队友：${wolves[1]!.seat} 号玩家`)
    expect(wolfPrompt).not.toContain(`你的存活狼队友：${hiddenWolf.seat} 号玩家`)
  })

  it('identifies the White Wolf King inside private pack knowledge', async () => {
    const setup = createBoardEngine(whiteWolfKingBoard)
    const wolves = setup.players.filter((player) => player.roleId === 'role-werewolf')
    const whiteWolfKing = setup.players.find((player) => player.roleId === 'role-white-wolf-king')!

    for (const viewer of [...wolves, whiteWolfKing]) {
      const prompt = (
        await setup.renderer.foundation(
          setup.engine.state,
          whiteWolfKingBoard,
          viewer.id,
          setup.engine.events,
        )
      ).prompt
      const teammateLine = prompt.split('\n').find((line) => line.includes('你的存活狼队友'))
      expect(teammateLine).toBeDefined()
      expect(teammateLine).not.toContain(viewer.name)
      expect(teammateLine).not.toContain(viewer.id)
      if (viewer.id !== whiteWolfKing.id) {
        expect(teammateLine).toContain(`${whiteWolfKing.seat} 号玩家（白狼王）`)
      } else {
        expect(teammateLine).not.toContain('（白狼王）')
      }
      for (const wolf of wolves.filter((player) => player.id !== viewer.id)) {
        expect(teammateLine).toContain(`${wolf.seat} 号玩家（狼人）`)
      }
    }
  })

  it('renders current board policy and exactly the installed board roles', async () => {
    const six = createBoardEngine(sixPlayerBoard)
    const sixPrompt = (
      await six.renderer.foundation(
        six.engine.state,
        sixPlayerBoard,
        six.players[0]!.id,
        six.engine.events,
      )
    ).prompt
    expect(sixPrompt).toContain(
      '身份牌池共 6 张，发给 6 个席位，留下 0 张底牌：狼人 2 张、村民 2 张、预言家 1 张、猎人 1 张。',
    )
    expect(sixPrompt).toContain('屠城是指狼人阵营让所有好人（所有平民和神职）出局')
    expect(sixPrompt).toContain('屠边是指狼人阵营让所有平民或所有神职出局')
    expect(sixPrompt).toContain('本局采用屠城规则')
    expect(sixPrompt).toContain('本局不设警长竞选与警徽')
    expect(sixPrompt).not.toContain('女巫（好人阵营）')

    const rosterHeading = sixPrompt.indexOf('# 座位名单')
    const identityHeading = sixPrompt.indexOf('# 当前身份')
    expect(rosterHeading).toBeGreaterThan(-1)
    expect(identityHeading).toBeGreaterThan(rosterHeading)
    const rosterSection = sixPrompt.slice(rosterHeading, identityHeading)
    for (const player of six.players) {
      expect(rosterSection).toContain(
        `${player.name}（${player.seat} 号玩家，Player ID：${player.id}）`,
      )
    }
    const identitySection = sixPrompt.slice(identityHeading, sixPrompt.indexOf('# 板子规则'))
    expect(identitySection).toContain(
      `你是${six.players[0]!.name}（${six.players[0]!.seat} 号玩家，Player ID：${six.players[0]!.id}）`,
    )

    const nine = createBoardEngine(ninePlayerBoard)
    const sections = new Set<string>()
    for (const player of nine.players) {
      const prompt = (
        await nine.renderer.foundation(
          nine.engine.state,
          ninePlayerBoard,
          player.id,
          nine.engine.events,
        )
      ).prompt
      const section = prompt.split('本局角色介绍：')[1]!.split('好人阵营需要')[0]!.trim()
      expect(section).not.toMatch(/player-\d+/u)
      expect(section.match(/^- /gmu)).toHaveLength(ninePlayerBoard.roles.length)
      expect(prompt).toContain('本局采用屠边规则')
      sections.add(section)
    }
    expect(sections.size).toBe(1)
    const roleRules = [...sections][0]!
    for (const label of ['狼人', '村民', '预言家', '女巫', '猎人']) {
      expect(roleRules).toContain(`- ${label}`)
    }
    expect(roleRules).toContain('每夜最多使用 1 瓶药')
    expect(roleRules).not.toContain('守卫（好人阵营）')
  })

  it('gives a Werewolf only its teammates and callable public interrupt', async () => {
    const setup = createBoardEngine(sixPlayerBoard)
    const [firstWolf, secondWolf] = setup.players.filter(
      (player) => player.roleId === 'role-werewolf',
    )
    const villager = setup.players.find((player) => player.roleId === 'role-villager')!
    const wolfFoundation = await setup.renderer.foundation(
      setup.engine.state,
      sixPlayerBoard,
      firstWolf!.id,
      setup.engine.events,
    )
    expect(wolfFoundation.prompt).toContain(`你的存活狼队友：${secondWolf!.seat} 号玩家`)
    expect(wolfFoundation.prompt).not.toContain(`存活狼队友：${firstWolf!.seat} 号玩家`)
    expect(wolfFoundation.prompt).not.toContain(v1AbilityIds.werewolfKill)
    expect(wolfFoundation.prompt).not.toContain(v1AbilityIds.werewolfSelfDestruct)
    expect(wolfFoundation.visibleEvents.map((event) => event.payload.type)).toContain(
      'faction.members',
    )

    const speechTurn = await setup.renderer.turn(
      {
        ...setup.engine.state,
        status: 'running',
        phaseId: PhaseIdSchema.parse('phase-day-speech'),
      },
      sixPlayerBoard,
      setup.engine.events,
      firstWolf!.id,
      setup.engine.state.lastSequence,
      {
        ...daySpeechTurn(firstWolf!.id),
        interruptAbilityIds: [v1AbilityIds.werewolfSelfDestruct],
      },
      300,
    )
    expect(speechTurn.prompt).toContain('若选择立即自爆，请调用 `trigger_skill`')
    expect(speechTurn.prompt).not.toMatch(/targetPlayerId|abilityId|option:/u)

    const villagerFoundation = await setup.renderer.foundation(
      setup.engine.state,
      sixPlayerBoard,
      villager.id,
      setup.engine.events,
    )
    expect(villagerFoundation.prompt).not.toContain('你的存活狼队友：')
  })

  it('renders a listener interrupt as an incremental decision over newly committed speech', async () => {
    const setup = createBoardEngine(sixPlayerBoard)
    const wolf = setup.players.find((player) => player.roleId === 'role-werewolf')!
    const speaker = setup.players.find((player) => player.roleId === 'role-villager')!
    const speech = GameEventSchema.parse({
      matchId: setup.engine.state.matchId,
      sequence: setup.engine.state.lastSequence + 1,
      occurredAt: '2026-08-30T00:00:00.000Z',
      visibility: { kind: 'public' },
      payload: {
        type: 'speech.committed',
        playerId: speaker.id,
        kind: 'day',
        text: '这是本次新增的公开发言。',
        sanitized: false,
      },
    })
    const state: GameState = {
      ...withEvent(setup.engine.state, speech),
      status: 'running',
      phaseId: PhaseIdSchema.parse('phase-day-speech'),
    }
    const rendered = await setup.renderer.interruptTurn(
      state,
      sixPlayerBoard,
      [speech],
      wolf.id,
      speech.sequence - 1,
      daySpeechTurn(speaker.id),
      [v1AbilityIds.werewolfSelfDestruct],
      300,
    )

    expect(rendered.prompt).toContain('这是本次新增的公开发言。')
    expect(rendered.prompt).toContain('你正在旁听公开发言')
    expect(rendered.prompt).toContain('请选择立即自爆，或继续旁听')
    expect(rendered.prompt).toContain('调用 `trigger_skill` 发动技能')
    expect(rendered.prompt).toContain('调用 `pass_skill` 明确放弃')
    expect(rendered.prompt).toContain('不要输出发言')
    expect(rendered.prompt).not.toContain(v1AbilityIds.werewolfSelfDestruct)
    expect(rendered.prompt).not.toMatch(/targetPlayerId|abilityId|option: pass/u)
    expect(rendered.prompt).not.toContain('当前公开存活玩家')
    expect(rendered.prompt.indexOf('请决定是否发动')).toBeLessThan(
      rendered.prompt.indexOf('这是本次新增的公开发言。'),
    )
    expect(rendered.prompt).not.toContain('现在轮到你发言')
    expect(rendered.prompt).not.toContain('# 任务目标')
  })

  it('requires a foundation source history that covers the delivery cursor', async () => {
    const setup = createBoardEngine(sixPlayerBoard)
    await expect(
      setup.renderer.foundation(setup.engine.state, sixPlayerBoard, setup.players[0]!.id, []),
    ).rejects.toThrow(`Foundation history ends at 0, expected ${setup.engine.state.lastSequence}`)
  })

  it('renders antidote and poison legality independently without a condition-string tree', async () => {
    const setup = createBoardEngine(ninePlayerBoard)
    const witch = setup.players.find((player) => player.roleId === 'role-witch')!
    const target = setup.players.find((player) => player.roleId === 'role-villager')!
    const wolves = setup.players.filter((player) => player.roleId === 'role-werewolf')
    const attack = GameEventSchema.parse({
      matchId: setup.engine.state.matchId,
      sequence: setup.engine.state.lastSequence + 1,
      occurredAt: '2026-08-25T00:00:00.000Z',
      visibility: { kind: 'players', playerIds: [...wolves.map((player) => player.id), witch.id] },
      payload: { type: 'night.attack-selected', targetId: target.id },
    })
    const turn = witchTurn(witch.id)
    const available = await setup.renderer.turn(
      withEvent(setup.engine.state, attack),
      ninePlayerBoard,
      [attack],
      witch.id,
      0,
      turn,
      300,
    )
    expect(available.prompt).toContain(`解药：可用，只能以${target.seat} 号玩家`)
    expect(available.prompt).not.toContain(target.id)
    expect(available.prompt).not.toContain(target.name)
    expect(available.prompt).toContain('毒药：可用')
    expect(available.prompt).toContain('请选择使用一项当前可用药剂')
    expect(available.prompt).not.toMatch(/abilityId|targetPlayerIds|option:/u)

    const witchState = setup.engine.state.players.get(witch.id)!
    const spentPoisonState = {
      ...withEvent(setup.engine.state, attack),
      players: new Map(setup.engine.state.players).set(witch.id, {
        ...witchState,
        roleState: {
          ...witchState.roleState,
          abilityUses: { [v1AbilityIds.witchPoison]: 1 },
        },
      }),
    }
    const spentPoison = await setup.renderer.turn(
      spentPoisonState,
      ninePlayerBoard,
      [attack],
      witch.id,
      0,
      turn,
      300,
    )
    expect(spentPoison.prompt).toContain('毒药：已使用，本回合不可用')
    expect(spentPoison.prompt).toContain('解药：可用')

    const bothSpentState = {
      ...setup.engine.state,
      players: new Map(setup.engine.state.players).set(witch.id, {
        ...witchState,
        roleState: {
          ...witchState.roleState,
          abilityUses: {
            [v1AbilityIds.witchAntidote]: 1,
            [v1AbilityIds.witchPoison]: 1,
          },
        },
      }),
    }
    const bothSpent = await setup.renderer.turn(
      bothSpentState,
      ninePlayerBoard,
      [],
      witch.id,
      0,
      turn,
      300,
    )
    expect(bothSpent.prompt).toContain('解药：已使用，本回合不可用')
    expect(bothSpent.prompt).toContain('毒药：已使用，本回合不可用')
    expect(bothSpent.prompt).toContain('本回合没有可用药剂,只能放弃用药')
    expect(bothSpent.prompt).not.toContain(target.name)
  })

  it('keeps private night facts out of another player Prompt', async () => {
    const setup = createBoardEngine(ninePlayerBoard)
    const witch = setup.players.find((player) => player.roleId === 'role-witch')!
    const viewer = setup.players.find((player) => player.roleId === 'role-villager')!
    const target = setup.players.find(
      (player) => player.roleId === 'role-villager' && player.id !== viewer.id,
    )!
    const attack = GameEventSchema.parse({
      matchId: setup.engine.state.matchId,
      sequence: setup.engine.state.lastSequence + 1,
      occurredAt: '2026-08-25T00:00:00.000Z',
      visibility: { kind: 'players', playerIds: [witch.id] },
      payload: { type: 'night.attack-selected', targetId: target.id },
    })
    const prompt = await setup.renderer.turn(
      withEvent(setup.engine.state, attack),
      ninePlayerBoard,
      [attack],
      viewer.id,
      0,
      daySpeechTurn(viewer.id),
      300,
    )
    expect(prompt.visibleEvents).toEqual([])
    expect(prompt.prompt).not.toContain(`狼队常规袭击目标是${target.seat} 号玩家`)
  })

  it('states current daytime facts once and omits the viewer own prior speech', async () => {
    const setup = createBoardEngine(sixPlayerBoard)
    const viewer = setup.players[0]!
    const other = setup.players[1]!
    const dead = setup.players.at(-1)!
    const dayStarted = GameEventSchema.parse({
      matchId: setup.engine.state.matchId,
      sequence: setup.engine.state.lastSequence + 1,
      occurredAt: '2026-08-25T00:00:00.000Z',
      visibility: { kind: 'public' },
      payload: { type: 'day.started', day: 2 },
    })
    const ownSpeech = GameEventSchema.parse({
      matchId: setup.engine.state.matchId,
      sequence: dayStarted.sequence + 1,
      occurredAt: '2026-08-25T00:00:01.000Z',
      visibility: { kind: 'public' },
      payload: {
        type: 'speech.committed',
        playerId: viewer.id,
        kind: 'day',
        text: '自己的已知发言。',
        sanitized: false,
      },
    })
    const otherSpeech = GameEventSchema.parse({
      matchId: setup.engine.state.matchId,
      sequence: ownSpeech.sequence + 1,
      occurredAt: '2026-08-25T00:00:02.000Z',
      visibility: { kind: 'public' },
      payload: {
        type: 'speech.committed',
        playerId: other.id,
        kind: 'day',
        text: '其他玩家的发言。',
        sanitized: false,
      },
    })
    const state: GameState = {
      ...setup.engine.state,
      day: 2,
      phaseId: PhaseIdSchema.parse('phase-day-vote'),
      lastSequence: otherSpeech.sequence,
      players: new Map(setup.engine.state.players).set(dead.id, {
        ...setup.engine.state.players.get(dead.id)!,
        alive: false,
      }),
    }
    const prompt = await setup.renderer.turn(
      state,
      sixPlayerBoard,
      [dayStarted, ownSpeech, otherSpeech],
      viewer.id,
      0,
      {
        phaseId: PhaseIdSchema.parse('phase-day-vote'),
        labelKey: 'phases.dayVote',
        mode: 'parallel',
        actionType: 'vote',
        actors: [viewer.id],
        voteKind: 'exile',
      },
      360,
    )
    expect(prompt.prompt.match(/当前是第 2 天/gu)).toHaveLength(1)
    expect(prompt.prompt).not.toContain(dead.name)
    expect(prompt.prompt).not.toMatch(/player-\d+/u)
    expect(prompt.prompt).not.toContain('自己的已知发言。')
    expect(prompt.prompt).toContain(
      `${other.name}（${other.seat} 号玩家）发言：其他玩家的发言。\n\n请做出本轮投票决定`,
    )
    expect(prompt.prompt.match(new RegExp(other.name, 'gu'))).toHaveLength(1)
    for (const player of setup.players.filter((candidate) => candidate.id !== other.id)) {
      expect(prompt.prompt).not.toContain(player.name)
    }
    expect(prompt.visibleEvents).toHaveLength(3)
  })

  it('uses the speaker heading and paragraph break for private wolf speech', async () => {
    const setup = createBoardEngine(sixPlayerBoard)
    const [speaker, viewer] = setup.players.filter((player) => player.roleId === 'role-werewolf')
    const speech = GameEventSchema.parse({
      matchId: setup.engine.state.matchId,
      sequence: setup.engine.state.lastSequence + 1,
      occurredAt: '2026-08-25T00:00:00.000Z',
      visibility: { kind: 'faction', faction: 'werewolf' },
      payload: {
        type: 'speech.committed',
        playerId: speaker!.id,
        kind: 'wolf-council',
        text: '私密商议内容。',
        sanitized: false,
      },
    })
    const prompt = await setup.renderer.turn(
      withEvent(setup.engine.state, speech),
      sixPlayerBoard,
      [speech],
      viewer!.id,
      0,
      {
        phaseId: PhaseIdSchema.parse('phase-night-wolf-council'),
        labelKey: 'phases.nightWolfCouncil',
        mode: 'sequential',
        actionType: 'speech',
        actors: [viewer!.id],
        speechKind: 'wolf-council',
      },
      300,
    )
    expect(prompt.prompt).toContain(
      `${speaker!.name}（${speaker!.seat} 号玩家）在狼队商议中发言：私密商议内容。\n\n现在轮到你发言`,
    )
    expect(prompt.prompt).not.toMatch(/player-\d+/u)
    expect(prompt.prompt).not.toContain(viewer!.name)
  })

  it('wraps retries as continuation and adds only the acting Character', async () => {
    const setup = createBoardEngine(guardBoard)
    const actor = setup.players[0]!
    const ran = CharacterCardSnapshotSchema.parse(
      builtInCharacterCards.find((character) => character.id === 'character-mouri-ran'),
    )
    const foundation = await setup.renderer.foundation(
      setup.engine.state,
      guardBoard,
      actor.id,
      setup.engine.events,
      ran,
    )
    expect(foundation.prompt).toContain(ran.name)
    expect(foundation.prompt).toContain(actor.name)
    expect(foundation.prompt).toContain('先使用完整推理能力')
    expect(foundation.prompt).not.toContain('远山和叶')

    const retry = await setup.renderer.turn(
      setup.engine.state,
      guardBoard,
      setup.engine.events,
      actor.id,
      setup.engine.state.lastSequence,
      daySpeechTurn(actor.id),
      300,
      true,
    )
    expect(retry.continuation).toBe(true)
    expect(retry.visibleEvents).toEqual([])
    expect(retry.prompt).toContain('继续执行裁判当前阶段')
    expect(retry.prompt).toContain('现在轮到你发言')
    expect(retry.prompt).not.toContain('# 任务目标')
  })

  it('renders every public event after a player cursor across multiple days', () => {
    const setup = createBoardEngine(sixPlayerBoard)
    const reviewer = setup.players[0]!
    const speaker = setup.players[1]!
    const eliminated = setup.players[2]!
    const baseSequence = setup.engine.state.lastSequence
    const events = [
      GameEventSchema.parse({
        matchId: setup.engine.state.matchId,
        sequence: baseSequence + 1,
        occurredAt: '2026-08-26T00:00:00.000Z',
        visibility: { kind: 'public' },
        payload: { type: 'day.started', day: 2 },
      }),
      GameEventSchema.parse({
        matchId: setup.engine.state.matchId,
        sequence: baseSequence + 2,
        occurredAt: '2026-08-26T00:00:01.000Z',
        visibility: { kind: 'public' },
        payload: {
          type: 'speech.committed',
          playerId: reviewer.id,
          kind: 'day',
          text: '评审者自己已经知道的发言。',
          sanitized: false,
        },
      }),
      GameEventSchema.parse({
        matchId: setup.engine.state.matchId,
        sequence: baseSequence + 3,
        occurredAt: '2026-08-26T00:00:02.000Z',
        visibility: { kind: 'public' },
        payload: {
          type: 'speech.committed',
          playerId: speaker.id,
          kind: 'day',
          text: '第二天评审者错过的公开发言。',
          sanitized: false,
        },
      }),
      GameEventSchema.parse({
        matchId: setup.engine.state.matchId,
        sequence: baseSequence + 4,
        occurredAt: '2026-08-26T00:00:03.000Z',
        visibility: { kind: 'public' },
        payload: { type: 'night.started', night: 3 },
      }),
      GameEventSchema.parse({
        matchId: setup.engine.state.matchId,
        sequence: baseSequence + 5,
        occurredAt: '2026-08-26T00:00:04.000Z',
        visibility: { kind: 'faction', faction: 'werewolf' },
        payload: {
          type: 'speech.committed',
          playerId: reviewer.id,
          kind: 'wolf-council',
          text: '不得进入公开补投递的狼队私密发言。',
          sanitized: false,
        },
      }),
      GameEventSchema.parse({
        matchId: setup.engine.state.matchId,
        sequence: baseSequence + 6,
        occurredAt: '2026-08-26T00:00:05.000Z',
        visibility: { kind: 'public' },
        payload: { type: 'day.started', day: 3 },
      }),
      GameEventSchema.parse({
        matchId: setup.engine.state.matchId,
        sequence: baseSequence + 7,
        occurredAt: '2026-08-26T00:00:06.000Z',
        visibility: { kind: 'public' },
        payload: {
          type: 'speech.committed',
          playerId: speaker.id,
          kind: 'day',
          text: '第三天评审者错过的公开发言。',
          sanitized: false,
        },
      }),
      GameEventSchema.parse({
        matchId: setup.engine.state.matchId,
        sequence: baseSequence + 8,
        occurredAt: '2026-08-26T00:00:07.000Z',
        visibility: { kind: 'god' },
        payload: {
          type: 'death.pending',
          playerId: eliminated.id,
          causes: ['private-test'],
          timing: 'night',
        },
      }),
      GameEventSchema.parse({
        matchId: setup.engine.state.matchId,
        sequence: baseSequence + 9,
        occurredAt: '2026-08-26T00:00:08.000Z',
        visibility: { kind: 'public' },
        payload: {
          type: 'vote.resolved',
          kind: 'exile',
          totals: { [eliminated.id]: 4, [reviewer.id]: 2 },
          tiedPlayerIds: [eliminated.id],
          selectedPlayerId: eliminated.id,
        },
      }),
      GameEventSchema.parse({
        matchId: setup.engine.state.matchId,
        sequence: baseSequence + 10,
        occurredAt: '2026-08-26T00:00:09.000Z',
        visibility: { kind: 'public' },
        payload: {
          type: 'public.announcement',
          code: 'player-eliminated',
          playerIds: [eliminated.id],
          params: {},
        },
      }),
      GameEventSchema.parse({
        matchId: setup.engine.state.matchId,
        sequence: baseSequence + 11,
        occurredAt: '2026-08-26T00:00:10.000Z',
        visibility: { kind: 'public' },
        payload: {
          type: 'match.ended',
          winner: 'village',
          winningPlayerIds: [reviewer.id],
          reason: 'test',
        },
      }),
      GameEventSchema.parse({
        matchId: setup.engine.state.matchId,
        sequence: baseSequence + 12,
        occurredAt: '2026-08-26T00:00:11.000Z',
        visibility: { kind: 'public' },
        payload: { type: 'role.revealed', playerId: reviewer.id, roleId: reviewer.roleId },
      }),
    ]
    const state: GameState = {
      ...setup.engine.state,
      status: 'ended',
      day: 3,
      night: 3,
      phaseId: PhaseIdSchema.parse('phase-match-ended'),
      lastSequence: events.at(-1)!.sequence,
    }

    const history = setup.renderer.publicHistorySince(
      state,
      sixPlayerBoard,
      events,
      reviewer.id,
      baseSequence,
    )
    expect(history.fromSequence).toBe(baseSequence + 1)
    expect(history.toSequence).toBe(events.at(-1)!.sequence)
    expect(history.events.every((event) => event.visibility.kind === 'public')).toBe(true)
    expect(history.events.some((event) => event.payload.type === 'match.ended')).toBe(true)
    expect(history.events.some((event) => event.payload.type === 'role.revealed')).toBe(true)
    expect(history.narration.join('\n')).toContain('第二天评审者错过的公开发言')
    expect(history.narration.join('\n')).toContain('第三天评审者错过的公开发言')
    expect(history.narration.join('\n')).toContain('投票结果')
    expect(history.narration.join('\n')).toContain(`${eliminated.seat} 号玩家出局`)
    expect(history.narration.join('\n')).not.toContain('对局结束')
    expect(history.narration.join('\n')).not.toContain('的身份是')
    expect(history.narration.join('\n')).not.toContain('评审者自己已经知道的发言')
    expect(history.narration.join('\n')).not.toContain('不得进入公开补投递的狼队私密发言')
    expect(history.narration.join('\n')).not.toContain('private-test')
  })
})

function createBoardEngine(board: BoardManifest) {
  const ruleset = createClassicRuleset()
  const roleIds = board.roles.flatMap(({ roleId, count }) =>
    Array.from({ length: count }, () => roleId),
  )
  const assignmentRoleIds = roleIds.slice(0, board.playerCount)
  const reserveRoleIds = roleIds.slice(board.playerCount)
  const players: EnginePlayerInput[] = assignmentRoleIds.map((roleId, index) => ({
    id: PlayerIdSchema.parse(`player-${index + 1}`),
    seat: index + 1,
    name: `Prompt player ${index + 1}`,
    profileId: AgentProfileIdSchema.parse(`profile-prompt-${index + 1}`),
    roleId,
  }))
  const engine = GameEngine.create({
    matchId: MatchIdSchema.parse(`match-prompt-${board.playerCount}`),
    board,
    players,
    roleAssignment: 'manual',
    manualReserveRoleIds: reserveRoleIds,
    seed: 1,
    ruleset,
  })
  return { engine, players, renderer: new ContextRenderer(ruleset) }
}

function witchTurn(actorId: ReturnType<typeof PlayerIdSchema.parse>): TurnDescriptor {
  return {
    phaseId: PhaseIdSchema.parse('phase-night-witch'),
    labelKey: 'phases.nightWitch',
    mode: 'parallel',
    actionType: 'night-action',
    actors: [actorId],
    allowedAbilityIds: [v1AbilityIds.witchAntidote, v1AbilityIds.witchPoison],
  }
}

function daySpeechTurn(actorId: ReturnType<typeof PlayerIdSchema.parse>): TurnDescriptor {
  return {
    phaseId: PhaseIdSchema.parse('phase-day-speech'),
    labelKey: 'phases.daySpeech',
    mode: 'sequential',
    actionType: 'speech',
    actors: [actorId],
    speechKind: 'day',
  }
}

function withEvent(state: GameState, event: ReturnType<typeof GameEventSchema.parse>): GameState {
  return { ...state, lastSequence: event.sequence }
}
