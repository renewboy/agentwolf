import type Database from 'better-sqlite3'
import {
  PostgameReflectionSchema,
  PostgameReviewSubmissionSchema,
  PostgameReviewViewSchema,
  type MatchId,
  type PlayerId,
  type PostgameReflection,
  type PostgameReviewResult,
  type PostgameReviewSubmission,
  type PostgameReviewView,
} from '@agentwolf/contracts'
import {
  PostgameReviewRecordSchema,
  PostgameReviewTurnRecordSchema,
  createPostgameReviewRecord,
  withPostgameState,
  type CreatePostgameReviewInput,
  type PostgameReviewRecord,
  type PostgameReviewTurnRecord,
} from './postgame-review-record.js'

interface JsonRow {
  readonly json: string
}

export class PostgameReviewConflictError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'PostgameReviewConflictError'
  }
}

export class PostgameReviewSqliteRepository {
  public constructor(private readonly database: Database.Database) {}

  public createCountdown(input: CreatePostgameReviewInput): PostgameReviewRecord {
    const existing = this.get(input.matchId)
    if (existing) return existing
    const record = createPostgameReviewRecord(input)
    this.database
      .prepare(
        `INSERT INTO postgame_reviews (match_id, json, updated_at)
         VALUES (?, ?, ?)`,
      )
      .run(record.matchId, JSON.stringify(record), record.updatedAt)
    return record
  }

  public get(matchId: MatchId): PostgameReviewRecord | null {
    const row = this.database
      .prepare('SELECT json FROM postgame_reviews WHERE match_id = ?')
      .get(matchId) as JsonRow | undefined
    return row ? PostgameReviewRecordSchema.parse(JSON.parse(row.json)) : null
  }

  public listActive(): PostgameReviewRecord[] {
    const rows = this.database
      .prepare('SELECT json FROM postgame_reviews ORDER BY updated_at ASC')
      .all() as JsonRow[]
    return rows
      .map((row) => PostgameReviewRecordSchema.parse(JSON.parse(row.json)))
      .filter((record) => !['completed', 'skipped'].includes(record.state))
  }

  public start(matchId: MatchId): PostgameReviewRecord {
    return this.#mutate(matchId, (record) => {
      if (record.state === 'skipped') {
        throw new PostgameReviewConflictError('Postgame review was skipped')
      }
      if (record.state !== 'countdown') return record
      return withPostgameState(record, 'collecting')
    })
  }

  public skip(matchId: MatchId): PostgameReviewRecord {
    return this.#mutate(matchId, (record) => {
      if (record.state === 'skipped') return record
      if (record.state !== 'countdown') {
        throw new PostgameReviewConflictError('Postgame review cannot be skipped after it starts')
      }
      return withPostgameState(record, 'skipped')
    })
  }

  public pause(
    matchId: MatchId,
    resumeState: 'collecting' | 'speaking',
    reason: string,
  ): PostgameReviewRecord {
    return this.#mutate(matchId, (record) => {
      if (record.state === 'completed' || record.state === 'skipped') return record
      return withPostgameState(record, 'paused', { resumeState, pausedReason: reason })
    })
  }

  public resume(matchId: MatchId): PostgameReviewRecord {
    return this.#mutate(matchId, (record) => {
      if (record.state !== 'paused') return record
      if (!record.resumeState) throw new Error(`Postgame review ${matchId} has no resume state`)
      return withPostgameState(record, record.resumeState, {
        result: record.result,
        currentSpeakerId: null,
      })
    })
  }

  public beginSpeaking(matchId: MatchId, result: PostgameReviewResult): PostgameReviewRecord {
    return this.#mutate(matchId, (record) => {
      if (record.state === 'speaking' && record.result) return record
      if (record.state !== 'collecting') {
        throw new PostgameReviewConflictError(
          `Postgame review cannot begin speaking from ${record.state}`,
        )
      }
      return withPostgameState(record, 'speaking', { result })
    })
  }

  public setCurrentSpeaker(matchId: MatchId, playerId: PlayerId | null): PostgameReviewRecord {
    return this.#mutate(matchId, (record) => {
      if (record.state !== 'speaking') return record
      return withPostgameState(record, 'speaking', {
        result: record.result,
        currentSpeakerId: playerId,
      })
    })
  }

  public complete(matchId: MatchId): PostgameReviewRecord {
    return this.#mutate(matchId, (record) => {
      if (record.state === 'completed') return record
      if (record.state !== 'speaking') {
        throw new PostgameReviewConflictError(
          `Postgame review cannot complete from ${record.state}`,
        )
      }
      return withPostgameState(record, 'completed', { result: record.result })
    })
  }

  public saveSubmission(submission: PostgameReviewSubmission): PostgameReviewSubmission {
    const parsed = PostgameReviewSubmissionSchema.parse(submission)
    const review = this.#require(parsed.matchId)
    if (review.state !== 'collecting') {
      throw new PostgameReviewConflictError(
        `Postgame review is not collecting submissions (${review.state})`,
      )
    }
    const existing = this.submission(parsed.matchId, parsed.reviewerId)
    if (existing) {
      if (sameSubmission(existing, parsed)) return existing
      throw new PostgameReviewConflictError(
        `Player ${parsed.reviewerId} already submitted a different postgame review`,
      )
    }
    this.database
      .prepare(
        `INSERT INTO postgame_review_submissions
          (match_id, reviewer_id, json, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(parsed.matchId, parsed.reviewerId, JSON.stringify(parsed), parsed.submittedAt)
    return parsed
  }

  public submission(matchId: MatchId, reviewerId: PlayerId): PostgameReviewSubmission | null {
    const row = this.database
      .prepare(
        'SELECT json FROM postgame_review_submissions WHERE match_id = ? AND reviewer_id = ?',
      )
      .get(matchId, reviewerId) as JsonRow | undefined
    return row ? PostgameReviewSubmissionSchema.parse(JSON.parse(row.json)) : null
  }

  public listSubmissions(matchId: MatchId): PostgameReviewSubmission[] {
    const rows = this.database
      .prepare('SELECT json FROM postgame_review_submissions WHERE match_id = ?')
      .all(matchId) as JsonRow[]
    return rows
      .map((row) => PostgameReviewSubmissionSchema.parse(JSON.parse(row.json)))
      .sort((left, right) => playerOrder(left.reviewerId) - playerOrder(right.reviewerId))
  }

  public saveReflection(reflection: PostgameReflection): PostgameReflection {
    const parsed = PostgameReflectionSchema.parse(reflection)
    const review = this.#require(parsed.matchId)
    if (review.state !== 'speaking') {
      throw new PostgameReviewConflictError(
        `Postgame review is not accepting reflections (${review.state})`,
      )
    }
    const existing = this.reflection(parsed.matchId, parsed.playerId)
    if (existing) {
      if (JSON.stringify(existing) === JSON.stringify(parsed)) return existing
      throw new PostgameReviewConflictError(
        `Player ${parsed.playerId} already has a different postgame reflection`,
      )
    }
    this.database
      .prepare(
        `INSERT INTO postgame_review_reflections
          (match_id, player_id, ordinal, json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(parsed.matchId, parsed.playerId, parsed.seat, JSON.stringify(parsed), parsed.occurredAt)
    return parsed
  }

  public reflection(matchId: MatchId, playerId: PlayerId): PostgameReflection | null {
    const row = this.database
      .prepare('SELECT json FROM postgame_review_reflections WHERE match_id = ? AND player_id = ?')
      .get(matchId, playerId) as JsonRow | undefined
    return row ? PostgameReflectionSchema.parse(JSON.parse(row.json)) : null
  }

  public listReflections(matchId: MatchId): PostgameReflection[] {
    const rows = this.database
      .prepare(
        'SELECT json FROM postgame_review_reflections WHERE match_id = ? ORDER BY ordinal ASC',
      )
      .all(matchId) as JsonRow[]
    return rows.map((row) => PostgameReflectionSchema.parse(JSON.parse(row.json)))
  }

  public beginTurn(
    matchId: MatchId,
    playerId: PlayerId,
    kind: PostgameReviewTurnRecord['kind'],
  ): PostgameReviewTurnRecord {
    const existing = this.turn(matchId, playerId, kind)
    const timestamp = new Date().toISOString()
    const next = PostgameReviewTurnRecordSchema.parse({
      schemaVersion: 1,
      matchId,
      playerId,
      kind,
      state: 'running',
      attempts: (existing?.attempts ?? 0) + 1,
      uncertainFailures: existing?.uncertainFailures ?? 0,
      lastError: null,
      startedAt: existing?.startedAt ?? timestamp,
      completedAt: null,
      updatedAt: timestamp,
    })
    return this.#saveTurn(next)
  }

  public failTurn(
    matchId: MatchId,
    playerId: PlayerId,
    kind: PostgameReviewTurnRecord['kind'],
    error: unknown,
    uncertain: boolean,
  ): PostgameReviewTurnRecord {
    const current = this.#requireTurn(matchId, playerId, kind)
    return this.#saveTurn(
      PostgameReviewTurnRecordSchema.parse({
        ...current,
        state: 'failed',
        uncertainFailures: current.uncertainFailures + (uncertain ? 1 : 0),
        lastError: error instanceof Error ? error.message : String(error),
        updatedAt: new Date().toISOString(),
      }),
    )
  }

  public completeTurn(
    matchId: MatchId,
    playerId: PlayerId,
    kind: PostgameReviewTurnRecord['kind'],
  ): PostgameReviewTurnRecord {
    const current = this.#requireTurn(matchId, playerId, kind)
    const timestamp = new Date().toISOString()
    return this.#saveTurn(
      PostgameReviewTurnRecordSchema.parse({
        ...current,
        state: 'completed',
        lastError: null,
        completedAt: timestamp,
        updatedAt: timestamp,
      }),
    )
  }

  public turn(
    matchId: MatchId,
    playerId: PlayerId,
    kind: PostgameReviewTurnRecord['kind'],
  ): PostgameReviewTurnRecord | null {
    const row = this.database
      .prepare(
        `SELECT json FROM postgame_review_turns
         WHERE match_id = ? AND player_id = ? AND kind = ?`,
      )
      .get(matchId, playerId, kind) as JsonRow | undefined
    return row ? PostgameReviewTurnRecordSchema.parse(JSON.parse(row.json)) : null
  }

  public view(matchId: MatchId): PostgameReviewView | null {
    const record = this.get(matchId)
    if (!record) return null
    const submissions = this.listSubmissions(matchId)
    return PostgameReviewViewSchema.parse({
      state: record.state,
      decisionDeadlineAt: record.decisionDeadlineAt,
      startedAt: record.startedAt,
      winningPlayerIds: record.winningPlayerIds,
      losingPlayerIds: record.losingPlayerIds,
      submittedCount: submissions.length,
      totalPlayers: record.winningPlayerIds.length + record.losingPlayerIds.length,
      currentSpeakerId: record.currentSpeakerId,
      submissions,
      result: record.result,
      reflections: this.listReflections(matchId),
      pausedReason: record.pausedReason,
    })
  }

  #require(matchId: MatchId): PostgameReviewRecord {
    const record = this.get(matchId)
    if (!record) throw new Error(`Match ${matchId} has no postgame review`)
    return record
  }

  #mutate(
    matchId: MatchId,
    mutate: (record: PostgameReviewRecord) => PostgameReviewRecord,
  ): PostgameReviewRecord {
    return this.database.transaction(() => {
      const current = this.#require(matchId)
      const next = PostgameReviewRecordSchema.parse(mutate(current))
      if (JSON.stringify(next) === JSON.stringify(current)) return current
      const result = this.database
        .prepare(`UPDATE postgame_reviews SET json = ?, updated_at = ? WHERE match_id = ?`)
        .run(JSON.stringify(next), next.updatedAt, matchId)
      if (result.changes !== 1) throw new Error(`Missing postgame review ${matchId}`)
      return next
    })()
  }

  #saveTurn(turn: PostgameReviewTurnRecord): PostgameReviewTurnRecord {
    const parsed = PostgameReviewTurnRecordSchema.parse(turn)
    this.database
      .prepare(
        `INSERT INTO postgame_review_turns (match_id, player_id, kind, json, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(match_id, player_id, kind) DO UPDATE SET
           json = excluded.json,
           updated_at = excluded.updated_at`,
      )
      .run(parsed.matchId, parsed.playerId, parsed.kind, JSON.stringify(parsed), parsed.updatedAt)
    return parsed
  }

  #requireTurn(
    matchId: MatchId,
    playerId: PlayerId,
    kind: PostgameReviewTurnRecord['kind'],
  ): PostgameReviewTurnRecord {
    const turn = this.turn(matchId, playerId, kind)
    if (!turn) throw new Error(`Missing postgame ${kind} turn for ${matchId}/${playerId}`)
    return turn
  }
}

function sameSubmission(left: PostgameReviewSubmission, right: PostgameReviewSubmission): boolean {
  return (
    left.matchId === right.matchId &&
    left.reviewerId === right.reviewerId &&
    left.mvpPlayerId === right.mvpPlayerId &&
    left.svpPlayerId === right.svpPlayerId &&
    JSON.stringify(left.ratings) === JSON.stringify(right.ratings)
  )
}

function playerOrder(playerId: PlayerId): number {
  return Number.parseInt(playerId.slice('player-'.length), 10)
}
