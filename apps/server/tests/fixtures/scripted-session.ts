import type { McpServer } from '@agentclientprotocol/sdk'
import type { PlayerId } from '@agentwolf/contracts'
import {
  AcpDeliveryUncertainError,
  type AcpPromptCallbacks,
  type AcpPromptResult,
} from '@agentwolf/acp'
import { getCopy } from '@agentwolf/assets'
import type { ActionMailbox } from '../../src/action-mailbox.js'
import type { PlayerSession, PlayerSessionFactory } from '../../src/player-runtime.js'

export interface ScriptedSessionOptions {
  readonly prompts: Map<PlayerId, string[]>
  readonly mailbox: () => ActionMailbox
  readonly seerFault?: ScriptedSeerFault
  readonly uncertainSpeechOnce?: { playerId: PlayerId; value: boolean }
}

export interface ScriptedSeerFault {
  value: boolean
  readonly behavior: 'correct-in-turn' | 'omit'
  readonly rejectedReasons?: string[]
}

export function scriptedSessionFactory(options: ScriptedSessionOptions): PlayerSessionFactory {
  return async (session) =>
    new ScriptedSession(
      session.playerId,
      extractToken(session.mcpServer),
      options.mailbox,
      options.prompts,
      options.seerFault,
      options.uncertainSpeechOnce,
    )
}

export class ScriptedSession implements PlayerSession {
  public readonly sessionId: string
  readonly #playerId: PlayerId
  readonly #token: string
  readonly #mailbox: () => ActionMailbox
  readonly #prompts: Map<PlayerId, string[]>
  readonly #seerFault?: ScriptedSeerFault
  readonly #uncertainSpeechOnce?: { playerId: PlayerId; value: boolean }
  #night = 1

  public constructor(
    playerId: PlayerId,
    token: string,
    mailbox: () => ActionMailbox,
    prompts: Map<PlayerId, string[]>,
    seerFault?: ScriptedSeerFault,
    uncertainSpeechOnce?: { playerId: PlayerId; value: boolean },
  ) {
    this.#playerId = playerId
    this.#token = token
    this.#mailbox = mailbox
    this.#prompts = prompts
    this.#seerFault = seerFault
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
      callbacks.onTextChunk?.(text.slice(0, 8))
      callbacks.onTextChunk?.(text.slice(8))
      return { text, stopReason: 'end_turn', updates: [] }
    }
    if (prompt.includes('准备就绪')) {
      return { text: '准备就绪', stopReason: 'end_turn', updates: [] }
    }
    const phase = latestPhase(prompt)
    if (phase === 'sheriffSignup') this.#mailbox().submitSheriffAction(this.#token, 'decline')
    else if (phase === 'nightWolfVote') {
      this.#mailbox().submitVote(this.#token, `player-${4 + this.#night}`)
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
    }
    if (phase) return { text: '', stopReason: 'end_turn', updates: [] }
    throw new Error(`Unhandled scripted prompt for ${this.#playerId}: ${prompt}`)
  }

  public close(): Promise<void> {
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
  if (prompt.includes('ability-seer-inspect')) return 'nightSeer'
  if (prompt.includes('ability-witch-antidote')) return 'nightWitch'
  const phases = ['sheriffSignup', 'nightWolfVote', 'dayVote', 'nightWitch', 'nightSeer'] as const
  const ranked = phases
    .map((phase) => ({ phase, index: prompt.lastIndexOf(getCopy(`phases.${phase}`)) }))
    .filter((entry) => entry.index >= 0)
    .sort((left, right) => right.index - left.index)
  return ranked[0]?.phase ?? null
}
