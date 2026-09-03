import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AcpDeliveryUncertainError } from '@agentwolf/acp'
import { MatchIdSchema, type PlayerId } from '@agentwolf/contracts'
import { sixPlayerBoard } from '@agentwolf/game-engine'
import { createManualEngine } from '../../../packages/game-engine/tests/helpers.js'
import { migrateDatabase } from '../src/database-schema.js'
import { PostgameReviewCoordinator } from '../src/postgame-review-coordinator.js'
import { PostgameReviewSqliteRepository } from '../src/postgame-review-repository.js'

const databases: Database.Database[] = []
const matchId = MatchIdSchema.parse('match-postgame-coordinator')

afterEach(() => {
  vi.useRealTimers()
  for (const database of databases.splice(0)) database.close()
})

function repository() {
  const database = new Database(':memory:')
  migrateDatabase(database)
  database.pragma('foreign_keys = ON')
  const timestamp = '2026-08-28T00:00:00.000Z'
  database
    .prepare(
      `INSERT INTO matches
        (id, board_id, board_snapshot_json, status, setup_json, created_at, updated_at, paused_reason)
       VALUES (?, ?, NULL, 'ended', '{}', ?, ?, NULL)`,
    )
    .run(matchId, sixPlayerBoard.id, timestamp, timestamp)
  databases.push(database)
  return new PostgameReviewSqliteRepository(database)
}

function setupRepository(repo: PostgameReviewSqliteRepository) {
  const state = createManualEngine(sixPlayerBoard).state
  const players = [...state.players.values()].sort((left, right) => left.seat - right.seat)
  repo.createCountdown({
    matchId,
    terminalSequence: 10,
    winningPlayerIds: players.slice(0, 3).map(({ id }) => id),
    losingPlayerIds: players.slice(3).map(({ id }) => id),
    decisionDeadlineAt: '2026-08-28T00:01:00.000Z',
  })
  return { state, players }
}

function reviewInput(playerId: PlayerId, players: ReturnType<typeof setupRepository>['players']) {
  const winners = players.slice(0, 3).map(({ id }) => id)
  const losers = players.slice(3).map(({ id }) => id)
  return {
    mvpPlayerId: winners.find((candidate) => candidate !== playerId) ?? winners[0]!,
    svpPlayerId: losers.find((candidate) => candidate !== playerId) ?? losers[0]!,
    ratings: players
      .filter((player) => player.id !== playerId)
      .map((player) => ({
        playerId: player.id,
        scores: {
          information: 7,
          communication: 7,
          decision: 7,
          objective: 7,
          adaptability: 7,
        },
      })),
  }
}

function harness(
  options: {
    repository?: PostgameReviewSqliteRepository
    runtimeFactory?: (
      playerId: PlayerId,
      players: ReturnType<typeof setupRepository>['players'],
    ) => Record<string, unknown> | null
    ensurePlayerSessions?: () => Promise<void>
    publicHistory?: (playerId: PlayerId, afterSequence: number) => Record<string, unknown>
  } = {},
) {
  const repo = options.repository ?? repository()
  const { state, players } = setupRepository(repo)
  const runtimes = new Map<PlayerId, Record<string, unknown>>()
  const prompts = {
    review: vi.fn(() => 'review prompt'),
    reviewContinuation: vi.fn(() => 'review continuation'),
    reflection: vi.fn(() => 'reflection prompt'),
    reflectionContinuation: vi.fn(() => 'reflection continuation'),
  }
  for (const player of players) {
    const defaults = {
      status: 'ready',
      acknowledgedSequence: player.seat - 1,
      recoverAuxiliaryForRetry: vi.fn(async () => undefined),
      takePostgameReview: vi.fn(async (_envelope, expectation) => {
        expectation.onAccepted(expectation.validate(reviewInput(player.id, players)))
      }),
      takePostgameSpeech: vi.fn(async (_envelope, callbacks) => {
        callbacks?.onTextChunk?.('片段')
        return `复盘发言 ${player.seat}`
      }),
    }
    const runtime = options.runtimeFactory?.(player.id, players)
    if (runtime === null) continue
    runtimes.set(player.id, { ...defaults, ...runtime })
  }
  const onChanged = vi.fn()
  const onSpeechChunk = vi.fn()
  const waitForFinalSpeech = vi.fn(async () => undefined)
  const onTerminal = vi.fn(async () => undefined)
  const coordinator = new PostgameReviewCoordinator({
    matchId,
    state,
    repository: repo,
    prompts: prompts as never,
    labels: { role: (id) => id, faction: (value) => value },
    terminalDay: 2,
    terminalNight: 1,
    winnerLabel: '村民阵营',
    publicHistory:
      (options.publicHistory as never) ??
      ((playerId: PlayerId, afterSequence: number) => ({
        fromSequence: afterSequence + 1,
        toSequence: 10,
        events: [],
        narration: [`history ${playerId}`],
      })),
    speechCharacterLimit: 300,
    playerRuntime: (playerId) => (runtimes.get(playerId) as never) ?? null,
    ensurePlayerSessions: options.ensurePlayerSessions ?? (async () => undefined),
    onChanged,
    onSpeechChunk,
    waitForFinalSpeech,
    onTerminal,
  })
  return {
    coordinator,
    repo,
    state,
    players,
    runtimes,
    prompts,
    onChanged,
    onSpeechChunk,
    waitForFinalSpeech,
    onTerminal,
  }
}

describe('PostgameReviewCoordinator', () => {
  it('collects reviews/reflections, streams speech, reuses continuation turns, and terminates', async () => {
    const run = harness({
      runtimeFactory: (playerId, players) =>
        playerId === players[2]!.id ? { status: 'failed' } : {},
    })
    run.repo.start(matchId)
    run.repo.beginTurn(matchId, run.players[1]!.id, 'submission')
    run.repo.failTurn(matchId, run.players[1]!.id, 'submission', 'retry', false)
    run.repo.beginTurn(matchId, run.players[1]!.id, 'reflection')
    run.repo.failTurn(matchId, run.players[1]!.id, 'reflection', 'retry', false)
    run.coordinator.activate()
    await waitForState(run.repo, 'completed')
    expect(run.repo.listSubmissions(matchId)).toHaveLength(6)
    expect(run.repo.listReflections(matchId)).toHaveLength(6)
    expect(run.prompts.review).toHaveBeenCalled()
    expect(run.prompts.reviewContinuation).toHaveBeenCalled()
    expect(run.prompts.reflection).toHaveBeenCalled()
    expect(run.prompts.reflectionContinuation).toHaveBeenCalled()
    expect(run.onSpeechChunk).toHaveBeenCalledWith(11, run.players[0]!.id, '片段')
    expect(run.waitForFinalSpeech).toHaveBeenCalledWith(
      expect.objectContaining({ sequence: 16, playerId: run.players[5]!.id }),
    )
    expect(run.onTerminal).toHaveBeenCalledOnce()
    expect(run.coordinator.activeSpeech).toBeNull()
    expect(run.runtimes.get(run.players[2]!.id)?.recoverAuxiliaryForRetry).toHaveBeenCalled()
    await run.coordinator.close()
  })

  it('retries uncertain delivery, accepts an action saved before a thrown response, and recovers', async () => {
    const attempts = new Map<PlayerId, number>()
    const run = harness({
      runtimeFactory: (playerId, players) => ({
        takePostgameReview: vi.fn(async (_envelope, expectation) => {
          const attempt = (attempts.get(playerId) ?? 0) + 1
          attempts.set(playerId, attempt)
          if (playerId === players[0]!.id && attempt === 1) {
            throw new AcpDeliveryUncertainError('uncertain')
          }
          expectation.onAccepted(expectation.validate(reviewInput(playerId, players)))
          if (playerId === players[1]!.id) throw new Error('response lost after acceptance')
        }),
      }),
    })
    run.coordinator.start()
    await waitForState(run.repo, 'completed')
    expect(attempts.get(run.players[0]!.id)).toBe(2)
    expect(run.runtimes.get(run.players[0]!.id)?.recoverAuxiliaryForRetry).toHaveBeenCalled()
    expect(run.repo.listSubmissions(matchId)).toHaveLength(6)
  })

  it('starts every pending review concurrently', async () => {
    let releaseReviews: () => void = () => {}
    const reviewGate = new Promise<void>((resolve) => {
      releaseReviews = resolve
    })
    const started: PlayerId[] = []
    const run = harness({
      runtimeFactory: (playerId, players) => ({
        takePostgameReview: vi.fn(async (_envelope, expectation) => {
          started.push(playerId)
          await reviewGate
          expectation.onAccepted(expectation.validate(reviewInput(playerId, players)))
        }),
      }),
    })

    run.coordinator.start()
    await vi.waitFor(() => expect(started).toHaveLength(run.players.length))

    releaseReviews()
    await waitForState(run.repo, 'completed')
  })

  it('pauses on unavailable runtimes, session setup failures, and bad public-history bounds', async () => {
    const missing = harness({ runtimeFactory: () => null })
    missing.coordinator.start()
    await waitForState(missing.repo, 'paused')
    expect(missing.repo.get(matchId)?.pausedReason).toMatch(/runtime.*unavailable/)

    const sessions = harness({
      ensurePlayerSessions: async () => {
        throw 'session setup failed'
      },
    })
    sessions.coordinator.start()
    await waitForState(sessions.repo, 'paused')
    expect(sessions.repo.get(matchId)?.pausedReason).toBe('session setup failed')

    const history = harness({
      publicHistory: () => ({ fromSequence: 1, toSequence: 9, events: [], narration: [] }),
    })
    history.coordinator.start()
    await waitForState(history.repo, 'paused')
    expect(history.repo.get(matchId)?.pausedReason).toMatch(/expected 10/)
  })

  it('pauses reflection failures, resets active speech, and skips completed reflection records', async () => {
    const attempts = new Map<PlayerId, number>()
    const run = harness({
      runtimeFactory: (playerId, players) => ({
        takePostgameSpeech: vi.fn(async (_envelope, callbacks) => {
          callbacks?.onTextChunk?.('partial')
          const attempt = (attempts.get(playerId) ?? 0) + 1
          attempts.set(playerId, attempt)
          if (playerId === players[0]!.id && attempt === 1) {
            throw new AcpDeliveryUncertainError('uncertain reflection')
          }
          if (playerId === players[1]!.id) return 'unknown player-99'
          return `reflection ${playerId}`
        }),
      }),
    })
    run.coordinator.start()
    await waitForState(run.repo, 'paused')
    expect(attempts.get(run.players[0]!.id)).toBe(2)
    expect(run.repo.listReflections(matchId)).toHaveLength(1)
    expect(run.coordinator.activeSpeech).toBeNull()
    expect(run.repo.get(matchId)?.resumeState).toBe('speaking')
  })

  it('supports countdown activation, manual start/resume/skip, timer failure, and disposal', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-28T00:00:00.000Z'))
    const repo = repository()
    const { state, players } = setupRepository(repo)
    const onChanged = vi.fn()
    const onTerminal = vi.fn(async () => undefined)
    const options = {
      matchId,
      state,
      repository: repo,
      prompts: {} as never,
      labels: { role: (id: string) => id, faction: (value: string) => value },
      terminalDay: 1,
      terminalNight: 1,
      winnerLabel: 'winner',
      publicHistory: () => ({ fromSequence: 1, toSequence: 10, events: [], narration: [] }),
      speechCharacterLimit: 300,
      playerRuntime: () => null,
      ensurePlayerSessions: async () => {
        throw new Error('timer start failed')
      },
      onChanged,
      onSpeechChunk: vi.fn(),
      waitForFinalSpeech: vi.fn(async () => undefined),
      onTerminal,
    }
    const coordinator = new PostgameReviewCoordinator(options as never)
    coordinator.activate()
    coordinator.activate()
    actTimers(60_000)
    await Promise.resolve()
    await Promise.resolve()
    expect(repo.get(matchId)?.state).toBe('paused')

    const skippedRepo = repository()
    setupRepository(skippedRepo)
    const skipped = new PostgameReviewCoordinator({ ...options, repository: skippedRepo } as never)
    await skipped.skip()
    expect(skippedRepo.get(matchId)?.state).toBe('skipped')
    expect(onTerminal).toHaveBeenCalled()
    skipped.resume()
    await skipped.close()
    expect(players).toHaveLength(6)
  })

  it('rejects missing records and countdown deadlines', () => {
    const missingRepo = { get: () => null } as never
    const state = createManualEngine(sixPlayerBoard).state
    const coordinator = new PostgameReviewCoordinator({
      matchId,
      state,
      repository: missingRepo,
    } as never)
    expect(() => coordinator.activate()).toThrow(/has no postgame review/)

    const noDeadline = new PostgameReviewCoordinator({
      matchId,
      state,
      repository: {
        get: () => ({ state: 'countdown', decisionDeadlineAt: null }),
      },
    } as never)
    expect(() => noDeadline.activate()).toThrow(/no deadline/)
  })

  it('pauses when a terminal player has no final Role', async () => {
    const run = harness()
    const player = run.players[0]!
    ;(run.state.players as Map<PlayerId, typeof player>).set(player.id, {
      ...player,
      roleId: null,
    })
    run.coordinator.start()
    await waitForState(run.repo, 'paused')
    expect(run.repo.get(matchId)?.pausedReason).toMatch(/has no final role/)
  })
})

async function waitForState(repo: PostgameReviewSqliteRepository, state: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (repo.get(matchId)?.state === state) return
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5))
  }
  throw new Error(`Timed out waiting for postgame state ${state}; got ${repo.get(matchId)?.state}`)
}

function actTimers(milliseconds: number): void {
  vi.advanceTimersByTime(milliseconds)
}
