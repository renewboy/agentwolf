import { AcpDeliveryUncertainError } from '@agentwolf/acp'
import { MatchIdSchema, PlayerIdSchema, PostgameReviewSubmissionSchema } from '@agentwolf/contracts'
import { describe, expect, it, vi } from 'vitest'
import { ActionMailbox } from '../src/action-mailbox.js'
import {
  deliverAuxiliaryPrompt,
  takePostgameReviewTurn,
  takePostgameSpeechTurn,
  type AuxiliaryDeliveryOptions,
} from '../src/player-auxiliary-turn.js'
import type { PlayerRuntimeStatus, PlayerSession } from '../src/player-runtime.js'

const matchId = MatchIdSchema.parse('match-auxiliary-turn')
const playerId = PlayerIdSchema.parse('player-1')

describe('auxiliary ACP delivery', () => {
  it('records updates and completes a normal end_turn', async () => {
    const harness = deliveryHarness(async (_prompt, _timeout, callbacks) => {
      callbacks?.onTextChunk?.('chunk')
      callbacks?.onUpdate?.({
        sessionUpdate: 'agent_thought_chunk',
        content: { type: 'text', text: 'thought' },
      } as never)
      return { text: 'complete', stopReason: 'end_turn' as const, updates: [] }
    })
    const result = await deliverAuxiliaryPrompt(harness.options)
    expect(result.result.text).toBe('complete')
    expect(harness.turn.update).toHaveBeenCalled()
    expect(harness.turn.complete).toHaveBeenCalledWith('end_turn')
    expect(harness.statuses).toEqual(['thinking', 'ready'])
    expect(harness.active.at(-1)).toBeNull()
  })

  it('marks stopped, uncertain, and accepted-after-error deliveries accurately', async () => {
    const stopped = deliveryHarness(async () => ({
      text: '',
      stopReason: 'cancelled' as never,
      updates: [],
    }))
    await expect(deliverAuxiliaryPrompt(stopped.options)).rejects.toThrow(/stopped with cancelled/)
    expect(stopped.turn.fail).toHaveBeenCalledWith(expect.any(Error), 'failed')

    const uncertain = deliveryHarness(async () => {
      throw new AcpDeliveryUncertainError('delivery uncertain')
    })
    await expect(deliverAuxiliaryPrompt(uncertain.options)).rejects.toThrow(/delivery uncertain/)
    expect(uncertain.turn.fail).toHaveBeenCalledWith(expect.any(Error), 'uncertain')

    const accepted = deliveryHarness(async () => {
      throw 'response closed after acceptance'
    }, false)
    await expect(
      deliverAuxiliaryPrompt({ ...accepted.options, acceptedAfterError: () => true }),
    ).resolves.toMatchObject({
      result: { text: '', stopReason: 'end_turn' },
    })
    expect(accepted.turn.diagnostic).toHaveBeenCalled()
    expect(accepted.statuses.at(-1)).toBe('failed')
  })
})

describe('postgame auxiliary turns', () => {
  it('takes and clears an accepted postgame review and rejects a missing submission', async () => {
    const mailbox = new ActionMailbox()
    const token = mailbox.issueToken(matchId, playerId)
    const input = {
      mvpPlayerId: PlayerIdSchema.parse('player-2'),
      svpPlayerId: PlayerIdSchema.parse('player-3'),
      ratings: [
        {
          playerId: PlayerIdSchema.parse('player-2'),
          scores: {
            information: 7,
            communication: 7,
            decision: 7,
            objective: 7,
            adaptability: 7,
          },
        },
      ],
    }
    const submission = PostgameReviewSubmissionSchema.parse({
      ...input,
      matchId,
      reviewerId: playerId,
      submittedAt: '2026-08-28T00:00:00.000Z',
    })
    const accepted = vi.fn()
    const expectationAccepted = vi.fn()
    await expect(
      takePostgameReviewTurn({
        mailbox,
        matchId,
        playerId,
        envelope: envelope(),
        expectation: {
          matchId,
          playerId,
          validate: () => submission,
          onAccepted: expectationAccepted,
        },
        deliver: async (_envelope, _actionType, _callbacks, acceptedAfterError) => {
          expect(acceptedAfterError?.()).toBe(false)
          mailbox.submitPostgameReview(token, input)
          expect(acceptedAfterError?.()).toBe(true)
          return {
            result: { text: '', stopReason: 'end_turn', updates: [] },
            trajectory: {} as never,
          }
        },
        onAccepted: accepted,
      }),
    ).resolves.toEqual(submission)
    expect(accepted).toHaveBeenCalledWith(submission)
    expect(expectationAccepted).toHaveBeenCalledWith(submission)
    expect(mailbox.peekPostgameReview(matchId, playerId)).toBeNull()

    await expect(
      takePostgameReviewTurn({
        mailbox,
        matchId,
        playerId,
        envelope: envelope(),
        expectation: { matchId, playerId, validate: () => submission },
        deliver: async () => ({
          result: { text: '', stopReason: 'end_turn', updates: [] },
          trajectory: {} as never,
        }),
        onAccepted: vi.fn(),
      }),
    ).rejects.toThrow(/did not submit/)
  })

  it('captures direct reflection speech, diagnostics, and accepted trajectory data', async () => {
    const trajectory = { diagnostic: vi.fn(), accepted: vi.fn() }
    const text = await takePostgameSpeechTurn({
      matchId,
      playerId,
      envelope: envelope(),
      callbacks: { onTextChunk: vi.fn(), onUpdate: vi.fn() },
      deliver: async (_envelope, _actionType, callbacks) => {
        callbacks?.onUpdate?.({ sessionUpdate: 'tool_call', toolCallId: 'lookup' } as never)
        callbacks?.onTextChunk?.('最终复盘。')
        return {
          result: { text: 'fallback', stopReason: 'end_turn', updates: [] },
          trajectory: trajectory as never,
        }
      },
    })
    expect(text).toBe('最终复盘。')
    expect(trajectory.diagnostic).toHaveBeenCalled()
    expect(trajectory.accepted).toHaveBeenCalledWith(
      'postgame-speech',
      expect.objectContaining({ kind: 'postgame', text: '最终复盘。' }),
    )
  })
})

function deliveryHarness(prompt: PlayerSession['prompt'], connected = true) {
  const turn = {
    update: vi.fn(),
    diagnostic: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
  }
  const statuses: PlayerRuntimeStatus[] = []
  const active: unknown[] = []
  const options: AuxiliaryDeliveryOptions = {
    session: {
      sessionId: 'session-auxiliary',
      connected,
      prompt,
      finishAfterAcceptedAction: vi.fn(),
      close: vi.fn(async () => undefined),
    },
    promptTimeoutMs: 5_000,
    envelope: envelope(),
    actionType: 'postgame-review',
    matchId,
    playerId,
    sessionGeneration: 1,
    trajectory: { beginTurn: () => turn } as never,
    callbacks: { onTextChunk: vi.fn(), onUpdate: vi.fn() },
    setStatus: (status) => statuses.push(status),
    setActiveTrajectory: (value: unknown) => active.push(value),
  }
  return { options, turn, statuses, active }
}

function envelope() {
  return {
    prompt: 'postgame prompt',
    fromSequence: 1,
    toSequence: 2,
    visibleEvents: [],
    gameStatus: 'ended' as const,
    pausedReason: null,
    continuation: false,
  }
}
