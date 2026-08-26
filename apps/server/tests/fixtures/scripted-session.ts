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
    )
  }
}

export class ScriptedSession implements PlayerSession {
  public readonly sessionId: string
  readonly #playerId: PlayerId
  readonly #token: string
  readonly #mailbox: () => ActionMailbox
  readonly #prompts: Map<PlayerId, string[]>
  readonly #seerFault?: ScriptedSeerFault
  readonly #uncertainSpeechOnce?: { playerId: PlayerId; value: boolean; disconnect?: boolean }
  readonly #uncertainBootstrapOnce?: {
    playerId: PlayerId
    value: boolean
    disconnect?: boolean
  }
  readonly #sheriffSelfDestructOnce?: { playerId: PlayerId; value: boolean }
  #night = 1
  #playerCount = 0
  #closed = false

  public get connected(): boolean {
    return !this.#closed
  }

  public constructor(
    playerId: PlayerId,
    token: string,
    mailbox: () => ActionMailbox,
    prompts: Map<PlayerId, string[]>,
    seerFault?: ScriptedSeerFault,
    uncertainSpeechOnce?: { playerId: PlayerId; value: boolean; disconnect?: boolean },
    uncertainBootstrapOnce?: { playerId: PlayerId; value: boolean; disconnect?: boolean },
    sheriffSelfDestructOnce?: { playerId: PlayerId; value: boolean },
  ) {
    this.#playerId = playerId
    this.#token = token
    this.#mailbox = mailbox
    this.#prompts = prompts
    this.#seerFault = seerFault
    this.#uncertainSpeechOnce = uncertainSpeechOnce
    this.#uncertainBootstrapOnce = uncertainBootstrapOnce
    this.#sheriffSelfDestructOnce = sheriffSelfDestructOnce
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
    } else if (phase === 'nightWolfVote') {
      const quickTargets = [5, 6, 3, 4]
      const targetSeat = this.#playerCount === 6 ? quickTargets[this.#night - 1] : 4 + this.#night
      if (!targetSeat) throw new Error(`No scripted wolf target for night ${this.#night}`)
      this.#mailbox().submitVote(this.#token, `player-${targetSeat}`)
    } else if (phase === 'dayVote') this.#mailbox().submitVote(this.#token, null)
    else if (phase === 'nightWitch') {
      this.#mailbox().submitNightAction(this.#token, 'ability-witch-antidote', [], 'pass')
    } else if (phase === 'nightSeer') {
      if (this.#seerFault?.value) {
        this.#seerFault.value = false
        if (this.#seerFault.behavior === 'correct-in-turn') {
          try {
            this.#mailbox().submitNightAction(this.#token, 'ability-guard-protect', ['player-1'])
          } catch (error) {
            this.#seerFault.rejectedReasons?.push(
              error instanceof Error ? error.message : String(error),
            )
            this.#mailbox().submitNightAction(this.#token, 'ability-seer-inspect', ['player-1'])
          }
        }
      } else {
        this.#mailbox().submitNightAction(this.#token, 'ability-seer-inspect', ['player-1'])
      }
    } else if (phase === 'hunterShot') {
      this.#mailbox().submitSkillTrigger(this.#token, 'ability-hunter-shot', null, 'pass')
    }
    if (phase) return { text: '', stopReason: 'end_turn', updates: [] }
    throw new Error(`Unhandled scripted prompt for ${this.#playerId}: ${prompt}`)
  }

  public close(): Promise<void> {
    this.#closed = true
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
