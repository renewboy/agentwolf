import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import {
  AgentProfileInputSchema,
  AgentToolInputSchema,
  PlayerIdSchema,
  type LiveMessage,
  type MatchId,
  type MatchView,
  type PlayerId,
} from '@agentwolf/contracts'
import { type AcpPromptResult } from '@agentwolf/acp'
import { cupidBoard, sixPlayerBoard, standardBoard } from '@agentwolf/game-engine'
import { afterEach, describe, expect, it } from 'vitest'
import { buildServer, type AgentWolfServer } from '../src/app.js'
import type { ServerConfig } from '../src/config.js'
import type { PlayerSession, PlayerSessionFactory } from '../src/player-runtime.js'
import { auditTrajectory } from '../src/trajectory-audit.js'
import {
  scriptedSessionFactory,
  type ScriptedPostgameReviewContext,
  type ScriptedSeerFault,
} from './fixtures/scripted-session.js'

const temporaryDirectories: string[] = []
const openServers: AgentWolfServer[] = []
const promptContracts = {
  'phase-night-wolf-vote': '狼队商议结束。本夜可以袭击',
  'phase-night-witch': '当前药剂状态：',
  'phase-night-seer': '请选择今晚要查验的其他存活玩家',
  'phase-day-speech': '现在轮到你发言',
} as const
const promptContract = (phaseId: keyof typeof promptContracts) => promptContracts[phaseId]

afterEach(async () => {
  await Promise.allSettled(openServers.splice(0).map((server) => server.close()))
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  )
})

describe('match orchestration', () => {
  it('runs a Cupid board through the real mailbox and captures its exact terminal winners', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-cupid-runtime-'))
    temporaryDirectories.push(root)
    let server: AgentWolfServer
    const prompts = new Map<PlayerId, string[]>()
    const config: ServerConfig = {
      host: '127.0.0.1',
      port: 4310,
      dataDirectory: root,
      databasePath: ':memory:',
      publicBaseUrl: 'http://127.0.0.1:4310',
      projectRoot: process.cwd(),
      webDistPath: resolve(root, 'missing-web-dist'),
      developerMode: true,
      publicSpeechInterruptMode: 'legacy',
    }
    server = await buildServer({
      config,
      sessionFactory: scriptedSessionFactory({
        prompts,
        mailbox: () => server.matches.mailbox,
      }),
    })
    openServers.push(server)
    const tool = server.catalog.createTool({
      name: 'Cupid scripted ACP',
      kind: 'custom',
      command: 'cupid-scripted-acp',
      args: [],
      environment: {},
      modelConfigKey: 'model',
    })
    const profile = server.catalog.createProfile({
      name: 'Cupid scripted player',
      toolId: tool.id,
      model: 'scripted-model',
      promptTimeoutMs: 5_000,
      connection: {},
    })
    const roles = cupidBoard.roles.flatMap(({ roleId, count }) =>
      Array.from({ length: count }, () => roleId),
    )
    const created = server.matches.createMatch({
      boardId: cupidBoard.id,
      roleAssignment: 'manual',
      seats: roles.map((roleId, index) => ({
        seat: index + 1,
        name: `Cupid runtime player ${index + 1}`,
        profileId: profile.id,
        roleId,
      })),
    })
    server.matches.beginMatch(created.id)
    const terminal = await waitForMatch(server, created.id)
    if (terminal.status === 'paused') throw new Error(terminal.pausedReason ?? 'Cupid Match paused')
    expect(terminal).toMatchObject({
      status: 'ended',
      winner: 'werewolf',
      winningPlayerIds: ['player-2', 'player-3', 'player-4'],
      postgameReview: {
        winningPlayerIds: ['player-2', 'player-3', 'player-4'],
      },
    })
    expect(
      terminal.seats
        .filter((seat) => seat.markers.includes('cupid-lover'))
        .map((seat) => seat.playerId),
    ).toEqual(['player-1', 'player-5'])
    const events = server.repository.listMatchEvents(created.id)
    const linked = events.find(
      (event) =>
        event.payload.type === 'plugin.event' && event.payload.eventType === 'event-cupid-linked',
    )
    expect(linked?.visibility).toEqual({
      kind: 'players',
      playerIds: ['player-12', 'player-1', 'player-5'],
    })
    const linkedDeath = events.find(
      (event) =>
        event.payload.type === 'plugin.event' &&
        event.payload.eventType === 'event-cupid-linked-death',
    )
    expect(linkedDeath).toMatchObject({
      visibility: { kind: 'god' },
      payload: {
        schemaVersion: 2,
        data: {
          sourceId: 'player-5',
          targetId: 'player-1',
          timing: 'night',
          presentation: 'partner-only',
        },
      },
    })
    expect(
      events.some(
        (event) =>
          event.visibility.kind === 'public' &&
          event.payload.type === 'plugin.event' &&
          event.payload.eventType === 'event-cupid-linked-death',
      ),
    ).toBe(false)
    expect(
      events.find(
        (event) =>
          event.payload.type === 'public.announcement' &&
          event.payload.code === 'night-deaths' &&
          event.payload.playerIds.some((playerId) => playerId === 'player-1') &&
          event.payload.playerIds.some((playerId) => playerId === 'player-5'),
      )?.payload,
    ).toMatchObject({ playerIds: expect.arrayContaining(['player-1', 'player-5']) })
    expect(events.findLast((event) => event.payload.type === 'match.ended')?.payload).toMatchObject(
      {
        winner: 'werewolf',
        winningPlayerIds: ['player-2', 'player-3', 'player-4'],
      },
    )
    const loversRevealed = events.find(
      (event) =>
        event.payload.type === 'public.announcement' &&
        event.payload.code === 'cupid-lovers-revealed',
    )
    expect(loversRevealed).toMatchObject({
      visibility: { kind: 'public' },
      payload: { playerIds: ['player-1', 'player-5'] },
    })
    expect(loversRevealed!.sequence).toBeGreaterThan(
      events.findLast((event) => event.payload.type === 'role.revealed')!.sequence,
    )
    const archive = await waitForArchive(server, created.id)
    expect(archive).toMatchObject({
      sourceRuleset: { familyId: 'classic', revision: 6 },
      trajectoryAudit: { ok: true, issues: [] },
    })
    const archivedClosedEye = server.matches.getMatch(created.id, { kind: 'closed-eye' })
    expect(archivedClosedEye).toEqual(archive.projections.closedEye)
    const archivedMessages: LiveMessage[] = []
    const archivedConnection = server.matches.connect(created.id, {
      view: { kind: 'closed-eye' },
      send: (message) => archivedMessages.push(message),
    })
    archivedConnection.receive({
      type: 'view.set',
      view: { kind: 'player', playerId: 'player-1' as PlayerId },
    })
    expect(archivedMessages.findLast((message) => message.type === 'snapshot')).toMatchObject({
      type: 'snapshot',
      view: { kind: 'player', playerId: 'player-1' },
      data: archive.projections.players.find((entry) => entry.playerId === 'player-1')?.view,
    })
    archivedConnection.receive({ type: 'speech-playback.set', enabled: true })
    expect(archivedMessages.at(-1)).toMatchObject({
      type: 'error',
      code: 'invalid-live-message',
    })
    archivedConnection.close()
    await expect(server.simulations.addCandidate(created.id)).rejects.toThrow(/read-only/)
    expect(() => server.matches.beginMatch(created.id)).toThrow(/read-only/)
    await expect(server.matches.resumeMatch(created.id)).rejects.toThrow(/read-only/)
    expect(() => server.matches.startPostgameReview(created.id)).toThrow(/read-only/)
    const resumeResponse = await server.app.inject({
      method: 'POST',
      url: `/api/matches/${created.id}/resume`,
    })
    expect(resumeResponse).toMatchObject({ statusCode: 409 })
    expect(resumeResponse.json()).toMatchObject({ error: 'match-read-only' })
    const simulationResponse = await server.app.inject({
      method: 'POST',
      url: `/api/developer/matches/${created.id}/simulation/candidates`,
    })
    expect(simulationResponse).toMatchObject({ statusCode: 409 })
    expect(simulationResponse.json()).toMatchObject({ error: 'match-read-only' })
    expect(await auditTrajectory(server.repository, server.boards, created.id)).toMatchObject({
      ok: true,
      issues: [],
    })
  }, 20_000)

  it('generates a speech round ahead but holds its following phase at the final playback', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-playback-gate-'))
    temporaryDirectories.push(root)
    let server: AgentWolfServer
    const prompts = new Map<PlayerId, string[]>()
    const sessionFactory = scriptedSessionFactory({
      prompts,
      mailbox: () => server.matches.mailbox,
    })
    const config: ServerConfig = {
      host: '127.0.0.1',
      port: 4310,
      dataDirectory: root,
      databasePath: ':memory:',
      publicBaseUrl: 'http://127.0.0.1:4310',
      projectRoot: process.cwd(),
      webDistPath: resolve(root, 'missing-web-dist'),
      developerMode: false,
      publicSpeechInterruptMode: 'legacy',
    }
    server = await buildServer({ config, sessionFactory })
    openServers.push(server)
    const tool = server.catalog.createTool({
      name: 'Playback ACP',
      kind: 'custom',
      command: 'playback-acp',
      args: [],
      environment: {},
      modelConfigKey: 'model',
    })
    const profile = server.catalog.createProfile({
      name: 'Playback player',
      toolId: tool.id,
      model: 'scripted-model',
      promptTimeoutMs: 5_000,
      connection: {},
    })
    const roles = sixPlayerBoard.roles.flatMap(({ roleId, count }) =>
      Array.from({ length: count }, () => roleId),
    )
    const created = server.matches.createMatch({
      boardId: sixPlayerBoard.id,
      roleAssignment: 'manual',
      seats: roles.map((roleId, index) => ({
        seat: index + 1,
        name: `Playback player ${index + 1}`,
        profileId: profile.id,
        roleId,
      })),
    })
    const messages: LiveMessage[] = []
    const connection = server.matches.connect(created.id, {
      view: { kind: 'god' },
      send: (message) => messages.push(message),
    })
    connection.receive({ type: 'speech-playback.set', enabled: true })
    const contenderMessages: LiveMessage[] = []
    const contender = server.matches.connect(created.id, {
      view: { kind: 'god' },
      send: (message) => contenderMessages.push(message),
    })
    contender.receive({ type: 'speech-playback.set', enabled: true })
    expect(
      contenderMessages.some(
        (message) => message.type === 'error' && message.code === 'speech-playback-controller-busy',
      ),
    ).toBe(true)
    server.matches.beginMatch(created.id)

    const pendingSequence = await waitForPlaybackSequence(messages)
    const held = server.matches.getMatch(created.id, { kind: 'god' })
    expect(held.phaseId).toBe('phase-night-wolf-council')
    expect(held.timeline.filter((item) => item.kind === 'speech.committed')).toHaveLength(2)
    expect(
      [...prompts.values()]
        .flat()
        .some((prompt) => prompt.includes(promptContract('phase-night-wolf-vote'))),
    ).toBe(false)
    connection.receive({
      type: 'speech-playback.resolve',
      sequence: pendingSequence + 1,
      outcome: 'completed',
    })
    expect(
      messages.some(
        (message) =>
          message.type === 'error' && message.code === 'speech-playback-invalid-resolution',
      ),
    ).toBe(true)
    expect(server.matches.getMatch(created.id, { kind: 'god' }).phaseId).toBe(
      'phase-night-wolf-council',
    )

    connection.receive({
      type: 'speech-playback.resolve',
      sequence: pendingSequence,
      outcome: 'completed',
    })
    connection.receive({
      type: 'speech-playback.resolve',
      sequence: pendingSequence,
      outcome: 'completed',
    })
    await waitForPrompt(prompts, promptContract('phase-night-wolf-vote'))
    contender.close()
    connection.close()
  })

  it('does not gate hidden wolf speech for a closed-eye playback controller', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-playback-visibility-'))
    temporaryDirectories.push(root)
    let server: AgentWolfServer
    const prompts = new Map<PlayerId, string[]>()
    const sessionFactory = scriptedSessionFactory({
      prompts,
      mailbox: () => server.matches.mailbox,
    })
    const config: ServerConfig = {
      host: '127.0.0.1',
      port: 4310,
      dataDirectory: root,
      databasePath: ':memory:',
      publicBaseUrl: 'http://127.0.0.1:4310',
      projectRoot: process.cwd(),
      webDistPath: resolve(root, 'missing-web-dist'),
      developerMode: false,
      publicSpeechInterruptMode: 'legacy',
    }
    server = await buildServer({ config, sessionFactory })
    openServers.push(server)
    const tool = server.catalog.createTool({
      name: 'Closed-eye playback ACP',
      kind: 'custom',
      command: 'closed-eye-playback-acp',
      args: [],
      environment: {},
      modelConfigKey: 'model',
    })
    const profile = server.catalog.createProfile({
      name: 'Closed-eye playback player',
      toolId: tool.id,
      model: 'scripted-model',
      promptTimeoutMs: 5_000,
      connection: {},
    })
    const roles = sixPlayerBoard.roles.flatMap(({ roleId, count }) =>
      Array.from({ length: count }, () => roleId),
    )
    const created = server.matches.createMatch({
      boardId: sixPlayerBoard.id,
      roleAssignment: 'manual',
      seats: roles.map((roleId, index) => ({
        seat: index + 1,
        name: `Closed-eye player ${index + 1}`,
        profileId: profile.id,
        roleId,
      })),
    })
    const connection = server.matches.connect(created.id, {
      view: { kind: 'closed-eye' },
      send: () => undefined,
    })
    connection.receive({ type: 'speech-playback.set', enabled: true })
    server.matches.beginMatch(created.id)

    await waitForPrompt(prompts, promptContract('phase-night-wolf-vote'))
    connection.close()
  })

  it('runs a complete 12-agent match with synchronized incremental ACP turns', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-server-'))
    temporaryDirectories.push(root)
    let server: AgentWolfServer
    const prompts = new Map<PlayerId, string[]>()
    const sessionFactory = scriptedSessionFactory({
      prompts,
      mailbox: () => server.matches.mailbox,
    })
    const config: ServerConfig = {
      host: '127.0.0.1',
      port: 4310,
      dataDirectory: root,
      databasePath: ':memory:',
      publicBaseUrl: 'http://127.0.0.1:4310',
      projectRoot: process.cwd(),
      webDistPath: resolve(root, 'missing-web-dist'),
      developerMode: false,
      publicSpeechInterruptMode: 'legacy',
    }
    server = await buildServer({ config, sessionFactory })
    openServers.push(server)

    const tool = server.catalog.createTool(
      AgentToolInputSchema.parse({
        name: 'Scripted ACP',
        kind: 'custom',
        command: 'scripted-acp',
        args: [],
        environment: {},
        modelConfigKey: 'model',
      }),
    )
    const profile = server.catalog.createProfile(
      AgentProfileInputSchema.parse({
        name: 'Deterministic player',
        toolId: tool.id,
        model: 'scripted-model',
        promptTimeoutMs: 5_000,
        connection: {},
      }),
    )
    const roles = standardBoard.roles.flatMap(({ roleId, count }) =>
      Array.from({ length: count }, () => roleId),
    )
    const created = server.matches.createMatch({
      boardId: standardBoard.id,
      roleAssignment: 'manual',
      seats: roles.map((roleId, index) => ({
        seat: index + 1,
        name: `玩家${index + 1}`,
        profileId: profile.id,
        roleId,
      })),
    })
    const liveMessages: LiveMessage[] = []
    server.matches.subscribe(created.id, {
      view: { kind: 'god' },
      send: (message) => liveMessages.push(message),
    })
    server.matches.beginMatch(created.id)

    const final = await waitForMatch(server, created.id)
    const lastWolfPrompt = prompts
      .get('player-1' as PlayerId)
      ?.findLast((prompt) => prompt.includes(promptContract('phase-night-wolf-vote')))
    expect(
      final.status,
      `${final.pausedReason ?? 'match paused without a reason'}\n${lastWolfPrompt ?? ''}`,
    ).toBe('ended')
    const countdownRemaining =
      Date.parse(final.postgameReview?.decisionDeadlineAt ?? '') - Date.now()
    expect(countdownRemaining).toBeGreaterThan(8_500)
    expect(countdownRemaining).toBeLessThanOrEqual(10_000)
    expect(final.postgameReview?.startedAt).toBeNull()
    const firstEndedSnapshot = liveMessages.find(
      (message) => message.type === 'snapshot' && message.data.status === 'ended',
    )
    expect(firstEndedSnapshot?.type).toBe('snapshot')
    if (firstEndedSnapshot?.type === 'snapshot') {
      expect(firstEndedSnapshot.data.postgameReview?.state).toBe('countdown')
    }
    expect(
      liveMessages.some(
        (message) =>
          message.type === 'snapshot' &&
          message.data.status === 'ended' &&
          message.data.postgameReview === null,
      ),
    ).toBe(false)
    expect(final.winner).toBe('werewolf')
    expect(final.day).toBe(4)
    expect(liveMessages.some((message) => message.type === 'speech-chunk')).toBe(true)
    expect(
      liveMessages.some(
        (message) =>
          message.type === 'snapshot' &&
          message.data.seats.some((seat) => seat.sessionStatus === 'syncing'),
      ),
    ).toBe(true)
    expect(
      liveMessages.some(
        (message) =>
          message.type === 'snapshot' &&
          message.data.seats.some((seat) => seat.sessionStatus === 'submitted'),
      ),
    ).toBe(true)
    expect(final.timeline.some((item) => item.kind === 'vote.resolved')).toBe(true)
    expect(final.timeline.some((item) => item.kind === 'vote.cast')).toBe(false)
    const godWolfVotes = final.timeline.filter(
      (item) => item.kind === 'vote.resolved' && item.title.startsWith('狼人投票'),
    )
    expect(godWolfVotes.length).toBeGreaterThan(0)
    expect(godWolfVotes.every((item) => item.detail?.startsWith('投'))).toBe(true)

    const wolfIds = roles
      .map((roleId, index) => ({ roleId, playerId: `player-${index + 1}` as PlayerId }))
      .filter((entry) => entry.roleId === 'role-werewolf')
      .map((entry) => entry.playerId)
    for (const wolfId of wolfIds) {
      const foundation = prompts.get(wolfId)?.[0]
      expect(foundation).toBeDefined()
      expect(foundation).not.toContain('ability-werewolf-kill')
      expect(foundation).not.toContain('ability-werewolf-self-destruct')
      const teammateLine = foundation?.split('\n').find((line) => line.includes('你的存活狼队友'))
      expect(teammateLine).toBeDefined()
      for (const teammateId of wolfIds.filter((playerId) => playerId !== wolfId)) {
        const teammate = final.seats.find((seat) => seat.playerId === teammateId)
        expect(teammateLine).not.toContain(teammate?.name)
        expect(teammateLine).not.toContain(teammate?.playerId)
        expect(teammateLine).toContain(`${teammate?.seat ?? 0} 号玩家`)
      }
      const nonWolfNames = final.seats
        .filter((seat) => !wolfIds.includes(seat.playerId))
        .map((seat) => seat.name)
      for (const name of nonWolfNames) expect(teammateLine).not.toContain(name)
    }
    const villagerFoundation = prompts.get('player-5' as PlayerId)?.[0]
    expect(villagerFoundation).not.toContain('你的存活狼队友')
    const publicRoleLabels = ['狼人', '村民', '预言家', '女巫', '猎人']
    for (const playerPrompts of prompts.values()) {
      const foundation = playerPrompts[0]
      expect(foundation).toContain('本局角色介绍')
      for (const label of publicRoleLabels) expect(foundation).toContain(`- ${label}`)
      expect(foundation).not.toContain('- 守卫（')
    }

    const firstAttack = server.repository
      .listMatchEvents(created.id)
      .find(
        (event) =>
          event.payload.type === 'night.attack-selected' && event.payload.targetId !== null,
      )
    if (firstAttack?.payload.type !== 'night.attack-selected' || !firstAttack.payload.targetId) {
      throw new Error('Expected a selected wolf target')
    }
    const attackedId = firstAttack.payload.targetId
    const attacked = final.seats.find((seat) => seat.playerId === attackedId)
    const witchId = final.seats.find((seat) => seat.roleId === 'role-witch')?.playerId
    const seerId = final.seats.find((seat) => seat.roleId === 'role-seer')?.playerId
    const witchPrompt = witchId
      ? prompts
          .get(witchId)
          ?.find(
            (prompt) =>
              prompt.includes(promptContract('phase-night-witch')) &&
              prompt.includes(`狼队常规袭击目标是${attacked?.seat ?? 0} 号玩家`),
          )
      : undefined
    expect(witchPrompt).toContain(`狼队常规袭击目标是${attacked?.seat ?? 0} 号玩家`)
    expect(witchPrompt).not.toContain(attacked?.name)
    expect(witchPrompt).not.toContain(firstAttack.payload.targetId)
    expect(
      seerId
        ? prompts
            .get(seerId)
            ?.findLast((prompt) => prompt.includes(promptContract('phase-night-seer')))
        : undefined,
    ).not.toContain('狼队常规袭击目标是')
    const firstDaySpeechPrompt = [...prompts.values()]
      .flat()
      .find(
        (prompt) =>
          prompt.includes(promptContract('phase-day-speech')) &&
          prompt.includes('当前公开存活玩家'),
      )
    expect(firstDaySpeechPrompt).toBeDefined()

    server.matches.startPostgameReview(created.id)
    const reviewed = await waitForMatchState(
      server,
      created.id,
      (match) => match.postgameReview?.state === 'completed',
    )
    expect(reviewed.postgameReview?.startedAt).not.toBeNull()
    expect(reviewed.postgameReview?.submissions).toHaveLength(12)
    expect(reviewed.postgameReview?.reflections).toHaveLength(12)
    expect(reviewed.timeline.filter((item) => item.postgame)).toHaveLength(12)
    const closed = server.matches.getMatch(created.id, { kind: 'closed-eye' })
    expect(closed.seats.every((seat) => seat.roleId !== undefined)).toBe(true)
    expect(closed.seats.every((seat) => seat.sessionStatus === 'closed')).toBe(true)
    const wolfView = server.matches.getMatch(created.id, {
      kind: 'player',
      playerId: 'player-1' as PlayerId,
    })
    expect(wolfView.seats.filter((seat) => seat.roleId === 'role-werewolf')).toHaveLength(4)
    expect(wolfView.seats.every((seat) => seat.sessionStatus === 'closed')).toBe(true)
    expect(
      wolfView.timeline.filter(
        (item) => item.kind === 'vote.resolved' && item.title.startsWith('狼人投票'),
      ),
    ).toEqual(godWolfVotes)
    const villagerView = server.matches.getMatch(created.id, {
      kind: 'player',
      playerId: 'player-5' as PlayerId,
    })
    expect(villagerView.seats.filter((seat) => seat.roleId !== undefined)).toHaveLength(12)
    expect(villagerView.seats.every((seat) => seat.sessionStatus === 'closed')).toBe(true)
    expect(closed.timeline.some((item) => item.title.startsWith('狼人投票'))).toBe(false)
    expect(villagerView.timeline.some((item) => item.title.startsWith('狼人投票'))).toBe(false)
    const witchView = server.matches.getMatch(created.id, {
      kind: 'player',
      playerId: witchId!,
    })
    expect(witchView.timeline.some((item) => item.title.startsWith('狼人投票'))).toBe(false)

    const events = server.repository.listMatchEvents(created.id)
    expect(events.map((event) => event.sequence)).toEqual(
      Array.from({ length: events.length }, (_, index) => index + 1),
    )
    const startedDeliveries = events.filter((event) => event.payload.type === 'delivery.started')
    const acknowledgedDeliveries = events.filter(
      (event) => event.payload.type === 'delivery.acknowledged',
    )
    expect(acknowledgedDeliveries).toHaveLength(startedDeliveries.length)
    for (const seat of final.seats) {
      expect(
        server.repository.getDeliveryLedger(created.id, seat.playerId)?.activeAttempt,
      ).toBeNull()
    }
    const matchEnded = events.find((event) => event.payload.type === 'match.ended')
    const finalReveals = events.filter((event) => event.payload.type === 'role.revealed')
    expect(finalReveals).toHaveLength(12)
    expect(finalReveals.every((event) => event.sequence > (matchEnded?.sequence ?? 0))).toBe(true)
    expect([...prompts.values()].flat().join('\n')).not.toMatch(/新增|补充信息/)
    const trajectoryTurns = server.repository
      .listTrajectoryTurns(created.id)
      .filter((turn) => turn.ownerId !== 'system')
    const trajectoryRecords = server.repository.listTrajectoryRecords(created.id)
    for (const turn of trajectoryTurns.filter(
      (candidate) =>
        candidate.phaseId !== null &&
        !candidate.phaseId.startsWith('phase-night-') &&
        candidate.phaseId !== 'phase-match-ended',
    )) {
      const prompt = trajectoryRecords.find(
        (record) => record.turnId === turn.turnId && record.kind === 'prompt',
      )?.text
      expect(prompt).toMatch(/当前是第 \d+ 天/u)
      expect(prompt).toContain('当前公开存活玩家')
    }
    expect(await auditTrajectory(server.repository, server.boards, created.id)).toMatchObject({
      ok: true,
      issues: [],
    })
  }, 15_000)

  it('returns a rejected structured action to the same Agent turn and continues without pausing', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-recovery-'))
    temporaryDirectories.push(root)
    let server: AgentWolfServer
    const prompts = new Map<PlayerId, string[]>()
    const rejectedSeerReasons: string[] = []
    const sessionStarts: Array<{ playerId: PlayerId; resumeSessionId: string | null }> = []
    const seerFault: ScriptedSeerFault = {
      value: true,
      behavior: 'correct-in-turn',
      rejectedReasons: rejectedSeerReasons,
    }
    const uncertainSpeechOnce = { playerId: 'player-3' as PlayerId, value: true }
    const sessionFactory = scriptedSessionFactory({
      prompts,
      mailbox: () => server.matches.mailbox,
      seerFault,
      uncertainSpeechOnce,
      sessionStarts,
    })
    const config: ServerConfig = {
      host: '127.0.0.1',
      port: 4310,
      dataDirectory: root,
      databasePath: ':memory:',
      publicBaseUrl: 'http://127.0.0.1:4310',
      projectRoot: process.cwd(),
      webDistPath: resolve(root, 'missing-web-dist'),
      developerMode: false,
      publicSpeechInterruptMode: 'legacy',
    }
    server = await buildServer({ config, sessionFactory })
    openServers.push(server)
    const tool = server.catalog.createTool({
      name: 'Recoverable ACP',
      kind: 'custom',
      command: 'recoverable-acp',
      args: [],
      environment: {},
      modelConfigKey: 'model',
    })
    const profile = server.catalog.createProfile({
      name: 'Recoverable player',
      toolId: tool.id,
      model: 'scripted-model',
      promptTimeoutMs: 5_000,
      connection: {},
    })
    const roles = sixPlayerBoard.roles.flatMap(({ roleId, count }) =>
      Array.from({ length: count }, () => roleId),
    )
    const created = server.matches.createMatch({
      boardId: sixPlayerBoard.id,
      roleAssignment: 'manual',
      seats: roles.map((roleId, index) => ({
        seat: index + 1,
        name: `Recovery player ${index + 1}`,
        profileId: profile.id,
        roleId,
      })),
    })
    server.matches.beginMatch(created.id)

    const seerId = `player-${roles.findIndex((roleId) => roleId === 'role-seer') + 1}` as PlayerId
    const corrected = await waitForMatchState(server, created.id, (match) =>
      match.timeline.some((item) => item.kind === 'seer.inspected'),
    )
    expect(rejectedSeerReasons).toEqual(['phase-night-seer requires ability-seer-inspect'])
    expect(corrected.status, corrected.pausedReason ?? 'unexpected pause').not.toBe('paused')
    expect(corrected.timeline.filter((item) => item.kind === 'match.paused')).toHaveLength(0)
    const seerTurns =
      prompts.get(seerId)?.filter((prompt) => prompt.includes('请选择今晚要查验的其他存活玩家')) ??
      []
    expect(seerTurns).toHaveLength(1)
    const automaticallyRecovered = await waitForMatchState(server, created.id, (match) =>
      match.timeline.some(
        (item) =>
          item.kind === 'speech.committed' && item.playerIds.includes('player-3' as PlayerId),
      ),
    )
    expect(
      automaticallyRecovered.timeline.some(
        (item) =>
          item.kind === 'speech.committed' && item.playerIds.includes('player-3' as PlayerId),
      ),
    ).toBe(true)
    expect(
      automaticallyRecovered.timeline.some(
        (item) => item.kind === 'match.paused' && item.title.includes('simulated ACP disconnect'),
      ),
    ).toBe(false)
    expect(
      automaticallyRecovered.timeline.filter((item) => item.kind === 'match.resumed'),
    ).toHaveLength(0)
    expect(sessionStarts).toHaveLength(6)
    expect(sessionStarts.every((start) => start.resumeSessionId === null)).toBe(true)
    expect(
      prompts
        .get('player-3' as PlayerId)
        ?.some((prompt) => prompt.includes('继续执行裁判当前阶段')),
    ).toBe(true)
    const playerTurns = server.repository
      .listTrajectoryTurns(created.id)
      .filter((turn) => turn.ownerId !== 'system')
    expect(new Set(playerTurns.map((turn) => turn.sessionGeneration))).toEqual(new Set([1]))
    expect(playerTurns.filter((turn) => turn.kind === 'bootstrap')).toHaveLength(6)
    expect(server.repository.playerSessions.list(created.id)).toHaveLength(6)
    expect(await auditTrajectory(server.repository, server.boards, created.id)).toMatchObject({
      ok: true,
      issues: [],
    })
  }, 15_000)

  it('discards durable actions left behind when self-destruct interrupts a parallel stage', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-interrupt-actions-'))
    temporaryDirectories.push(root)
    let server: AgentWolfServer
    const prompts = new Map<PlayerId, string[]>()
    const selfDestruct = { playerId: 'player-3' as PlayerId, value: true }
    const sessionFactory = scriptedSessionFactory({
      prompts,
      mailbox: () => server.matches.mailbox,
      sheriffSelfDestructOnce: selfDestruct,
    })
    const config: ServerConfig = {
      host: '127.0.0.1',
      port: 4310,
      dataDirectory: root,
      databasePath: ':memory:',
      publicBaseUrl: 'http://127.0.0.1:4310',
      projectRoot: process.cwd(),
      webDistPath: resolve(root, 'missing-web-dist'),
      developerMode: false,
      publicSpeechInterruptMode: 'legacy',
    }
    server = await buildServer({ config, sessionFactory })
    openServers.push(server)
    const tool = server.catalog.createTool({
      name: 'Interrupt ACP',
      kind: 'custom',
      command: 'interrupt-acp',
      args: [],
      environment: {},
      modelConfigKey: 'model',
    })
    const profile = server.catalog.createProfile({
      name: 'Interrupt player',
      toolId: tool.id,
      model: 'scripted-model',
      promptTimeoutMs: 5_000,
      connection: {},
    })
    const roles = standardBoard.roles.flatMap(({ roleId, count }) =>
      Array.from({ length: count }, () => roleId),
    )
    const created = server.matches.createMatch({
      boardId: standardBoard.id,
      roleAssignment: 'manual',
      seats: roles.map((roleId, index) => ({
        seat: index + 1,
        name: `Interrupt player ${index + 1}`,
        profileId: profile.id,
        roleId,
      })),
    })
    server.matches.beginMatch(created.id)

    const seerId = `player-${roles.findIndex((roleId) => roleId === 'role-seer') + 1}` as PlayerId
    const continued = await waitForMatchState(
      server,
      created.id,
      (match) => match.timeline.filter((item) => item.kind === 'seer.inspected').length >= 2,
    )

    expect(selfDestruct.value).toBe(false)
    expect(continued.status).not.toBe('paused')
    expect(
      continued.timeline.some(
        (item) =>
          item.kind === 'public.announcement' &&
          item.playerIds.includes(PlayerIdSchema.parse('player-3')),
      ),
    ).toBe(true)
    expect(continued.timeline.some((item) => item.kind === 'match.paused')).toBe(false)
    expect(server.repository.playerSessions.get(created.id, seerId)?.pendingAction).toBeNull()
  }, 15_000)

  it.each([
    { failResume: false, label: 'resumes only the disconnected player' },
    { failResume: true, label: 'pauses without creating another Session when resume fails' },
  ])('$label', async ({ failResume }) => {
    const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-session-resume-'))
    temporaryDirectories.push(root)
    let server: AgentWolfServer
    const prompts = new Map<PlayerId, string[]>()
    const sessionStarts: Array<{ playerId: PlayerId; resumeSessionId: string | null }> = []
    const disconnectedPlayerId = 'player-3' as PlayerId
    const sessionFactory = scriptedSessionFactory({
      prompts,
      mailbox: () => server.matches.mailbox,
      uncertainSpeechOnce: {
        playerId: disconnectedPlayerId,
        value: true,
        disconnect: true,
      },
      sessionStarts,
      ...(failResume ? { failResumeFor: disconnectedPlayerId } : {}),
    })
    const config: ServerConfig = {
      host: '127.0.0.1',
      port: 4310,
      dataDirectory: root,
      databasePath: ':memory:',
      publicBaseUrl: 'http://127.0.0.1:4310',
      projectRoot: process.cwd(),
      webDistPath: resolve(root, 'missing-web-dist'),
      developerMode: false,
      publicSpeechInterruptMode: 'legacy',
    }
    server = await buildServer({ config, sessionFactory })
    openServers.push(server)
    const tool = server.catalog.createTool({
      name: `Resume ${failResume ? 'failure' : 'success'} ACP`,
      kind: 'custom',
      command: 'resume-acp',
      args: [],
      environment: {},
      modelConfigKey: 'model',
    })
    const profile = server.catalog.createProfile({
      name: `Resume ${failResume ? 'failure' : 'success'} player`,
      toolId: tool.id,
      model: 'scripted-model',
      promptTimeoutMs: 5_000,
      connection: {},
    })
    const roles = sixPlayerBoard.roles.flatMap(({ roleId, count }) =>
      Array.from({ length: count }, () => roleId),
    )
    const created = server.matches.createMatch({
      boardId: sixPlayerBoard.id,
      roleAssignment: 'manual',
      seats: roles.map((roleId, index) => ({
        seat: index + 1,
        name: `Resume player ${index + 1}`,
        profileId: profile.id,
        roleId,
      })),
    })
    server.matches.beginMatch(created.id)

    if (failResume) {
      const paused = await waitForMatch(server, created.id)
      expect(paused.status).toBe('paused')
      expect(paused.pausedReason).toContain('simulated resume failure')
    } else {
      const recovered = await waitForMatchState(server, created.id, (match) =>
        match.timeline.some(
          (item) =>
            item.kind === 'speech.committed' && item.playerIds.includes(disconnectedPlayerId),
        ),
      )
      expect(recovered.status).not.toBe('paused')
    }

    expect(sessionStarts.slice(0, 6).every((start) => start.resumeSessionId === null)).toBe(true)
    expect(sessionStarts.slice(6)).toEqual([
      { playerId: disconnectedPlayerId, resumeSessionId: `scripted-${disconnectedPlayerId}` },
    ])
    const bindings = server.repository.playerSessions.list(created.id)
    expect(bindings).toHaveLength(6)
    expect(bindings.every((binding) => binding.sessionId === `scripted-${binding.playerId}`)).toBe(
      true,
    )
    const turns = server.repository
      .listTrajectoryTurns(created.id)
      .filter((turn) => turn.ownerId !== 'system')
    expect(turns.filter((turn) => turn.kind === 'bootstrap')).toHaveLength(6)
    expect(new Set(turns.map((turn) => turn.sessionGeneration))).toEqual(new Set([1]))
    expect(await auditTrajectory(server.repository, server.boards, created.id)).toMatchObject({
      ok: true,
      issues: [],
    })
  })

  it('continues an interrupted bootstrap in the same logical Session', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-bootstrap-resume-'))
    temporaryDirectories.push(root)
    let server: AgentWolfServer
    const prompts = new Map<PlayerId, string[]>()
    const sessionStarts: Array<{ playerId: PlayerId; resumeSessionId: string | null }> = []
    const interruptedPlayerId = 'player-3' as PlayerId
    const sessionFactory = scriptedSessionFactory({
      prompts,
      mailbox: () => server.matches.mailbox,
      uncertainBootstrapOnce: {
        playerId: interruptedPlayerId,
        value: true,
        disconnect: true,
      },
      sessionStarts,
    })
    const config: ServerConfig = {
      host: '127.0.0.1',
      port: 4310,
      dataDirectory: root,
      databasePath: ':memory:',
      publicBaseUrl: 'http://127.0.0.1:4310',
      projectRoot: process.cwd(),
      webDistPath: resolve(root, 'missing-web-dist'),
      developerMode: false,
      publicSpeechInterruptMode: 'legacy',
    }
    server = await buildServer({ config, sessionFactory })
    openServers.push(server)
    const tool = server.catalog.createTool({
      name: 'Bootstrap resume ACP',
      kind: 'custom',
      command: 'bootstrap-resume-acp',
      args: [],
      environment: {},
      modelConfigKey: 'model',
    })
    const profile = server.catalog.createProfile({
      name: 'Bootstrap resume player',
      toolId: tool.id,
      model: 'scripted-model',
      promptTimeoutMs: 5_000,
      connection: {},
    })
    const roles = sixPlayerBoard.roles.flatMap(({ roleId, count }) =>
      Array.from({ length: count }, () => roleId),
    )
    const created = server.matches.createMatch({
      boardId: sixPlayerBoard.id,
      roleAssignment: 'manual',
      seats: roles.map((roleId, index) => ({
        seat: index + 1,
        name: `Bootstrap player ${index + 1}`,
        profileId: profile.id,
        roleId,
      })),
    })
    server.matches.beginMatch(created.id)
    const paused = await waitForMatch(server, created.id)
    expect(paused.status).toBe('paused')
    expect(paused.pausedReason).toContain('simulated bootstrap disconnect')

    await server.matches.resumeMatch(created.id)
    const resumed = await waitForMatchState(server, created.id, (match) =>
      match.timeline.some((item) => item.kind === 'speech.committed'),
    )
    expect(resumed.status).not.toBe('paused')
    expect(sessionStarts.slice(0, 6).every((start) => start.resumeSessionId === null)).toBe(true)
    expect(sessionStarts.slice(6)).toEqual([
      { playerId: interruptedPlayerId, resumeSessionId: `scripted-${interruptedPlayerId}` },
    ])
    expect(
      prompts.get(interruptedPlayerId)?.filter((prompt) => prompt.includes('# 任务目标')),
    ).toHaveLength(1)
    expect(
      prompts.get(interruptedPlayerId)?.some((prompt) => prompt.includes('当前仍在开局准备阶段')),
    ).toBe(true)
    expect(
      server.repository.playerSessions
        .list(created.id)
        .every((binding) => binding.bootstrapState === 'acknowledged'),
    ).toBe(true)
    const turns = server.repository
      .listTrajectoryTurns(created.id)
      .filter((turn) => turn.ownerId !== 'system')
    expect(turns.filter((turn) => turn.kind === 'bootstrap')).toHaveLength(6)
    expect(new Set(turns.map((turn) => turn.sessionGeneration))).toEqual(new Set([1]))
    expect(await auditTrajectory(server.repository, server.boards, created.id)).toMatchObject({
      ok: true,
      issues: [],
    })
  }, 15_000)

  it('resumes the same durable player Sessions after server restart', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-restart-recovery-'))
    temporaryDirectories.push(root)
    let server: AgentWolfServer
    const prompts = new Map<PlayerId, string[]>()
    const sessionStarts: Array<{ playerId: PlayerId; resumeSessionId: string | null }> = []
    const seerFault: ScriptedSeerFault = { value: true, behavior: 'omit' }
    const sessionFactory = scriptedSessionFactory({
      prompts,
      mailbox: () => server.matches.mailbox,
      seerFault,
      sessionStarts,
    })
    const config: ServerConfig = {
      host: '127.0.0.1',
      port: 4310,
      dataDirectory: root,
      databasePath: resolve(root, 'agentwolf.sqlite'),
      publicBaseUrl: 'http://127.0.0.1:4310',
      projectRoot: process.cwd(),
      webDistPath: resolve(root, 'missing-web-dist'),
      developerMode: false,
      publicSpeechInterruptMode: 'legacy',
    }
    server = await buildServer({ config, sessionFactory })
    openServers.push(server)
    const tool = server.catalog.createTool({
      name: 'Restart recovery ACP',
      kind: 'custom',
      command: 'restart-recovery-acp',
      args: [],
      environment: {},
      modelConfigKey: 'model',
    })
    const profile = server.catalog.createProfile({
      name: 'Restart recovery player',
      toolId: tool.id,
      model: 'scripted-model',
      promptTimeoutMs: 5_000,
      connection: {},
    })
    const roles = sixPlayerBoard.roles.flatMap(({ roleId, count }) =>
      Array.from({ length: count }, () => roleId),
    )
    const created = server.matches.createMatch({
      boardId: sixPlayerBoard.id,
      roleAssignment: 'manual',
      seats: roles.map((roleId, index) => ({
        seat: index + 1,
        name: `Restart player ${index + 1}`,
        profileId: profile.id,
        roleId,
      })),
    })
    server.matches.beginMatch(created.id)
    expect((await waitForMatch(server, created.id)).pausedReason).toContain(
      'Agent did not submit the expected night-action action',
    )
    await server.close()

    server = await buildServer({ config, sessionFactory })
    openServers.push(server)
    const recoveredLiveMessages: LiveMessage[] = []
    const recoveredConnection = server.matches.connect(created.id, {
      view: { kind: 'god' },
      send: (message) => recoveredLiveMessages.push(message),
    })
    await server.matches.resumeMatch(created.id)
    const resumed = await waitForMatchState(server, created.id, (match) =>
      match.timeline.some((item) => item.kind === 'seer.inspected'),
    )
    expect(resumed.day).toBeGreaterThanOrEqual(1)
    const seerId = `player-${roles.findIndex((roleId) => roleId === 'role-seer') + 1}` as PlayerId
    const recoveryPrompt = prompts
      .get(seerId)
      ?.findLast((prompt) =>
        prompt.includes('Agent did not submit the expected night-action action'),
      )
    expect(recoveryPrompt).toContain('请选择今晚要查验的其他存活玩家')
    expect(recoveryPrompt).not.toMatch(/abilityId|targetPlayerIds|option:/u)
    expect(recoveryPrompt).not.toContain('# 任务目标')
    expect(recoveryPrompt).not.toContain('好人阵营需要让所有狼人出局')
    expect(sessionStarts).toHaveLength(12)
    expect(sessionStarts.slice(0, 6).every((start) => start.resumeSessionId === null)).toBe(true)
    expect(
      sessionStarts
        .slice(6)
        .every((start) => start.resumeSessionId === `scripted-${start.playerId}`),
    ).toBe(true)
    const bindings = server.repository.playerSessions.list(created.id)
    expect(bindings).toHaveLength(6)
    expect(bindings.every((binding) => binding.sessionId === `scripted-${binding.playerId}`)).toBe(
      true,
    )
    const turns = server.repository
      .listTrajectoryTurns(created.id)
      .filter((turn) => turn.ownerId !== 'system')
    expect(turns.filter((turn) => turn.kind === 'bootstrap')).toHaveLength(6)
    expect(new Set(turns.map((turn) => turn.sessionGeneration))).toEqual(new Set([1]))
    expect(
      recoveredLiveMessages.some(
        (message) =>
          message.type === 'snapshot' &&
          message.data.status === 'running' &&
          message.data.timeline.some((item) => item.kind === 'seer.inspected'),
      ),
    ).toBe(true)
    recoveredConnection.close()
    await waitForMatch(server, created.id)
  })

  it('deletes a running match without reporting disposed sessions as a match failure', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-delete-running-'))
    temporaryDirectories.push(root)
    let turnStarted!: () => void
    const activeTurn = new Promise<void>((resolvePromise) => {
      turnStarted = resolvePromise
    })
    const sessionFactory: PlayerSessionFactory = async (options) =>
      new BlockingSession(options.playerId, turnStarted)
    const config: ServerConfig = {
      host: '127.0.0.1',
      port: 4310,
      dataDirectory: root,
      databasePath: ':memory:',
      publicBaseUrl: 'http://127.0.0.1:4310',
      projectRoot: process.cwd(),
      webDistPath: resolve(root, 'missing-web-dist'),
      developerMode: false,
      publicSpeechInterruptMode: 'legacy',
    }
    const server = await buildServer({ config, sessionFactory })
    openServers.push(server)
    const tool = server.catalog.createTool({
      name: 'Blocking ACP',
      kind: 'custom',
      command: 'blocking-acp',
      args: [],
      environment: {},
      modelConfigKey: 'model',
    })
    const profile = server.catalog.createProfile({
      name: 'Blocking player',
      toolId: tool.id,
      model: 'scripted-model',
      promptTimeoutMs: 5_000,
      connection: {},
    })
    const roles = sixPlayerBoard.roles.flatMap(({ roleId, count }) =>
      Array.from({ length: count }, () => roleId),
    )
    const created = server.matches.createMatch({
      boardId: sixPlayerBoard.id,
      roleAssignment: 'manual',
      seats: roles.map((roleId, index) => ({
        seat: index + 1,
        name: `Disposable player ${index + 1}`,
        profileId: profile.id,
        roleId,
      })),
    })
    const liveMessages: LiveMessage[] = []
    server.matches.subscribe(created.id, {
      view: { kind: 'god' },
      send: (message) => liveMessages.push(message),
    })
    server.matches.beginMatch(created.id)

    await Promise.race([
      activeTurn,
      new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error('Player turn did not start')), 10_000),
      ),
    ])
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20))
    const matchWorkspace = resolve(root, 'matches', created.id)
    await access(matchWorkspace)
    const thinkingSnapshot = [...liveMessages]
      .reverse()
      .find(
        (message): message is Extract<LiveMessage, { type: 'snapshot' }> =>
          message.type === 'snapshot' &&
          message.data.seats.some((seat) => seat.sessionStatus === 'thinking'),
      )
    expect(thinkingSnapshot).toBeDefined()
    const thinkingPlayerId = thinkingSnapshot?.data.seats.find(
      (seat) => seat.sessionStatus === 'thinking',
    )?.playerId
    expect(thinkingPlayerId).toBeDefined()
    const closedEye = server.matches.getMatch(created.id, { kind: 'closed-eye' })
    expect(closedEye.seats.every((seat) => seat.sessionStatus === 'idle')).toBe(true)
    if (thinkingPlayerId) {
      const playerView = server.matches.getMatch(created.id, {
        kind: 'player',
        playerId: thinkingPlayerId,
      })
      expect(
        playerView.seats.find((seat) => seat.playerId === thinkingPlayerId)?.sessionStatus,
      ).toBe('thinking')
      expect(
        playerView.seats
          .filter((seat) => seat.playerId !== thinkingPlayerId)
          .every((seat) => seat.sessionStatus === 'idle'),
      ).toBe(true)
    }
    await server.matches.deleteMatch(created.id)
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20))

    expect(server.repository.getMatch(created.id)).toBeNull()
    expect(server.repository.playerSessions.list(created.id)).toEqual([])
    await expect(access(matchWorkspace)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(
      liveMessages.some(
        (message) =>
          message.type === 'snapshot' &&
          message.data.status === 'paused' &&
          message.data.pausedReason?.includes('Active session disposed'),
      ),
    ).toBe(false)
  })

  it('publishes each accepted review sheet before streaming reflections through the speech feed', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-postgame-review-'))
    temporaryDirectories.push(root)
    let server: AgentWolfServer
    let releaseReview!: () => void
    const reviewRelease = new Promise<void>((resolvePromise) => {
      releaseReview = resolvePromise
    })
    let markReviewStarted!: () => void
    const reviewStarted = new Promise<void>((resolvePromise) => {
      markReviewStarted = resolvePromise
    })
    const prompts = new Map<PlayerId, string[]>()
    const sessionFactory = scriptedSessionFactory({
      prompts,
      mailbox: () => server.matches.mailbox,
      postgameReviewGate: {
        playerId: 'player-1' as PlayerId,
        started: markReviewStarted,
        release: reviewRelease,
      },
    })
    const config: ServerConfig = {
      host: '127.0.0.1',
      port: 4310,
      dataDirectory: root,
      databasePath: ':memory:',
      publicBaseUrl: 'http://127.0.0.1:4310',
      projectRoot: process.cwd(),
      webDistPath: resolve(root, 'missing-web-dist'),
      developerMode: false,
      publicSpeechInterruptMode: 'legacy',
    }
    server = await buildServer({ config, sessionFactory })
    openServers.push(server)
    const tool = server.catalog.createTool({
      name: 'Postgame ACP',
      kind: 'custom',
      command: 'postgame-acp',
      args: [],
      environment: {},
      modelConfigKey: 'model',
    })
    const profile = server.catalog.createProfile({
      name: 'Postgame player',
      toolId: tool.id,
      model: 'scripted-model',
      promptTimeoutMs: 5_000,
      connection: {},
    })
    const roles = sixPlayerBoard.roles.flatMap(({ roleId, count }) =>
      Array.from({ length: count }, () => roleId),
    )
    const created = server.matches.createMatch({
      boardId: sixPlayerBoard.id,
      roleAssignment: 'manual',
      seats: roles.map((roleId, index) => ({
        seat: index + 1,
        name: `Review player ${index + 1}`,
        profileId: profile.id,
        roleId,
      })),
    })
    const messages: LiveMessage[] = []
    const connection = server.matches.connect(created.id, {
      view: { kind: 'god' },
      send: (message) => messages.push(message),
    })
    server.matches.beginMatch(created.id)
    const terminal = await waitForMatch(server, created.id)
    const terminalEvents = server.repository
      .listMatchEvents(created.id)
      .filter((event) => event.sequence <= terminal.lastSequence)
    const cursorBeforeReview = new Map(
      terminal.seats.map((seat) => {
        const ledger = server.repository.getDeliveryLedger(created.id, seat.playerId)
        if (!ledger) throw new Error(`Missing delivery ledger for ${seat.playerId}`)
        return [seat.playerId, ledger.acknowledgedSequence] as const
      }),
    )
    expect(new Set(cursorBeforeReview.values()).size).toBeGreaterThan(1)
    expect(Math.min(...cursorBeforeReview.values())).toBeLessThan(terminal.lastSequence)
    server.matches.startPostgameReview(created.id)
    await reviewStarted
    const partial = await waitForMatchState(
      server,
      created.id,
      (match) =>
        (match.postgameReview?.submittedCount ?? 0) > 0 &&
        (match.postgameReview?.submittedCount ?? 0) < 6,
    )
    expect(partial.postgameReview?.result).toBeNull()
    expect(partial.postgameReview?.startedAt).not.toBeNull()
    expect(partial.postgameReview?.submissions[0]?.ratings).toHaveLength(5)
    await expect(server.matches.skipPostgameReview(created.id)).rejects.toThrow(
      'cannot be skipped after it starts',
    )
    expect(
      messages.some(
        (message) =>
          message.type === 'snapshot' &&
          (message.data.postgameReview?.submittedCount ?? 0) > 0 &&
          (message.data.postgameReview?.submittedCount ?? 0) < 6,
      ),
    ).toBe(true)

    const reflectionMessageOffset = messages.length
    connection.receive({ type: 'speech-playback.set', enabled: true })
    releaseReview()
    const pendingReflectionSequence = await waitForPlaybackSequence(messages)
    const heldAtFinalReflection = server.matches.getMatch(created.id, { kind: 'god' })
    expect(heldAtFinalReflection.postgameReview?.state).toBe('speaking')
    expect(heldAtFinalReflection.postgameReview?.reflections).toHaveLength(6)
    connection.receive({
      type: 'speech-playback.resolve',
      sequence: pendingReflectionSequence,
      outcome: 'completed',
    })
    const completed = await waitForMatchState(
      server,
      created.id,
      (match) => match.postgameReview?.state === 'completed',
    )
    expect(completed.postgameReview?.submissions).toHaveLength(6)
    expect(completed.postgameReview?.reflections).toHaveLength(6)
    expect(completed.timeline.filter((item) => item.postgame)).toHaveLength(6)
    expect(
      messages.slice(reflectionMessageOffset).some((message) => message.type === 'speech-chunk'),
    ).toBe(true)
    const terminalSnapshots: string[] = []
    let missedPublicSpeechCount = 0
    for (const seat of completed.seats) {
      const reviewPrompt = prompts
        .get(seat.playerId)
        ?.find((prompt) => prompt.includes('请完成本轮赛后评审'))
      expect(reviewPrompt).toContain('你上次行动后发生的公开对局记录')
      expect(reviewPrompt).toContain('最终胜负：')
      expect(reviewPrompt).toContain('获胜玩家：')
      expect(reviewPrompt).not.toContain('此前感言')
      expect(reviewPrompt).not.toContain(`${seat.seat} 号玩家的身份是`)
      const terminalStart = reviewPrompt?.indexOf('终局时点：') ?? -1
      const terminalEnd = reviewPrompt?.indexOf('请完成本轮赛后评审') ?? -1
      expect(terminalStart).toBeGreaterThanOrEqual(0)
      expect(terminalEnd).toBeGreaterThan(terminalStart)
      terminalSnapshots.push(reviewPrompt?.slice(terminalStart, terminalEnd) ?? '')

      const cursor = cursorBeforeReview.get(seat.playerId)!
      const expectedPublicEvents = terminalEvents.filter(
        (event) => event.sequence > cursor && event.visibility.kind === 'public',
      )
      const reviewTurn = server.repository
        .listTrajectoryTurns(created.id, seat.playerId)
        .find(
          (turn) =>
            turn.kind === 'postgame' && turn.actionType === 'postgame-review' && !turn.continuation,
        )
      expect(reviewTurn).toMatchObject({
        fromSequence: cursor + 1,
        toSequence: terminal.lastSequence,
        visibleEventSequences: expectedPublicEvents.map((event) => event.sequence),
      })
      for (const event of expectedPublicEvents) {
        if (event.payload.type !== 'speech.committed') continue
        if (event.payload.playerId === seat.playerId) {
          expect(reviewPrompt).not.toContain(event.payload.text)
        } else {
          expect(reviewPrompt).toContain(event.payload.text)
          missedPublicSpeechCount += 1
        }
      }
      expect(
        server.repository.getDeliveryLedger(created.id, seat.playerId)?.acknowledgedSequence,
      ).toBe(cursor)
    }
    expect(new Set(terminalSnapshots).size).toBe(1)
    expect(missedPublicSpeechCount).toBeGreaterThan(0)
    connection.close()
    await server.matches.deleteMatch(created.id)
    expect(server.repository.postgameReviews.get(created.id)).toBeNull()
    expect(server.repository.postgameReviews.listSubmissions(created.id)).toEqual([])
    expect(server.repository.postgameReviews.listReflections(created.id)).toEqual([])
  })

  it('resumes an interrupted review on the original logical Sessions without repeating accepted sheets', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-postgame-restart-'))
    temporaryDirectories.push(root)
    const databasePath = resolve(root, 'agentwolf.sqlite')
    let firstServer: AgentWolfServer
    let markReviewStarted!: () => void
    const reviewStarted = new Promise<void>((resolvePromise) => {
      markReviewStarted = resolvePromise
    })
    const neverRelease = new Promise<void>(() => undefined)
    const firstPrompts = new Map<PlayerId, string[]>()
    const postgameReviewContexts = new Map<PlayerId, ScriptedPostgameReviewContext>()
    const firstSessionStarts: Array<{ playerId: PlayerId; resumeSessionId: string | null }> = []
    const config: ServerConfig = {
      host: '127.0.0.1',
      port: 4310,
      dataDirectory: root,
      databasePath,
      publicBaseUrl: 'http://127.0.0.1:4310',
      projectRoot: process.cwd(),
      webDistPath: resolve(root, 'missing-web-dist'),
      developerMode: false,
      publicSpeechInterruptMode: 'legacy',
    }
    firstServer = await buildServer({
      config,
      sessionFactory: scriptedSessionFactory({
        prompts: firstPrompts,
        mailbox: () => firstServer.matches.mailbox,
        sessionStarts: firstSessionStarts,
        postgameReviewContexts,
        postgameReviewGate: {
          playerId: 'player-1' as PlayerId,
          started: markReviewStarted,
          release: neverRelease,
        },
      }),
    })
    openServers.push(firstServer)
    const tool = firstServer.catalog.createTool({
      name: 'Restart postgame ACP',
      kind: 'custom',
      command: 'restart-postgame-acp',
      args: [],
      environment: {},
      modelConfigKey: 'model',
    })
    const profile = firstServer.catalog.createProfile({
      name: 'Restart postgame player',
      toolId: tool.id,
      model: 'scripted-model',
      promptTimeoutMs: 5_000,
      connection: {},
    })
    const roles = sixPlayerBoard.roles.flatMap(({ roleId, count }) =>
      Array.from({ length: count }, () => roleId),
    )
    const created = firstServer.matches.createMatch({
      boardId: sixPlayerBoard.id,
      roleAssignment: 'manual',
      seats: roles.map((roleId, index) => ({
        seat: index + 1,
        name: `Restart review player ${index + 1}`,
        profileId: profile.id,
        roleId,
      })),
    })
    firstServer.matches.beginMatch(created.id)
    await waitForMatch(firstServer, created.id)
    firstServer.matches.startPostgameReview(created.id)
    await reviewStarted
    await waitForMatchState(
      firstServer,
      created.id,
      (match) => (match.postgameReview?.submittedCount ?? 0) === 5,
    )
    await firstServer.close()
    openServers.splice(openServers.indexOf(firstServer), 1)

    let resumedServer: AgentWolfServer
    const resumedPrompts = new Map<PlayerId, string[]>()
    const resumedSessionStarts: Array<{ playerId: PlayerId; resumeSessionId: string | null }> = []
    resumedServer = await buildServer({
      config,
      sessionFactory: scriptedSessionFactory({
        prompts: resumedPrompts,
        mailbox: () => resumedServer.matches.mailbox,
        sessionStarts: resumedSessionStarts,
        postgameReviewContexts,
      }),
    })
    openServers.push(resumedServer)
    resumedServer.matches.initializePostgameReviews()
    const completed = await waitForMatchState(
      resumedServer,
      created.id,
      (match) => match.postgameReview?.state === 'completed',
    )
    expect(completed.postgameReview?.submissions).toHaveLength(6)
    expect(
      [...resumedPrompts.values()].flat().filter((prompt) => prompt.includes('赛后评审')),
    ).toHaveLength(1)
    const initialReviewPrompt = firstPrompts
      .get('player-1' as PlayerId)
      ?.find((prompt) => prompt.includes('赛后评审'))
    const resumedReviewPrompt = resumedPrompts
      .get('player-1' as PlayerId)
      ?.find((prompt) => prompt.includes('赛后评审'))
    expect(initialReviewPrompt).toContain('你上次行动后发生的公开对局记录')
    expect(resumedReviewPrompt).toContain('继续当前赛后评审')
    expect(resumedReviewPrompt).not.toContain('你上次行动后发生的公开对局记录')
    expect(resumedSessionStarts).toHaveLength(6)
    expect(
      resumedSessionStarts.every((entry) => entry.resumeSessionId === `scripted-${entry.playerId}`),
    ).toBe(true)
  }, 15_000)
})

class BlockingSession implements PlayerSession {
  public readonly sessionId: string
  readonly #turnStarted: () => void
  #rejectPrompt: ((reason: Error) => void) | null = null
  #closed = false

  public get connected(): boolean {
    return !this.#closed
  }

  public finishAfterAcceptedAction(): void {}

  public constructor(playerId: PlayerId, turnStarted: () => void) {
    this.sessionId = `blocking-${playerId}`
    this.#turnStarted = turnStarted
  }

  public prompt(prompt: string): Promise<AcpPromptResult> {
    if (prompt.includes('只回复“准备就绪”')) {
      return Promise.resolve({ text: '准备就绪', stopReason: 'end_turn', updates: [] })
    }
    this.#turnStarted()
    return new Promise<AcpPromptResult>((_resolve, reject) => {
      this.#rejectPrompt = reject
    })
  }

  public close(): Promise<void> {
    this.#closed = true
    this.#rejectPrompt?.(new Error('Active session disposed'))
    this.#rejectPrompt = null
    return Promise.resolve()
  }
}

async function waitForMatch(server: AgentWolfServer, matchId: MatchId): Promise<MatchView> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const match = server.matches.getMatch(matchId, { kind: 'god' })
    if (match.status === 'ended' || match.status === 'paused') return match
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10))
  }
  throw new Error('Match did not reach a terminal state')
}

async function waitForArchive(server: AgentWolfServer, matchId: MatchId) {
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    const archive = server.repository.getMatchArchive(matchId)
    if (archive) return archive
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10))
  }
  throw new Error('Match did not produce a read-only archive')
}

async function waitForPlaybackSequence(messages: readonly LiveMessage[]): Promise<number> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const sequence = messages.findLast(
      (message) =>
        message.type === 'speech-playback.state' && message.state.pendingSequence !== null,
    )
    if (sequence?.type === 'speech-playback.state' && sequence.state.pendingSequence !== null) {
      return sequence.state.pendingSequence
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10))
  }
  throw new Error('Speech playback did not reach a pending boundary')
}

async function waitForPrompt(prompts: Map<PlayerId, string[]>, text: string): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if ([...prompts.values()].flat().some((prompt) => prompt.includes(text))) return
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10))
  }
  throw new Error(`Prompt did not contain ${text}`)
}

async function waitForMatchState(
  server: AgentWolfServer,
  matchId: MatchId,
  predicate: (match: MatchView) => boolean,
): Promise<MatchView> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const match = server.matches.getMatch(matchId, { kind: 'god' })
    if (predicate(match)) return match
    if (match.status === 'paused') throw new Error(match.pausedReason ?? 'Match paused')
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10))
  }
  throw new Error('Match did not reach the expected recovery state')
}
