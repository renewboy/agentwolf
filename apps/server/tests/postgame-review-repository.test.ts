import { afterEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import {
  MatchIdSchema,
  PlayerIdSchema,
  type PostgameReflection,
  type PostgameReviewResult,
  type PostgameReviewSubmission,
} from '@agentwolf/contracts'
import { migrateDatabase } from '../src/database-schema.js'
import {
  PostgameReviewConflictError,
  PostgameReviewSqliteRepository,
} from '../src/postgame-review-repository.js'

const databases: Database.Database[] = []
const matchId = MatchIdSchema.parse('match-postgame-repository')
const otherMatchId = MatchIdSchema.parse('match-postgame-other')
const player1 = PlayerIdSchema.parse('player-1')
const player2 = PlayerIdSchema.parse('player-2')
const score = {
  information: 7,
  communication: 7,
  decision: 7,
  objective: 7,
  adaptability: 7,
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close()
})

function createRepository() {
  const database = new Database(':memory:')
  migrateDatabase(database)
  database.pragma('foreign_keys = ON')
  const timestamp = '2026-08-28T00:00:00.000Z'
  const insert = database.prepare(
    `INSERT INTO matches
      (id, board_id, board_snapshot_json, status, setup_json, created_at, updated_at, paused_reason)
     VALUES (?, ?, NULL, 'ended', '{}', ?, ?, NULL)`,
  )
  insert.run(matchId, 'board-test', timestamp, timestamp)
  insert.run(otherMatchId, 'board-test', timestamp, timestamp)
  databases.push(database)
  return new PostgameReviewSqliteRepository(database)
}

function countdown(repository: ReturnType<typeof createRepository>, id = matchId) {
  return repository.createCountdown({
    matchId: id,
    terminalSequence: 10,
    winningPlayerIds: [player1],
    losingPlayerIds: [player2],
    decisionDeadlineAt: '2026-08-28T00:01:00.000Z',
  })
}

function submission(reviewerId = player1): PostgameReviewSubmission {
  const other = reviewerId === player1 ? player2 : player1
  return {
    matchId,
    reviewerId,
    mvpPlayerId: player1,
    svpPlayerId: player2,
    ratings: [{ playerId: other, scores: score }],
    submittedAt: '2026-08-28T00:00:30.000Z',
  }
}

const result = {
  mvp: { playerId: player1, votes: 2, resolvedBy: 'votes' },
  svp: { playerId: player2, votes: 2, resolvedBy: 'votes' },
  players: [
    { playerId: player1, scores: score, overall: 7, ratingCount: 1 },
    { playerId: player2, scores: score, overall: 7, ratingCount: 1 },
  ],
  completedAt: '2026-08-28T00:00:45.000Z',
} as PostgameReviewResult

function reflection(playerId = player1): PostgameReflection {
  return {
    matchId,
    playerId,
    seat: playerId === player1 ? 1 : 2,
    text: `reflection-${playerId}`,
    speechSequence: playerId === player1 ? 11 : 12,
    occurredAt: '2026-08-28T00:00:50.000Z',
  }
}

describe('PostgameReviewSqliteRepository state transitions', () => {
  it('creates idempotent countdowns, lists active records, and exposes empty/read views', () => {
    const repository = createRepository()
    expect(repository.get(matchId)).toBeNull()
    expect(repository.view(matchId)).toBeNull()
    expect(repository.listActive()).toEqual([])
    const created = countdown(repository)
    expect(countdown(repository)).toEqual(created)
    expect(repository.get(matchId)).toEqual(created)
    expect(repository.listActive()).toHaveLength(1)
    expect(repository.view(matchId)).toMatchObject({
      state: 'countdown',
      submittedCount: 0,
      totalPlayers: 2,
      submissions: [],
      reflections: [],
    })
  })

  it('starts, pauses, resumes, begins speaking, sets speakers, and completes idempotently', () => {
    const repository = createRepository()
    countdown(repository)
    expect(repository.start(matchId).state).toBe('collecting')
    expect(repository.start(matchId).state).toBe('collecting')
    expect(() => repository.skip(matchId)).toThrow(PostgameReviewConflictError)
    expect(repository.setCurrentSpeaker(matchId, player1).currentSpeakerId).toBeNull()
    expect(() => repository.complete(matchId)).toThrow(/cannot complete/)

    expect(repository.pause(matchId, 'collecting', 'pause reason')).toMatchObject({
      state: 'paused',
      resumeState: 'collecting',
      pausedReason: 'pause reason',
    })
    expect(repository.resume(matchId).state).toBe('collecting')
    expect(repository.resume(matchId).state).toBe('collecting')
    expect(repository.beginSpeaking(matchId, result).state).toBe('speaking')
    expect(repository.beginSpeaking(matchId, result).result).toEqual(result)
    expect(repository.setCurrentSpeaker(matchId, player2).currentSpeakerId).toBe(player2)
    expect(repository.complete(matchId).state).toBe('completed')
    expect(repository.complete(matchId).state).toBe('completed')
    expect(repository.pause(matchId, 'speaking', 'ignored').state).toBe('completed')
    expect(repository.setCurrentSpeaker(matchId, player1).state).toBe('completed')
    expect(repository.listActive()).toEqual([])
  })

  it('skips only countdowns and rejects starting skipped or speaking from invalid states', () => {
    const repository = createRepository()
    countdown(repository)
    expect(repository.skip(matchId).state).toBe('skipped')
    expect(repository.skip(matchId).state).toBe('skipped')
    expect(() => repository.start(matchId)).toThrow(/was skipped/)
    expect(repository.pause(matchId, 'collecting', 'ignored').state).toBe('skipped')
    expect(() => repository.beginSpeaking(matchId, result)).toThrow(/cannot begin speaking/)

    countdown(repository, otherMatchId)
    expect(() => repository.beginSpeaking(otherMatchId, result)).toThrow(/countdown/)
    expect(() => repository.start(MatchIdSchema.parse('match-postgame-missing'))).toThrow(
      /has no postgame review/,
    )
  })
})

describe('PostgameReviewSqliteRepository artifacts', () => {
  it('saves, sorts, deduplicates, and conflicts submissions', () => {
    const repository = createRepository()
    countdown(repository)
    expect(() => repository.saveSubmission(submission())).toThrow(/not collecting/)
    repository.start(matchId)
    expect(repository.submission(matchId, player1)).toBeNull()
    const first = repository.saveSubmission(submission(player1))
    expect(
      repository.saveSubmission({ ...first, submittedAt: '2026-08-28T00:00:40.000Z' }),
    ).toEqual(first)
    expect(() => repository.saveSubmission({ ...first, mvpPlayerId: player2 })).toThrow(
      /different postgame review/,
    )
    repository.saveSubmission(submission(player2))
    expect(repository.listSubmissions(matchId).map(({ reviewerId }) => reviewerId)).toEqual([
      player1,
      player2,
    ])
    expect(repository.submission(matchId, player1)).toEqual(first)
    expect(repository.view(matchId)).toMatchObject({ submittedCount: 2 })
  })

  it('saves, orders, deduplicates, and conflicts reflections', () => {
    const repository = createRepository()
    countdown(repository)
    repository.start(matchId)
    expect(() => repository.saveReflection(reflection())).toThrow(/not accepting reflections/)
    repository.beginSpeaking(matchId, result)
    expect(repository.reflection(matchId, player1)).toBeNull()
    const second = repository.saveReflection(reflection(player2))
    const first = repository.saveReflection(reflection(player1))
    expect(repository.saveReflection(first)).toEqual(first)
    expect(() => repository.saveReflection({ ...first, text: 'different' })).toThrow(
      /different postgame reflection/,
    )
    expect(repository.listReflections(matchId)).toEqual([first, second])
    expect(repository.reflection(matchId, player2)).toEqual(second)
  })

  it('tracks retryable submission/reflection turns and missing-turn failures', () => {
    const repository = createRepository()
    countdown(repository)
    expect(repository.turn(matchId, player1, 'submission')).toBeNull()
    expect(() => repository.failTurn(matchId, player1, 'submission', 'missing', false)).toThrow(
      /Missing postgame submission turn/,
    )
    expect(() => repository.completeTurn(matchId, player1, 'reflection')).toThrow(
      /Missing postgame reflection turn/,
    )
    const first = repository.beginTurn(matchId, player1, 'submission')
    expect(first).toMatchObject({ state: 'running', attempts: 1, uncertainFailures: 0 })
    expect(
      repository.failTurn(matchId, player1, 'submission', new Error('uncertain'), true),
    ).toMatchObject({
      state: 'failed',
      uncertainFailures: 1,
      lastError: 'uncertain',
    })
    const retry = repository.beginTurn(matchId, player1, 'submission')
    expect(retry).toMatchObject({ attempts: 2, uncertainFailures: 1, startedAt: first.startedAt })
    expect(repository.failTurn(matchId, player1, 'submission', 'plain', false)).toMatchObject({
      uncertainFailures: 1,
      lastError: 'plain',
    })
    repository.beginTurn(matchId, player1, 'submission')
    expect(repository.completeTurn(matchId, player1, 'submission')).toMatchObject({
      state: 'completed',
      lastError: null,
      completedAt: expect.any(String),
    })
    expect(repository.beginTurn(matchId, player2, 'reflection')).toMatchObject({
      kind: 'reflection',
      attempts: 1,
    })
  })
})
