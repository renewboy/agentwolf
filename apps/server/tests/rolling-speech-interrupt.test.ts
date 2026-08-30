import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import type { McpServer } from '@agentclientprotocol/sdk'
import type { AcpPromptCallbacks, AcpPromptResult } from '@agentwolf/acp'
import { RoleIdSchema, type MatchId, type PlayerId } from '@agentwolf/contracts'
import { sixPlayerBoard, type BoardManifest } from '@agentwolf/game-engine'
import { afterEach, describe, expect, it } from 'vitest'
import { buildServer, type AgentWolfServer } from '../src/app.js'
import type { ActionMailbox } from '../src/action-mailbox.js'
import type { ServerConfig } from '../src/config.js'
import type { PlayerSession, PlayerSessionFactory } from '../src/player-runtime.js'
import { runOrchestrationSimulation } from '../src/simulation-orchestration.js'
import { runEngineSimulation } from '../src/simulation-runner.js'
import { auditTrajectory } from '../src/trajectory-audit.js'

const roots: string[] = []
const servers: AgentWolfServer[] = []

afterEach(async () => {
  await Promise.allSettled(servers.splice(0).map((server) => server.close()))
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('rolling public speech interrupts', () => {
  it('keeps listener prompts disabled for a legacy Match', async () => {
    const setup = await createRollingMatch({ explosionsRemaining: 0, speechDelayMs: 5 }, 'legacy')
    await waitForDaySpeechCount(setup.server, setup.matchId, 1)

    expect(
      [...setup.prompts.values()].flat().some((prompt) => prompt.includes('你正在旁听公开发言')),
    ).toBe(false)
    expect(
      setup.server.repository
        .listMatchEvents(setup.matchId)
        .some((event) => event.payload.type === 'day.interrupted'),
    ).toBe(false)
    expect(setup.server.repository.getMatch(setup.matchId)?.setup.publicSpeechInterruptMode).toBe(
      'legacy',
    )
  }, 15_000)

  it('lets a planned Werewolf self-destruct before the first public speech completes', async () => {
    const control = {
      explosionsRemaining: 1,
      speechDelayMs: 100,
      explosionDelayMs: 0,
      initialSpeechDelayMs: 100,
    }
    const setup = await createRollingMatch(control)
    const interrupted = await waitForEvent(setup.server, setup.matchId, 'day.interrupted')
    const daySpeeches = setup.server.repository
      .listMatchEvents(setup.matchId)
      .filter((event) => event.payload.type === 'speech.committed' && event.payload.kind === 'day')

    expect(interrupted).toBeDefined()
    expect(daySpeeches).toHaveLength(0)
    expect(
      [...setup.prompts.values()].flat().some((prompt) => prompt.includes('你正在旁听公开发言')),
    ).toBe(true)
    expect(setup.server.repository.getMatch(setup.matchId)?.setup.publicSpeechInterruptMode).toBe(
      'rolling',
    )
  }, 15_000)

  it('commits only the clean text already heard when a listener interrupts an active speaker', async () => {
    let signalPublicChunk!: () => void
    const publicChunk = new Promise<void>((resolvePromise) => {
      signalPublicChunk = resolvePromise
    })
    const setup = await createRollingMatch({
      explosionsRemaining: 1,
      speechDelayMs: 100,
      beforeExplosion: publicChunk,
      onPublicChunk: signalPublicChunk,
    })
    await waitForEvent(setup.server, setup.matchId, 'day.interrupted')
    const speech = setup.server.repository
      .listMatchEvents(setup.matchId)
      .find((event) => event.payload.type === 'speech.committed' && event.payload.kind === 'day')

    expect(speech?.payload.type).toBe('speech.committed')
    if (speech?.payload.type === 'speech.committed') {
      expect(speech.payload.text).toMatch(/^公开发言-/u)
    }
  }, 15_000)

  it('supersedes stale decisions and appends only newly committed public speech', async () => {
    const setup = await createRollingMatch({ explosionsRemaining: 0, speechDelayMs: 5 })
    await waitForDaySpeechCount(setup.server, setup.matchId, 4)
    const speeches = setup.server.repository
      .listMatchEvents(setup.matchId)
      .filter((event) => event.payload.type === 'speech.committed' && event.payload.kind === 'day')
      .map((event) => (event.payload.type === 'speech.committed' ? event.payload.text : ''))
    const incremental = await waitForIncrementalListenerPrompt(setup.prompts, speeches)

    expect(speeches.length).toBeGreaterThanOrEqual(4)
    expect(incremental.currentPrompt).not.toContain(incremental.previousSpeech)
    for (const history of setup.prompts.values()) {
      const listeners = history.filter((prompt) => prompt.includes('你正在旁听公开发言'))
      for (const listener of listeners) {
        expect(listener).not.toContain('当前公开存活玩家')
        expect(listener).toContain('`trigger_skill`')
        expect(listener).toContain('`pass_skill`')
        expect(listener).toContain('不要输出发言')
        expect(listener).not.toMatch(/targetPlayerId|targetPlayerIds|abilityId|option:/u)
        const appendedSpeech = speeches.find((speech) => listener.includes(speech))
        if (appendedSpeech) {
          expect(listener.indexOf('请决定是否发动')).toBeLessThan(listener.indexOf(appendedSpeech))
        }
      }
      for (const speech of speeches) {
        expect(listeners.filter((prompt) => prompt.includes(speech)).length).toBeLessThanOrEqual(1)
      }
      for (const [index, prompt] of history.entries()) {
        if (!prompt.includes('现在轮到你发言') || prompt.includes('当前是狼队私密商议')) continue
        const nextListener = history
          .slice(index + 1)
          .find((candidate) => candidate.includes('你正在旁听公开发言'))
        if (nextListener) expect(nextListener).not.toContain('本轮没有新增公开发言')
      }
    }
    expect(setup.server.matches.getMatch(setup.matchId, { kind: 'god' }).status).not.toBe('paused')
    expect(
      await auditTrajectory(setup.server.repository, setup.server.boards, setup.matchId),
    ).toMatchObject({ ok: true, issues: [] })
  }, 15_000)

  it('treats an explicit listener pass as non-blocking and reopens after the next speech', async () => {
    const setup = await createRollingMatch({
      explosionsRemaining: 0,
      speechDelayMs: 5,
      passListeners: true,
    })
    await waitForDaySpeechCount(setup.server, setup.matchId, 2)

    expect(
      [...setup.prompts.values()].flat().filter((prompt) => prompt.includes('你正在旁听公开发言'))
        .length,
    ).toBeGreaterThanOrEqual(2)
    expect(
      setup.server.repository
        .listMatchEvents(setup.matchId)
        .some((event) => event.payload.type === 'day.interrupted'),
    ).toBe(false)
  }, 15_000)

  it('reopens the day-start race after night so a pack can chain self-destructs', async () => {
    const setup = await createRollingMatch({ explosionsRemaining: 2, speechDelayMs: 100 })
    await waitForEventCount(setup.server, setup.matchId, 'day.interrupted', 2)
    await waitForCapturableMatch(setup.server, setup.matchId)
    const capture = await setup.server.simulations.capture(setup.matchId)

    expect(
      setup.server.repository
        .listMatchEvents(setup.matchId)
        .filter((event) => event.payload.type === 'day.interrupted'),
    ).toHaveLength(2)
    expect(capture.setup.publicSpeechInterruptMode).toBe('rolling')
    expect(capture.warnings).toEqual([])
  }, 30_000)

  it('replays rolling interrupts through both simulation runners', async () => {
    const setup = await createRollingMatch(
      {
        explosionsRemaining: 1,
        speechDelayMs: 100,
        sheriffCandidateId: 'player-4' as PlayerId,
        singleWolfBoard: true,
      },
      'rolling',
    )
    await waitForEventCount(setup.server, setup.matchId, 'day.interrupted', 1)
    await waitForCapturableMatch(setup.server, setup.matchId)
    const capture = await setup.server.simulations.capture(setup.matchId)
    const engine = runEngineSimulation(capture)
    const orchestration = await runOrchestrationSimulation(capture, {
      projectRoot: process.cwd(),
    })

    expect(engine).toMatchObject({ ok: true, failures: [] })
    expect(orchestration).toMatchObject({ ok: true, failures: [] })
    expect(orchestration.actual).toEqual(engine.actual)
  }, 30_000)
})

async function createRollingMatch(
  control: RollingControl,
  mode: 'legacy' | 'rolling' = 'rolling',
  board: BoardManifest = sixPlayerBoard,
): Promise<{
  server: AgentWolfServer
  matchId: MatchId
  prompts: Map<PlayerId, string[]>
}> {
  const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-rolling-interrupt-'))
  roots.push(root)
  const prompts = new Map<PlayerId, string[]>()
  let server: AgentWolfServer
  const config: ServerConfig = {
    host: '127.0.0.1',
    port: 4310,
    dataDirectory: root,
    databasePath: ':memory:',
    publicBaseUrl: 'http://127.0.0.1:4310',
    projectRoot: process.cwd(),
    webDistPath: resolve(root, 'missing'),
    developerMode: false,
    publicSpeechInterruptMode: mode,
  }
  server = await buildServer({
    config,
    sessionFactory: rollingSessionFactory(() => server.matches.mailbox, prompts, control),
  })
  servers.push(server)
  const selectedBoard = control.singleWolfBoard
    ? server.boards.create({
        name: 'Rolling single wolf simulation board',
        description: '',
        roles: [
          { roleId: RoleIdSchema.parse('role-werewolf'), count: 1 },
          { roleId: RoleIdSchema.parse('role-villager'), count: 3 },
          { roleId: RoleIdSchema.parse('role-seer'), count: 1 },
          { roleId: RoleIdSchema.parse('role-hunter'), count: 1 },
        ],
        characters: [],
        agentProfiles: [],
        sheriff: true,
        victory: 'slaughter-all',
      })
    : board
  const tool = server.catalog.createTool({
    name: 'Rolling interrupt test ACP',
    kind: 'custom',
    command: 'rolling-interrupt-test',
    args: [],
    environment: {},
    modelConfigKey: 'model',
  })
  const profile = server.catalog.createProfile({
    name: 'Rolling interrupt test player',
    toolId: tool.id,
    model: 'scripted-model',
    promptTimeoutMs: 5_000,
    connection: {},
  })
  const roles = selectedBoard.roles.flatMap(({ roleId, count }) =>
    Array.from({ length: count }, () => roleId),
  )
  const created = server.matches.createMatch({
    boardId: selectedBoard.id,
    roleAssignment: 'manual',
    seats: roles.map((roleId, index) => ({
      seat: index + 1,
      name: `Rolling player ${index + 1}`,
      profileId: profile.id,
      roleId,
    })),
  })
  server.matches.beginMatch(created.id)
  return { server, matchId: created.id, prompts }
}

interface RollingControl {
  explosionsRemaining: number
  readonly speechDelayMs: number
  readonly explosionDelayMs?: number
  readonly initialSpeechDelayMs?: number
  readonly beforeExplosion?: Promise<void>
  readonly onPublicChunk?: () => void
  readonly sheriffCandidateId?: PlayerId
  readonly singleWolfBoard?: boolean
  readonly passListeners?: boolean
  explodedDays?: Set<number>
}

function rollingSessionFactory(
  mailbox: () => ActionMailbox,
  prompts: Map<PlayerId, string[]>,
  control: RollingControl,
): PlayerSessionFactory {
  return async (options) =>
    new RollingSession(options.playerId, token(options.mcpServer), mailbox, prompts, control)
}

class RollingSession implements PlayerSession {
  public readonly sessionId: string
  readonly #playerId: PlayerId
  readonly #token: string
  readonly #mailbox: () => ActionMailbox
  readonly #prompts: Map<PlayerId, string[]>
  readonly #control: RollingControl
  #cancel: (() => void) | null = null
  #closed = false
  #speechCount = 0

  public constructor(
    playerId: PlayerId,
    tokenValue: string,
    mailbox: () => ActionMailbox,
    prompts: Map<PlayerId, string[]>,
    control: RollingControl,
  ) {
    this.#playerId = playerId
    this.#token = tokenValue
    this.#mailbox = mailbox
    this.#prompts = prompts
    this.#control = control
    this.sessionId = `rolling-${playerId}`
  }

  public get connected(): boolean {
    return !this.#closed
  }

  public finishAfterAcceptedAction(): void {}

  public cancelActivePrompt(): Promise<boolean> {
    if (!this.#cancel) return Promise.resolve(false)
    this.#cancel()
    return Promise.resolve(true)
  }

  public async prompt(
    prompt: string,
    _timeoutMs: number,
    callbacks: AcpPromptCallbacks = {},
  ): Promise<AcpPromptResult> {
    const history = this.#prompts.get(this.#playerId) ?? []
    history.push(prompt)
    this.#prompts.set(this.#playerId, history)
    const cancelled = new Promise<AcpPromptResult>((resolvePromise) => {
      this.#cancel = () =>
        resolvePromise({ text: '', stopReason: 'cancelled' as never, updates: [] })
    })
    try {
      return await Promise.race([this.#respond(prompt, callbacks), cancelled])
    } finally {
      this.#cancel = null
    }
  }

  public close(): Promise<void> {
    this.#closed = true
    this.#cancel?.()
    return Promise.resolve()
  }

  async #respond(prompt: string, callbacks: AcpPromptCallbacks): Promise<AcpPromptResult> {
    const expectation = expectedExpectation(this.#mailbox(), this.#token)
    if (prompt.includes('只回复“准备就绪”')) return result('准备就绪')
    if (prompt.includes('你正在旁听公开发言')) {
      if (claimExplosion(this.#control, expectedDay(this.#mailbox(), this.#token))) {
        if (this.#control.beforeExplosion) await this.#control.beforeExplosion
        if (this.#control.explosionDelayMs) {
          await new Promise((resolvePromise) =>
            setTimeout(resolvePromise, this.#control.explosionDelayMs),
          )
        }
        this.#mailbox().submitSkillTrigger(this.#token, 'ability-werewolf-self-destruct')
        return result('')
      }
      if (this.#control.passListeners) {
        this.#mailbox().submitSkillPass(this.#token)
        return result('')
      }
      return new Promise(() => undefined)
    }
    if (expectation?.allowedSheriffActions?.includes('join')) {
      this.#mailbox().submitSheriffAction(
        this.#token,
        this.#control.sheriffCandidateId === this.#playerId ? 'join' : 'decline',
      )
      return result('')
    }
    if (expectation?.allowedSheriffActions?.includes('speech-clockwise')) {
      this.#mailbox().submitSheriffAction(this.#token, 'speech-clockwise')
      return result('')
    }
    if (prompt.includes('现在轮到你发言')) {
      const privateCouncil = prompt.includes('当前是狼队私密商议')
      if (
        !privateCouncil &&
        !this.#control.beforeExplosion &&
        expectation?.interruptAbilityIds?.some(
          (abilityId) => abilityId === 'ability-werewolf-self-destruct',
        ) &&
        claimExplosion(this.#control, expectedDay(this.#mailbox(), this.#token))
      ) {
        this.#mailbox().submitSkillTrigger(this.#token, 'ability-werewolf-self-destruct')
        return result('')
      }
      const text = privateCouncil
        ? `狼队计划由${this.#playerId}确认。`
        : `公开发言-${this.#playerId}-${++this.#speechCount}：${'持续输出有效内容。'.repeat(12)}`
      if (privateCouncil) {
        callbacks.onTextChunk?.(text)
      } else {
        const midpoint = Math.ceil(text.length / 2)
        if (this.#control.initialSpeechDelayMs) {
          await new Promise((resolvePromise) =>
            setTimeout(resolvePromise, this.#control.initialSpeechDelayMs),
          )
        }
        callbacks.onTextChunk?.(text.slice(0, midpoint))
        this.#control.onPublicChunk?.()
        await new Promise((resolvePromise) =>
          setTimeout(resolvePromise, this.#control.speechDelayMs),
        )
        callbacks.onTextChunk?.(text.slice(midpoint))
      }
      return result(text)
    }
    if (expectation?.voteKind === 'wolf-kill') {
      this.#mailbox().submitVote(this.#token, null)
      return result('')
    }
    if (expectation?.allowedAbilityIds?.some((abilityId) => abilityId === 'ability-seer-inspect')) {
      this.#mailbox().submitNightAction(this.#token, 'ability-seer-inspect', [], 'pass')
      return result('')
    }
    if (prompt.includes('当前药剂状态')) {
      const abilityId = expectation?.allowedAbilityIds?.[0]
      if (!abilityId) throw new Error('Missing scripted Witch ability')
      this.#mailbox().submitNightAction(this.#token, abilityId, [], 'pass')
      return result('')
    }
    if (expectation?.actionType === 'vote') {
      this.#mailbox().submitVote(this.#token, null)
      return result('')
    }
    throw new Error(`Unhandled rolling Prompt for ${this.#playerId}: ${prompt}`)
  }
}

function result(text: string): AcpPromptResult {
  return { text, stopReason: 'end_turn', updates: [] }
}

function claimExplosion(control: RollingControl, day: number): boolean {
  control.explodedDays ??= new Set<number>()
  if (day === 0 || control.explosionsRemaining === 0 || control.explodedDays.has(day)) {
    return false
  }
  control.explodedDays.add(day)
  control.explosionsRemaining -= 1
  return true
}

function expectedDay(mailbox: ActionMailbox, tokenValue: string): number {
  return expectedExpectation(mailbox, tokenValue)?.day ?? 0
}

function expectedExpectation(mailbox: ActionMailbox, tokenValue: string) {
  const binding = mailbox.binding(tokenValue)
  return binding ? mailbox.peekExpectation(binding.matchId, binding.playerId) : null
}

function token(server: McpServer): string {
  if (!('headers' in server)) throw new Error('Expected HTTP MCP server')
  const authorization = server.headers.find((header) => header.name === 'Authorization')?.value
  if (!authorization?.startsWith('Bearer ')) throw new Error('Missing bearer token')
  return authorization.slice('Bearer '.length)
}

async function waitForEvent(
  server: AgentWolfServer,
  matchId: MatchId,
  eventType: string,
): Promise<unknown> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const event = server.repository
      .listMatchEvents(matchId)
      .find((candidate) => candidate.payload.type === eventType)
    if (event) return event
    const match = server.matches.getMatch(matchId, { kind: 'god' })
    if (match.status === 'paused') throw new Error(match.pausedReason ?? 'Match paused')
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10))
  }
  throw new Error(`Match did not emit ${eventType}`)
}

async function waitForDaySpeechCount(
  server: AgentWolfServer,
  matchId: MatchId,
  count: number,
): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const actual = server.repository
      .listMatchEvents(matchId)
      .filter(
        (event) => event.payload.type === 'speech.committed' && event.payload.kind === 'day',
      ).length
    if (actual >= count) return
    const match = server.matches.getMatch(matchId, { kind: 'god' })
    if (match.status === 'paused') throw new Error(match.pausedReason ?? 'Match paused')
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10))
  }
  throw new Error(`Match did not commit ${count} day speeches`)
}

async function waitForEventCount(
  server: AgentWolfServer,
  matchId: MatchId,
  eventType: string,
  count: number,
): Promise<void> {
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    const actual = server.repository
      .listMatchEvents(matchId)
      .filter((event) => event.payload.type === eventType).length
    if (actual >= count) return
    const match = server.matches.getMatch(matchId, { kind: 'god' })
    if (match.status === 'paused') throw new Error(match.pausedReason ?? 'Match paused')
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10))
  }
  throw new Error(`Match did not emit ${count} ${eventType} events`)
}

async function waitForCapturableMatch(server: AgentWolfServer, matchId: MatchId): Promise<void> {
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    const status = server.repository.getMatch(matchId)?.status
    if (status === 'ended' || status === 'paused') return
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10))
  }
  throw new Error('Match did not reach a capturable status')
}

async function waitForIncrementalListenerPrompt(
  prompts: Map<PlayerId, string[]>,
  speeches: readonly string[],
): Promise<{ previousSpeech: string; currentPrompt: string }> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    for (const history of prompts.values()) {
      const listeners = history.filter((prompt) => prompt.includes('你正在旁听公开发言'))
      for (let index = 1; index < listeners.length; index += 1) {
        const previousSpeech = speeches.find((speech) => listeners[index - 1]!.includes(speech))
        const hasNewSpeech = speeches.some(
          (speech) => speech !== previousSpeech && listeners[index]!.includes(speech),
        )
        if (previousSpeech && hasNewSpeech) {
          return { previousSpeech, currentPrompt: listeners[index]! }
        }
      }
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10))
  }
  throw new Error('Listener Prompts did not expose two incremental speech updates')
}
