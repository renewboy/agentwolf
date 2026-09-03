import type { AcpPromptCallbacks } from '@agentwolf/acp'
import {
  type MatchId,
  type MatchView,
  type Faction,
  type PlayerId,
  type PostgameReflection,
  type RoleId,
  SpeechIdSchema,
  type SpeechId,
} from '@agentwolf/contracts'
import { PostgamePromptAssets, postgameResultFor } from '@agentwolf/assets/prompts'
import { sanitizeSpeech, type GameState } from '@agentwolf/game-engine'
import type { PostgameReviewExpectation } from './action-mailbox.js'
import type { ContextEnvelope, PublicHistoryCatchup } from './context-renderer.js'
import {
  aggregatePostgameReview,
  validatePostgameReviewSubmission,
  type PostgameReviewEligibility,
} from './postgame-review-aggregate.js'
import type { PostgameReviewSqliteRepository } from './postgame-review-repository.js'
import { reflectionSequence, type PostgameReviewRecord } from './postgame-review-record.js'
import { describeError, hasUncertainDelivery, mapConcurrently } from './match-runtime-helpers.js'
import type { PlayerRuntime } from './player-runtime.js'
import type { CommittedSpeechPlaybackItem } from './speech-playback-coordinator.js'

interface PromptLabels {
  role(roleId: RoleId): string
  faction(faction: Faction): string
}

export interface PostgameReviewCoordinatorOptions {
  readonly matchId: MatchId
  readonly state: GameState
  readonly repository: PostgameReviewSqliteRepository
  readonly prompts: PostgamePromptAssets
  readonly labels: PromptLabels
  readonly terminalDay: number
  readonly terminalNight: number
  readonly winnerLabel: string
  readonly publicHistory: (playerId: PlayerId, afterSequence: number) => PublicHistoryCatchup
  readonly speechCharacterLimit: number
  readonly playerRuntime: (playerId: PlayerId) => PlayerRuntime | null
  readonly ensurePlayerSessions: () => Promise<void>
  readonly onChanged: () => void
  readonly onSpeechChunk: (speechId: SpeechId, playerId: PlayerId, text: string) => void
  readonly waitForFinalSpeech: (item: CommittedSpeechPlaybackItem) => Promise<unknown>
  readonly onTerminal: () => Promise<void>
}

export class PostgameReviewCoordinator {
  readonly #options: PostgameReviewCoordinatorOptions
  #timer: ReturnType<typeof setTimeout> | null = null
  #runPromise: Promise<void> | null = null
  #disposed = false
  #activeSpeech: MatchView['activeSpeech'] = null

  public constructor(options: PostgameReviewCoordinatorOptions) {
    this.#options = options
  }

  public get activeSpeech(): MatchView['activeSpeech'] {
    return this.#activeSpeech
  }

  public activate(): void {
    const record = this.#record()
    if (record.state === 'countdown') this.#scheduleCountdown(record)
    else if (record.state === 'collecting' || record.state === 'speaking') this.#startRun()
  }

  public start(): void {
    this.#clearTimer()
    const record = this.#options.repository.start(this.#options.matchId)
    this.#options.onChanged()
    if (record.state === 'collecting' || record.state === 'speaking') this.#startRun()
  }

  public async skip(): Promise<void> {
    this.#clearTimer()
    this.#options.repository.skip(this.#options.matchId)
    this.#options.onChanged()
    await this.#options.onTerminal()
  }

  public resume(): void {
    const record = this.#options.repository.resume(this.#options.matchId)
    this.#options.onChanged()
    if (record.state === 'collecting' || record.state === 'speaking') this.#startRun()
  }

  public async close(): Promise<void> {
    this.#disposed = true
    this.#clearTimer()
    if (this.#runPromise) await Promise.allSettled([this.#runPromise])
  }

  #startRun(): void {
    if (this.#disposed || this.#runPromise) return
    const running = this.#run().finally(() => {
      if (this.#runPromise === running) this.#runPromise = null
    })
    this.#runPromise = running
  }

  async #run(): Promise<void> {
    try {
      await this.#options.ensurePlayerSessions()
      let record = this.#record()
      if (record.state === 'collecting') {
        await this.#collectReviews(record)
        record = this.#record()
      }
      if (record.state === 'speaking') await this.#collectReflections(record)
    } catch (error) {
      if (this.#disposed) return
      const record = this.#record()
      if (record.state !== 'collecting' && record.state !== 'speaking') return
      this.#activeSpeech = null
      this.#options.repository.pause(this.#options.matchId, record.state, describeError(error))
      this.#options.onChanged()
    }
  }

  async #collectReviews(record: PostgameReviewRecord): Promise<void> {
    const eligibility = this.#eligibility(record)
    const completed = new Set(
      this.#options.repository
        .listSubmissions(this.#options.matchId)
        .map((submission) => submission.reviewerId),
    )
    const pending = eligibility.playerIds.filter((playerId) => !completed.has(playerId))
    await mapConcurrently(pending, async (playerId) => {
      await this.#collectOneReview(record, eligibility, playerId)
    })
    const submissions = this.#options.repository.listSubmissions(this.#options.matchId)
    const result = aggregatePostgameReview(eligibility, submissions)
    this.#options.repository.beginSpeaking(this.#options.matchId, result)
    this.#options.onChanged()
  }

  async #collectOneReview(
    record: PostgameReviewRecord,
    eligibility: PostgameReviewEligibility,
    playerId: PlayerId,
  ): Promise<void> {
    if (this.#options.repository.submission(this.#options.matchId, playerId)) return
    const runtime = this.#requireRuntime(playerId)
    if (runtime.status === 'failed') await runtime.recoverAuxiliaryForRetry()
    for (;;) {
      const previous = this.#options.repository.turn(this.#options.matchId, playerId, 'submission')
      this.#options.repository.beginTurn(this.#options.matchId, playerId, 'submission')
      const expectation: PostgameReviewExpectation = {
        matchId: this.#options.matchId,
        playerId,
        validate: (input) => validatePostgameReviewSubmission(eligibility, playerId, input),
        onAccepted: (submission) => {
          this.#options.repository.saveSubmission(submission)
          this.#options.onChanged()
        },
      }
      try {
        await runtime.takePostgameReview(
          this.#reviewEnvelope(record, playerId, Boolean(previous), runtime),
          expectation,
        )
        this.#options.repository.completeTurn(this.#options.matchId, playerId, 'submission')
        this.#options.onChanged()
        return
      } catch (error) {
        if (this.#disposed) throw error
        if (this.#options.repository.submission(this.#options.matchId, playerId)) {
          this.#options.repository.completeTurn(this.#options.matchId, playerId, 'submission')
          this.#options.onChanged()
          return
        }
        const uncertain = hasUncertainDelivery(error)
        const turn = this.#options.repository.failTurn(
          this.#options.matchId,
          playerId,
          'submission',
          error,
          uncertain,
        )
        if (!uncertain || turn.uncertainFailures >= 2) throw error
        await runtime.recoverAuxiliaryForRetry()
      }
    }
  }

  async #collectReflections(record: PostgameReviewRecord): Promise<void> {
    if (!record.result) throw new Error('Postgame reflection stage has no aggregate result')
    const players = this.#players()
    for (const player of players) {
      if (this.#options.repository.reflection(this.#options.matchId, player.id)) continue
      await this.#collectOneReflection(record, player.id)
    }
    const final = this.#options.repository.listReflections(this.#options.matchId).at(-1)
    if (final) {
      await this.#options.waitForFinalSpeech({
        sequence: final.speechSequence,
        playerId: final.playerId,
        event: null,
      })
    }
    this.#options.repository.complete(this.#options.matchId)
    this.#options.onChanged()
    await this.#options.onTerminal()
  }

  async #collectOneReflection(record: PostgameReviewRecord, playerId: PlayerId): Promise<void> {
    const runtime = this.#requireRuntime(playerId)
    if (runtime.status === 'failed') await runtime.recoverAuxiliaryForRetry()
    const player = this.#options.state.players.get(playerId)
    if (!player) throw new Error(`Unknown postgame reflection player ${playerId}`)
    const speechId = SpeechIdSchema.parse(reflectionSequence(record, player.seat))
    this.#options.repository.setCurrentSpeaker(this.#options.matchId, playerId)
    this.#activeSpeech = { speechId, playerId, text: '', final: false }
    this.#options.onChanged()
    for (;;) {
      const previous = this.#options.repository.turn(this.#options.matchId, playerId, 'reflection')
      this.#options.repository.beginTurn(this.#options.matchId, playerId, 'reflection')
      const callbacks: AcpPromptCallbacks = {
        onTextChunk: (text) => {
          if (this.#activeSpeech?.playerId === playerId) {
            this.#activeSpeech = {
              speechId,
              playerId,
              text: `${this.#activeSpeech.text}${text}`,
              final: false,
            }
          }
          this.#options.onSpeechChunk(speechId, playerId, text)
        },
      }
      try {
        const raw = await runtime.takePostgameSpeech(
          this.#reflectionEnvelope(record, playerId, Boolean(previous)),
          callbacks,
        )
        const sanitized = sanitizeSpeech(raw, this.#options.state.players)
        if (sanitized.unknownIds.length > 0) {
          throw new Error(`Speech contains unknown Player ID ${sanitized.unknownIds[0]}`)
        }
        const reflection: PostgameReflection = {
          matchId: this.#options.matchId,
          playerId,
          seat: player.seat,
          speechSequence: speechId,
          text: sanitized.text,
          occurredAt: new Date().toISOString(),
        }
        this.#options.repository.saveReflection(reflection)
        this.#options.repository.completeTurn(this.#options.matchId, playerId, 'reflection')
        this.#options.repository.setCurrentSpeaker(this.#options.matchId, null)
        this.#activeSpeech = null
        this.#options.onChanged()
        return
      } catch (error) {
        if (this.#disposed) throw error
        const uncertain = hasUncertainDelivery(error)
        const turn = this.#options.repository.failTurn(
          this.#options.matchId,
          playerId,
          'reflection',
          error,
          uncertain,
        )
        if (!uncertain || turn.uncertainFailures >= 2) throw error
        this.#activeSpeech = { speechId, playerId, text: '', final: false }
        this.#options.onChanged()
        await runtime.recoverAuxiliaryForRetry()
      }
    }
  }

  #reviewEnvelope(
    record: PostgameReviewRecord,
    reviewerId: PlayerId,
    continuation: boolean,
    runtime: PlayerRuntime,
  ): ContextEnvelope {
    if (continuation) {
      return this.#envelope(this.#options.prompts.reviewContinuation(), true)
    }
    const history = this.#options.publicHistory(reviewerId, runtime.acknowledgedSequence)
    const prompt = this.#options.prompts.review({
      reviewerId,
      terminalDay: this.#options.terminalDay,
      terminalNight: this.#options.terminalNight,
      winnerLabel: this.#options.winnerLabel,
      publicHistory: [...history.narration],
      roster: this.#promptRoster(),
      mvpCandidateIds: record.winningPlayerIds,
      svpCandidateIds: record.losingPlayerIds,
      ratingTargetIds: this.#players()
        .filter((player) => player.id !== reviewerId)
        .map((player) => player.id),
    })
    return this.#envelope(prompt, false, history)
  }

  #reflectionEnvelope(
    record: PostgameReviewRecord,
    playerId: PlayerId,
    continuation: boolean,
  ): ContextEnvelope {
    if (!record.result) throw new Error('Postgame reflection stage has no aggregate result')
    const reflections = this.#options.repository.listReflections(this.#options.matchId)
    const prompt = continuation
      ? this.#options.prompts.reflectionContinuation()
      : this.#options.prompts.reflection({
          playerId,
          roster: this.#promptRoster(),
          mvpPlayerId: record.result.mvp.playerId,
          svpPlayerId: record.result.svp.playerId,
          ownResult: postgameResultFor(record.result, playerId),
          priorReflections: reflections.map((reflection) => ({
            playerId: reflection.playerId,
            text: reflection.text,
          })),
          speechCharacterLimit: this.#options.speechCharacterLimit,
        })
    return this.#envelope(prompt, continuation)
  }

  #envelope(
    prompt: string,
    continuation: boolean,
    history?: PublicHistoryCatchup,
  ): ContextEnvelope {
    const terminalSequence = this.#record().terminalSequence
    if (history && history.toSequence !== terminalSequence) {
      throw new Error(
        `Postgame public history ends at ${history.toSequence}, expected ${terminalSequence}`,
      )
    }
    return {
      prompt,
      ...(history ? { fromSequence: history.fromSequence } : {}),
      toSequence: terminalSequence,
      visibleEvents: history?.events ?? [],
      gameStatus: 'ended',
      pausedReason: null,
      continuation,
    }
  }

  #promptRoster() {
    return this.#players().map((player) => {
      if (!player.roleId || !player.faction)
        throw new Error(`Player ${player.id} has no final role`)
      return {
        playerId: player.id,
        seat: player.seat,
        name: player.name,
        roleLabel: this.#options.labels.role(player.roleId),
        factionLabel: this.#options.labels.faction(player.faction),
      }
    })
  }

  #eligibility(record: PostgameReviewRecord): PostgameReviewEligibility {
    return {
      matchId: this.#options.matchId,
      playerIds: this.#players().map((player) => player.id),
      winningPlayerIds: record.winningPlayerIds,
      losingPlayerIds: record.losingPlayerIds,
    }
  }

  #players() {
    return [...this.#options.state.players.values()].sort((left, right) => left.seat - right.seat)
  }

  #requireRuntime(playerId: PlayerId): PlayerRuntime {
    const runtime = this.#options.playerRuntime(playerId)
    if (!runtime) throw new Error(`Player runtime ${playerId} is unavailable for postgame review`)
    return runtime
  }

  #record(): PostgameReviewRecord {
    const record = this.#options.repository.get(this.#options.matchId)
    if (!record) throw new Error(`Match ${this.#options.matchId} has no postgame review`)
    return record
  }

  #scheduleCountdown(record: PostgameReviewRecord): void {
    this.#clearTimer()
    if (!record.decisionDeadlineAt) throw new Error('Postgame countdown has no deadline')
    const delay = Math.max(0, Date.parse(record.decisionDeadlineAt) - Date.now())
    this.#timer = setTimeout(() => {
      this.#timer = null
      try {
        this.start()
      } catch (error) {
        this.#options.repository.pause(this.#options.matchId, 'collecting', describeError(error))
        this.#options.onChanged()
      }
    }, delay)
  }

  #clearTimer(): void {
    if (this.#timer) clearTimeout(this.#timer)
    this.#timer = null
  }
}
