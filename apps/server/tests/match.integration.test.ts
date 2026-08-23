import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import type { McpServer } from '@agentclientprotocol/sdk'
import {
  AgentProfileInputSchema,
  AgentToolInputSchema,
  type LiveMessage,
  type MatchId,
  type MatchView,
  type PlayerId,
} from '@agentwolf/contracts'
import {
  AcpDeliveryUncertainError,
  type AcpPromptCallbacks,
  type AcpPromptResult,
} from '@agentwolf/acp'
import { formatCopy, getCopy } from '@agentwolf/assets'
import { sixPlayerBoard, standardBoard } from '@agentwolf/game-engine'
import { afterEach, describe, expect, it } from 'vitest'
import type { ActionMailbox } from '../src/action-mailbox.js'
import { buildServer, type AgentWolfServer } from '../src/app.js'
import type { ServerConfig } from '../src/config.js'
import type { PlayerSession, PlayerSessionFactory } from '../src/player-runtime.js'
import { auditTrajectory } from '../src/trajectory-audit.js'

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
    const sessionFactory: PlayerSessionFactory = async (options) =>
      new ScriptedSession(
        options.playerId,
        extractToken(options.mcpServer),
        () => server.matches.mailbox,
        prompts,
      )
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
    const sessionFactory: PlayerSessionFactory = async (options) =>
      new ScriptedSession(
        options.playerId,
        extractToken(options.mcpServer),
        () => server.matches.mailbox,
        prompts,
      )
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
    const sessionFactory: PlayerSessionFactory = async (options) =>
      new ScriptedSession(
        options.playerId,
        extractToken(options.mcpServer),
        () => server.matches.mailbox,
        prompts,
      )
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
    const villagerView = server.matches.getMatch(created.id, {
      kind: 'player',
      playerId: 'player-5' as PlayerId,
    })
    expect(villagerView.seats.filter((seat) => seat.roleId !== undefined)).toHaveLength(12)
    expect(villagerView.seats.every((seat) => seat.sessionStatus === 'closed')).toBe(true)

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
    expect(await auditTrajectory(server.repository, server.boards, created.id)).toMatchObject({
      ok: true,
      issues: [],
    })
  }, 15_000)

  it('recovers a rejected six-player Seer action without replaying prior context', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-recovery-'))
    temporaryDirectories.push(root)
    let server: AgentWolfServer
    const prompts = new Map<PlayerId, string[]>()
    const invalidSeerOnce = { value: true }
    const uncertainSpeechOnce = { playerId: 'player-3' as PlayerId, value: true }
    const sessionFactory: PlayerSessionFactory = async (options) =>
      new ScriptedSession(
        options.playerId,
        extractToken(options.mcpServer),
        () => server.matches.mailbox,
        prompts,
        invalidSeerOnce,
        uncertainSpeechOnce,
      )
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

    const paused = await waitForMatch(server, created.id)
    expect(paused.status).toBe('paused')
    expect(paused.pausedReason).toContain('phase-night-seer requires ability-seer-inspect')
    const seerId = `player-${roles.indexOf('role-seer') + 1}` as PlayerId
    expect(
      prompts
        .get(seerId)
        ?.find(
          (prompt) => prompt.includes('ability-seer-inspect') && prompt.includes('targetPlayerIds'),
        ),
    ).toBeDefined()

    await server.matches.resumeMatch(created.id)
    const resumed = await waitForMatchState(server, created.id, (match) =>
      match.timeline.some((item) => item.kind === 'seer.inspected'),
    )
    expect(resumed.day).toBeGreaterThanOrEqual(1)
    expect(resumed.phaseId).not.toBe('phase-night-seer')
    const seerTurns =
      prompts
        .get(seerId)
        ?.filter(
          (prompt) => prompt.includes('ability-seer-inspect') && prompt.includes('targetPlayerIds'),
        ) ?? []
    expect(seerTurns).toHaveLength(2)
    expect(seerTurns[1]).toContain(getCopy('narration.matchResumed'))
    expect(seerTurns[1]).not.toContain(getCopy('phases.nightWolfCouncil'))
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
    ).toHaveLength(1)
    await waitForMatch(server, created.id)
  })

  it('rebuilds replacement sessions and resumes a paused match after server restart', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-restart-recovery-'))
    temporaryDirectories.push(root)
    let server: AgentWolfServer
    const prompts = new Map<PlayerId, string[]>()
    const invalidSeerOnce = { value: true }
    const sessionFactory: PlayerSessionFactory = async (options) =>
      new ScriptedSession(
        options.playerId,
        extractToken(options.mcpServer),
        () => server.matches.mailbox,
        prompts,
        invalidSeerOnce,
      )
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
      'phase-night-seer requires ability-seer-inspect',
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
    const recoveryFoundation = prompts
      .get(seerId)
      ?.findLast((prompt) => prompt.includes('phase-night-seer requires ability-seer-inspect'))
    expect(recoveryFoundation).toContain(getCopy('phases.nightWolfCouncil'))
    expect(recoveryFoundation).toContain(getCopy('promptContext.villageVictory'))
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

class ScriptedSession implements PlayerSession {
  public readonly sessionId: string
  readonly #playerId: PlayerId
  readonly #token: string
  readonly #mailbox: () => ActionMailbox
  readonly #prompts: Map<PlayerId, string[]>
  readonly #invalidSeerOnce?: { value: boolean }
  readonly #uncertainSpeechOnce?: { playerId: PlayerId; value: boolean }
  #night = 1

  public constructor(
    playerId: PlayerId,
    token: string,
    mailbox: () => ActionMailbox,
    prompts: Map<PlayerId, string[]>,
    invalidSeerOnce?: { value: boolean },
    uncertainSpeechOnce?: { playerId: PlayerId; value: boolean },
  ) {
    this.#playerId = playerId
    this.#token = token
    this.#mailbox = mailbox
    this.#prompts = prompts
    this.#invalidSeerOnce = invalidSeerOnce
    this.#uncertainSpeechOnce = uncertainSpeechOnce
    this.sessionId = `scripted-${playerId}`
  }

  public async prompt(
    prompt: string,
    _timeoutMs: number,
    callbacks: AcpPromptCallbacks = {},
  ): Promise<AcpPromptResult> {
    const history = this.#prompts.get(this.#playerId) ?? []
    history.push(prompt)
    this.#prompts.set(this.#playerId, history)
    this.#night = lastNumber(prompt, /第 (\d+) 夜/g) ?? this.#night
    if (prompt.includes('现在轮到你发言')) {
      if (
        this.#uncertainSpeechOnce?.value &&
        this.#uncertainSpeechOnce.playerId === this.#playerId
      ) {
        this.#uncertainSpeechOnce.value = false
        const error = new Error('simulated ACP disconnect')
        error.name = AcpDeliveryUncertainError.name
        throw error
      }
      const text = `我是 ${this.#playerId.replace('player-', '')} 号玩家，这一轮选择弃票。`
      const onTextChunk = callbacks.onTextChunk
      onTextChunk?.(text.slice(0, 8))
      onTextChunk?.(text.slice(8))
      return { text, stopReason: 'end_turn' as const, updates: [] }
    }
    if (prompt.includes('准备就绪')) {
      return { text: '准备就绪', stopReason: 'end_turn' as const, updates: [] }
    }
    const phase = latestPhase(prompt)
    if (phase === 'sheriffSignup') this.#mailbox().submitSheriffAction(this.#token, 'decline')
    else if (phase === 'nightWolfVote') {
      this.#mailbox().submitVote(this.#token, `player-${4 + this.#night}`)
    } else if (phase === 'dayVote') this.#mailbox().submitVote(this.#token, null)
    else if (phase === 'nightWitch') {
      this.#mailbox().submitNightAction(this.#token, 'ability-witch-antidote', [], 'pass')
    } else if (phase === 'nightSeer') {
      if (this.#invalidSeerOnce?.value) {
        this.#invalidSeerOnce.value = false
        this.#mailbox().submitNightAction(this.#token, 'ability-guard-protect', ['player-1'])
      } else {
        this.#mailbox().submitNightAction(this.#token, 'ability-seer-inspect', ['player-1'])
      }
    }
    if (phase) return { text: '', stopReason: 'end_turn' as const, updates: [] }
    throw new Error(`Unhandled scripted prompt for ${this.#playerId}: ${prompt}`)
  }

  public close(): Promise<void> {
    return Promise.resolve()
  }
}

class BlockingSession implements PlayerSession {
  public readonly sessionId: string
  readonly #turnStarted: () => void
  #rejectPrompt: ((reason: Error) => void) | null = null

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
    this.#rejectPrompt?.(new Error('Active session disposed'))
    this.#rejectPrompt = null
    return Promise.resolve()
  }
}

function extractToken(server: McpServer): string {
  if (!('headers' in server)) throw new Error('Expected HTTP MCP server')
  const header = server.headers.find((entry) => entry.name === 'Authorization')
  if (!header?.value.startsWith('Bearer ')) throw new Error('Missing bearer token')
  return header.value.slice('Bearer '.length)
}

function lastNumber(text: string, pattern: RegExp): number | null {
  const matches = [...text.matchAll(pattern)]
  const value = matches.at(-1)?.[1]
  return value ? Number(value) : null
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

function latestPhase(prompt: string): string | null {
  if (prompt.includes('ability-seer-inspect')) return 'nightSeer'
  if (prompt.includes('ability-witch-antidote')) return 'nightWitch'
  const phases = ['sheriffSignup', 'nightWolfVote', 'dayVote', 'nightWitch', 'nightSeer'] as const
  const ranked = phases
    .map((phase) => ({ phase, index: prompt.lastIndexOf(getCopy(`phases.${phase}`)) }))
    .filter((entry) => entry.index >= 0)
    .sort((left, right) => right.index - left.index)
  return ranked[0]?.phase ?? null
}
