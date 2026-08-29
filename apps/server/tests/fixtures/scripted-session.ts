import type { McpServer } from '@agentclientprotocol/sdk'
import type { PlayerId } from '@agentwolf/contracts'
import {
  AcpDeliveryUncertainError,
  type AcpPromptCallbacks,
  type AcpPromptResult,
} from '@agentwolf/acp'
import type { ActionMailbox } from '../../src/action-mailbox.js'
import type { PlayerSession, PlayerSessionFactory } from '../../src/player-runtime.js'

export interface ScriptedSessionOptions {
  readonly prompts: Map<PlayerId, string[]>
  readonly mailbox: () => ActionMailbox
  readonly seerFault?: ScriptedSeerFault
  readonly uncertainSpeechOnce?: { playerId: PlayerId; value: boolean; disconnect?: boolean }
  readonly sessionStarts?: Array<{ playerId: PlayerId; resumeSessionId: string | null }>
  readonly failResumeFor?: PlayerId
  readonly uncertainBootstrapOnce?: { playerId: PlayerId; value: boolean; disconnect?: boolean }
  readonly sheriffSelfDestructOnce?: { playerId: PlayerId; value: boolean }
  readonly postgameReviewContexts?: Map<PlayerId, ScriptedPostgameReviewContext>
  readonly postgameReviewGate?: {
    readonly playerId: PlayerId
    readonly started: () => void
    readonly release: Promise<void>
  }
}

export interface ScriptedPostgameReviewContext {
  readonly playerIds: readonly PlayerId[]
  readonly mvpCandidates: readonly PlayerId[]
  readonly svpCandidates: readonly PlayerId[]
}

export interface ScriptedSeerFault {
  value: boolean
  readonly behavior: 'correct-in-turn' | 'omit'
  readonly rejectedReasons?: string[]
}

export function scriptedSessionFactory(options: ScriptedSessionOptions): PlayerSessionFactory {
  return async (session) => {
    const expectedSessionId = `scripted-${session.playerId}`
    if (session.resumeSessionId && session.resumeSessionId !== expectedSessionId) {
      throw new Error(
        `Expected resume of ${expectedSessionId}, received ${session.resumeSessionId}`,
      )
    }
    options.sessionStarts?.push({
      playerId: session.playerId,
      resumeSessionId: session.resumeSessionId ?? null,
    })
    if (session.resumeSessionId && options.failResumeFor === session.playerId) {
      throw new Error(`simulated resume failure for ${session.playerId}`)
    }
    return new ScriptedSession(
      session.playerId,
      extractToken(session.mcpServer),
      options.mailbox,
      options.prompts,
      options.seerFault,
      options.uncertainSpeechOnce,
      options.uncertainBootstrapOnce,
      options.sheriffSelfDestructOnce,
      options.postgameReviewContexts,
      options.postgameReviewGate,
    )
  }
}

export class ScriptedSession implements PlayerSession {
  public readonly sessionId: string
  readonly #playerId: PlayerId
  readonly #token: string
  readonly #mailbox: () => ActionMailbox
  readonly #prompts: Map<PlayerId, string[]>
  readonly #seerFault: ScriptedSeerFault | undefined
  readonly #uncertainSpeechOnce:
    | { playerId: PlayerId; value: boolean; disconnect?: boolean }
    | undefined
  readonly #uncertainBootstrapOnce:
    | { playerId: PlayerId; value: boolean; disconnect?: boolean }
    | undefined
  readonly #sheriffSelfDestructOnce: { playerId: PlayerId; value: boolean } | undefined
  readonly #postgameReviewContexts: Map<PlayerId, ScriptedPostgameReviewContext> | undefined
  readonly #postgameReviewGate: ScriptedSessionOptions['postgameReviewGate'] | undefined
  #postgameReviewContext: ScriptedPostgameReviewContext | null = null
  #night = 1
  #playerCount = 0
  #cupidGame = false
  #closed = false
  readonly #closedPromise: Promise<void>
  #signalClosed!: () => void

  public get connected(): boolean {
    return !this.#closed
  }

  public finishAfterAcceptedAction(): void {}

  public constructor(
    playerId: PlayerId,
    token: string,
    mailbox: () => ActionMailbox,
    prompts: Map<PlayerId, string[]>,
    seerFault?: ScriptedSeerFault,
    uncertainSpeechOnce?: { playerId: PlayerId; value: boolean; disconnect?: boolean },
    uncertainBootstrapOnce?: { playerId: PlayerId; value: boolean; disconnect?: boolean },
    sheriffSelfDestructOnce?: { playerId: PlayerId; value: boolean },
    postgameReviewContexts?: Map<PlayerId, ScriptedPostgameReviewContext>,
    postgameReviewGate?: ScriptedSessionOptions['postgameReviewGate'],
  ) {
    this.#playerId = playerId
    this.#token = token
    this.#mailbox = mailbox
    this.#prompts = prompts
    this.#seerFault = seerFault
    this.#uncertainSpeechOnce = uncertainSpeechOnce
    this.#uncertainBootstrapOnce = uncertainBootstrapOnce
    this.#sheriffSelfDestructOnce = sheriffSelfDestructOnce
    this.#postgameReviewContexts = postgameReviewContexts
    this.#postgameReviewGate = postgameReviewGate
    this.sessionId = `scripted-${playerId}`
    this.#closedPromise = new Promise<void>((resolvePromise) => {
      this.#signalClosed = resolvePromise
    })
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
    if (prompt.includes('丘比特是第三方阵营角色') || prompt.includes('ability-cupid-link')) {
      this.#cupidGame = true
    }
    this.#playerCount = Math.max(
      this.#playerCount,
      ...[...prompt.matchAll(/player-(\d+)/g)].map((match) => Number(match[1])),
    )
    if (
      prompt.includes('只回复“准备就绪”') &&
      this.#uncertainBootstrapOnce?.value &&
      this.#uncertainBootstrapOnce.playerId === this.#playerId
    ) {
      this.#uncertainBootstrapOnce.value = false
      if (this.#uncertainBootstrapOnce.disconnect) this.#closed = true
      const error = new Error('simulated bootstrap disconnect')
      error.name = AcpDeliveryUncertainError.name
      throw error
    }
    if (prompt.includes('现在轮到你发言')) {
      if (
        this.#uncertainSpeechOnce?.value &&
        this.#uncertainSpeechOnce.playerId === this.#playerId
      ) {
        this.#uncertainSpeechOnce.value = false
        if (this.#uncertainSpeechOnce.disconnect) this.#closed = true
        const error = new Error('simulated ACP disconnect')
        error.name = AcpDeliveryUncertainError.name
        throw error
      }
      const text = `我是 ${this.#playerId.replace('player-', '')} 号玩家，这一轮选择弃票。`
      callbacks.onTextChunk?.(text.slice(0, 8))
      callbacks.onTextChunk?.(text.slice(8))
      return { text, stopReason: 'end_turn', updates: [] }
    }
    if (prompt.includes('现在轮到你发表赛后复盘感言')) {
      const text = `${this.#playerId.replace('player-', '')}号的赛后复盘：关键判断仍可更准确，下一局会更重视信息闭环。`
      callbacks.onTextChunk?.(text.slice(0, 12))
      callbacks.onTextChunk?.(text.slice(12))
      return { text, stopReason: 'end_turn', updates: [] }
    }
    if (prompt.includes('submit_postgame_review')) {
      const mvpCandidates = idsOnLine(prompt, 'MVP 候选：', false)
      const svpCandidates = idsOnLine(prompt, 'SVP 候选：', false)
      if (mvpCandidates.length > 0 && svpCandidates.length > 0) {
        this.#postgameReviewContext = {
          playerIds: Array.from(
            { length: this.#playerCount },
            (_, index) => `player-${index + 1}` as PlayerId,
          ),
          mvpCandidates,
          svpCandidates,
        }
        this.#postgameReviewContexts?.set(this.#playerId, this.#postgameReviewContext)
      }
      const reviewContext =
        this.#postgameReviewContexts?.get(this.#playerId) ?? this.#postgameReviewContext
      if (!reviewContext) throw new Error('Missing durable scripted postgame review context')
      if (this.#postgameReviewGate?.playerId === this.#playerId) {
        this.#postgameReviewGate.started()
        await Promise.race([
          this.#postgameReviewGate.release,
          this.#closedPromise.then(() => {
            const error = new Error('simulated postgame process close')
            error.name = AcpDeliveryUncertainError.name
            throw error
          }),
        ])
      }
      const choose = (candidates: readonly PlayerId[]): PlayerId =>
        candidates.find((candidate) => candidate !== this.#playerId) ?? candidates[0]!
      this.#mailbox().submitPostgameReview(this.#token, {
        mvpPlayerId: choose(reviewContext.mvpCandidates),
        svpPlayerId: choose(reviewContext.svpCandidates),
        ratings: reviewContext.playerIds
          .filter((playerId) => playerId !== this.#playerId)
          .map((playerId, index) => ({
            playerId,
            scores: {
              information: 6 + (index % 5),
              communication: 6 + ((index + 1) % 5),
              decision: 6 + ((index + 2) % 5),
              objective: 6 + ((index + 3) % 5),
              adaptability: 6 + ((index + 4) % 5),
            },
          })),
      })
      return { text: '', stopReason: 'end_turn', updates: [] }
    }
    if (prompt.includes('准备就绪')) {
      return { text: '准备就绪', stopReason: 'end_turn', updates: [] }
    }
    const phase = latestPhase(prompt)
    if (phase === 'sheriffSignup') {
      this.#mailbox().submitSheriffAction(
        this.#token,
        this.#sheriffSelfDestructOnce ? 'join' : 'decline',
      )
    } else if (phase === 'sheriffWithdraw') {
      if (
        this.#sheriffSelfDestructOnce?.value &&
        this.#sheriffSelfDestructOnce.playerId === this.#playerId
      ) {
        this.#sheriffSelfDestructOnce.value = false
        this.#mailbox().submitSkillTrigger(this.#token, 'ability-werewolf-self-destruct', null)
      } else {
        this.#mailbox().submitSheriffAction(this.#token, 'keep-running')
      }
    } else if (phase === 'sheriffTransfer') {
      this.#mailbox().submitSheriffAction(this.#token, 'destroy-badge', null)
    } else if (phase === 'nightCupid') {
      this.#mailbox().submitNightAction(this.#token, 'ability-cupid-link', [
        'player-1',
        this.#playerCount === 6 ? 'player-2' : 'player-5',
      ])
    } else if (phase === 'nightWolfVote') {
      const quickTargets = [5, 6, 3, 4]
      const cupidTargets = this.#playerCount === 6 ? [3, 5] : [12, 5, 6, 7, 8]
      const targetSeat = this.#cupidGame
        ? cupidTargets[this.#night - 1]
        : this.#playerCount === 6
          ? quickTargets[this.#night - 1]
          : 4 + this.#night
      if (!targetSeat) throw new Error(`No scripted wolf target for night ${this.#night}`)
      this.#mailbox().submitVote(this.#token, `player-${targetSeat}`)
    } else if (phase === 'dayVote') {
      this.#mailbox().submitVote(
        this.#token,
        this.#cupidGame && this.#playerCount === 6 ? 'player-4' : null,
      )
    } else if (phase === 'nightWitch') {
      this.#mailbox().submitNightAction(this.#token, 'ability-witch-antidote', [], 'pass')
    } else if (phase === 'nightSeer') {
      const targetId = this.#cupidGame && this.#night >= 3 ? 'player-2' : 'player-1'
      if (this.#seerFault?.value) {
        this.#seerFault.value = false
        if (this.#seerFault.behavior === 'correct-in-turn') {
          try {
            this.#mailbox().submitNightAction(this.#token, 'ability-guard-protect', ['player-1'])
          } catch (error) {
            this.#seerFault.rejectedReasons?.push(
              error instanceof Error ? error.message : String(error),
            )
            this.#mailbox().submitNightAction(this.#token, 'ability-seer-inspect', [targetId])
          }
        }
      } else {
        this.#mailbox().submitNightAction(this.#token, 'ability-seer-inspect', [targetId])
      }
    } else if (phase === 'hunterShot') {
      this.#mailbox().submitSkillTrigger(this.#token, 'ability-hunter-shot', null, 'pass')
    }
    if (phase) return { text: '', stopReason: 'end_turn', updates: [] }
    throw new Error(`Unhandled scripted prompt for ${this.#playerId}: ${prompt}`)
  }

  public close(): Promise<void> {
    this.#closed = true
    this.#signalClosed()
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

function latestPhase(prompt: string): string | null {
  if (prompt.includes('ability-cupid-link')) return 'nightCupid'
  if (prompt.includes('ability-hunter-shot')) return 'hunterShot'
  if (prompt.includes('ability-seer-inspect')) return 'nightSeer'
  if (prompt.includes('ability-witch-antidote')) return 'nightWitch'
  if (prompt.includes('action: join') && prompt.includes('action: decline')) return 'sheriffSignup'
  if (prompt.includes('action: withdraw') && prompt.includes('action: keep-running')) {
    return 'sheriffWithdraw'
  }
  if (prompt.includes('action: destroy-badge')) return 'sheriffTransfer'
  if (prompt.includes('狼队商议结束') && prompt.includes('submit_vote')) return 'nightWolfVote'
  if (prompt.includes('submit_vote')) return 'dayVote'
  return null
}

function idsOnLine(prompt: string, prefix: string, required = true): PlayerId[] {
  const line = prompt.split('\n').find((candidate) => candidate.startsWith(prefix))
  if (!line) {
    if (required) throw new Error(`Missing postgame candidate line ${prefix}`)
    return []
  }
  return [...line.matchAll(/player-\d+/g)].map((match) => match[0] as PlayerId)
}
