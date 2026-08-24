import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import {
  AgentProfileInputSchema,
  AgentToolInputSchema,
  type LiveMessage,
  type MatchId,
  type MatchView,
  type PlayerId,
} from '@agentwolf/contracts'
import { type AcpPromptResult } from '@agentwolf/acp'
import { formatCopy, getCopy } from '@agentwolf/assets'
import { sixPlayerBoard, standardBoard } from '@agentwolf/game-engine'
import { afterEach, describe, expect, it } from 'vitest'
import { buildServer, type AgentWolfServer } from '../src/app.js'
import type { ServerConfig } from '../src/config.js'
import type { PlayerSession, PlayerSessionFactory } from '../src/player-runtime.js'
import { auditTrajectory } from '../src/trajectory-audit.js'
import { scriptedSessionFactory, type ScriptedSeerFault } from './fixtures/scripted-session.js'

const temporaryDirectories: string[] = []
const openServers: AgentWolfServer[] = []

afterEach(async () => {
  await Promise.allSettled(openServers.splice(0).map((server) => server.close()))
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  )
})

describe('match orchestration', () => {
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
        .some((prompt) => prompt.includes(getCopy('phases.nightWolfVote'))),
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
    await waitForPrompt(prompts, getCopy('phases.nightWolfVote'))
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

    await waitForPrompt(prompts, getCopy('phases.nightWolfVote'))
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
      ?.findLast((prompt) => prompt.includes(getCopy('phases.nightWolfVote')))
    expect(
      final.status,
      `${final.pausedReason ?? 'match paused without a reason'}\n${lastWolfPrompt ?? ''}`,
    ).toBe('ended')
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
      expect(foundation).toContain('ability-werewolf-self-destruct')
      const teammateLine = foundation?.split('\n').find((line) => line.includes('你的狼人队友'))
      expect(teammateLine).toBeDefined()
      for (const teammateId of wolfIds.filter((playerId) => playerId !== wolfId)) {
        const teammate = final.seats.find((seat) => seat.playerId === teammateId)
        expect(teammateLine).toContain(
          formatCopy(getCopy('narration.playerLabel'), {
            seat: teammate?.seat ?? 0,
            name: teammate?.name ?? '',
          }),
        )
      }
      const nonWolfNames = final.seats
        .filter((seat) => !wolfIds.includes(seat.playerId))
        .map((seat) => seat.name)
      for (const name of nonWolfNames) expect(teammateLine).not.toContain(name)
    }
    const villagerFoundation = prompts.get('player-5' as PlayerId)?.[0]
    expect(villagerFoundation).not.toContain('你的狼人队友')
    const publicRoleRuleStarts = ['werewolf', 'villager', 'seer', 'witch', 'hunter'].map(
      (role) => getCopy(`promptContext.roleRules.${role}`).split('。')[0]!,
    )
    for (const playerPrompts of prompts.values()) {
      const foundation = playerPrompts[0]
      expect(foundation).toContain('本局角色介绍')
      for (const ruleStart of publicRoleRuleStarts) expect(foundation).toContain(ruleStart)
      expect(foundation).not.toContain(getCopy('promptContext.roleRules.guard').split('。')[0]!)
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
    const attacked = final.seats.find((seat) => seat.playerId === firstAttack.payload.targetId)
    const attackNarration = formatCopy(getCopy('narration.nightAttackSelected'), {
      player: formatCopy(getCopy('narration.playerLabel'), {
        seat: attacked?.seat ?? 0,
        name: attacked?.name ?? '',
      }),
    })
    const witchId = final.seats.find((seat) => seat.roleId === 'role-witch')?.playerId
    const seerId = final.seats.find((seat) => seat.roleId === 'role-seer')?.playerId
    const witchPrompt = witchId
      ? prompts.get(witchId)?.find((prompt) => prompt.includes(getCopy('phases.nightWitch')))
      : undefined
    expect(witchPrompt).toContain(attackNarration)
    expect(witchPrompt).toContain('当前狼人袭击目标')
    expect(
      seerId
        ? prompts.get(seerId)?.find((prompt) => prompt.includes(getCopy('phases.nightSeer')))
        : undefined,
    ).not.toContain(getCopy('narration.nightAttackSelected').split('{{')[0]!)
    const firstDaySpeechPrompt = [...prompts.values()]
      .flat()
      .find(
        (prompt) => prompt.includes(getCopy('phases.daySpeech')) && prompt.includes('本轮发言顺序'),
      )
    expect(firstDaySpeechPrompt).toBeDefined()

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

    const seerId = `player-${roles.indexOf('role-seer') + 1}` as PlayerId
    const corrected = await waitForMatchState(server, created.id, (match) =>
      match.timeline.some((item) => item.kind === 'seer.inspected'),
    )
    expect(rejectedSeerReasons).toEqual(['phase-night-seer requires ability-seer-inspect'])
    expect(corrected.status).toBe('running')
    expect(corrected.timeline.filter((item) => item.kind === 'match.paused')).toHaveLength(0)
    const seerTurns =
      prompts
        .get(seerId)
        ?.filter(
          (prompt) => prompt.includes('ability-seer-inspect') && prompt.includes('targetPlayerIds'),
        ) ?? []
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
  })

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

    const seerId = `player-${roles.indexOf('role-seer') + 1}` as PlayerId
    const continued = await waitForMatchState(
      server,
      created.id,
      (match) => match.timeline.filter((item) => item.kind === 'seer.inspected').length >= 2,
    )

    expect(selfDestruct.value).toBe(false)
    expect(continued.status).toBe('running')
    expect(
      continued.timeline.some(
        (item) => item.kind === 'public.announcement' && item.playerIds.includes('player-3'),
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
      expect(recovered.status).toBe('running')
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
    expect(resumed.status).toBe('running')
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
  })

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
    const seerId = `player-${roles.indexOf('role-seer') + 1}` as PlayerId
    const recoveryPrompt = prompts
      .get(seerId)
      ?.findLast((prompt) =>
        prompt.includes('Agent did not submit the expected night-action action'),
      )
    expect(recoveryPrompt).toContain('ability-seer-inspect')
    expect(recoveryPrompt).not.toContain('# 任务目标')
    expect(recoveryPrompt).not.toContain(getCopy('promptContext.villageVictory'))
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
        setTimeout(() => reject(new Error('Player turn did not start')), 2_000),
      ),
    ])
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20))
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
    expect(
      liveMessages.some(
        (message) =>
          message.type === 'snapshot' &&
          message.data.status === 'paused' &&
          message.data.pausedReason?.includes('Active session disposed'),
      ),
    ).toBe(false)
  })
})

class BlockingSession implements PlayerSession {
  public readonly sessionId: string
  readonly #turnStarted: () => void
  #rejectPrompt: ((reason: Error) => void) | null = null
  #closed = false

  public get connected(): boolean {
    return !this.#closed
  }

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
