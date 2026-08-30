import {
  AbilityIdSchema,
  MatchIdSchema,
  PhaseIdSchema,
  PlayerIdSchema,
  type PlayerAction,
} from '@agentwolf/contracts'
import { describe, expect, it, vi } from 'vitest'
import type { ActionExpectation } from '../src/action-mailbox.js'
import { RollingSpeechInterruptCoordinator } from '../src/rolling-speech-interrupt.js'

const matchId = MatchIdSchema.parse('match-rolling-coordinator')
const phaseId = PhaseIdSchema.parse('phase-day-speech')
const speakerId = PlayerIdSchema.parse('player-1')
const listenerId = PlayerIdSchema.parse('player-2')
const abilityId = AbilityIdSchema.parse('ability-test-interrupt')

describe('RollingSpeechInterruptCoordinator', () => {
  it('validates listener actions and treats an explicit pass as settled', async () => {
    const actionSettled = vi.fn()
    const runtime = runtimeStub({
      actionSettled,
      takeTurn: async (_envelope, expectation) => {
        expect(() => expectation.validate?.({ type: 'speech' } as PlayerAction)).toThrow(
          /requires skill-trigger/,
        )
        expect(() =>
          expectation.validate?.({
            type: 'skill-trigger',
            matchId,
            actorId: listenerId,
            abilityId: AbilityIdSchema.parse('ability-unavailable'),
            targetId: null,
          }),
        ).toThrow(/does not allow/)
        expect(() =>
          expectation.validate?.({
            type: 'skill-trigger',
            matchId,
            actorId: listenerId,
            abilityId,
            targetId: speakerId,
            option: 'pass',
          }),
        ).toThrow(/cannot target/)
        return {
          type: 'skill-trigger',
          matchId,
          actorId: listenerId,
          abilityId,
          targetId: null,
          option: 'pass',
        }
      },
    })
    const coordinator = coordinatorWith(runtime)

    coordinator.refresh(speakerId)
    await coordinator.settleAll()

    expect(actionSettled).toHaveBeenCalledOnce()
    expect(coordinator.takeInterrupt()).toBeNull()
  })

  it('adopts an already accepted interrupt while removing a newly active speaker', async () => {
    const action = {
      type: 'skill-trigger' as const,
      matchId,
      actorId: listenerId,
      abilityId,
      targetId: null,
    }
    let release!: (action: PlayerAction) => void
    const pendingTurn = new Promise<PlayerAction>((resolve) => {
      release = resolve
    })
    const runtime = runtimeStub({
      pendingAction: () => action,
      supersedeActiveTurn: async () => {
        release(action)
        return 'accepted' as const
      },
      takeTurn: async () => pendingTurn,
    })
    const coordinator = coordinatorWith(runtime)

    coordinator.refresh(speakerId)
    await Promise.resolve()
    coordinator.refresh(listenerId)

    await expect(coordinator.waitForInterrupt()).resolves.toEqual(action)
    expect(coordinator.takeInterrupt()).toEqual(action)
    await coordinator.settleAll()
  })

  it('does not reopen a listener immediately after that player finishes speaking', async () => {
    const takeTurn = vi.fn(async () => new Promise<PlayerAction>(() => undefined))
    const runtime = runtimeStub({ takeTurn })
    const coordinator = coordinatorWith(runtime, [
      {
        sequence: 2,
        payload: {
          type: 'speech.committed',
          playerId: listenerId,
          kind: 'day',
          text: '刚完成的自己发言。',
          sanitized: false,
        },
      },
    ])

    coordinator.refresh(speakerId)
    await coordinator.settleAll()

    expect(takeTurn).not.toHaveBeenCalled()
  })
})

function coordinatorWith(
  runtime: ReturnType<typeof runtimeStub>,
  events: readonly unknown[] = [
    {
      sequence: 1,
      payload: { type: 'phase.changed', phaseId },
    },
  ],
) {
  const players = new Map([
    [speakerId, { id: speakerId, seat: 1, alive: true }],
    [listenerId, { id: listenerId, seat: 2, alive: true }],
  ])
  const turn = {
    phaseId,
    labelKey: 'phases.daySpeech',
    mode: 'sequential' as const,
    actionType: 'speech' as const,
    actors: [speakerId, listenerId],
    speechKind: 'day' as const,
  }
  const engine = {
    state: { status: 'running', phaseId, day: 1, matchId, players },
    events,
    currentTurn: () => turn,
    interruptAbilityIdsFor: (playerId: typeof listenerId) =>
      playerId === listenerId ? [abilityId] : [],
    validateAction: vi.fn(),
  }
  const renderer = {
    abilityContracts: (abilityIds: readonly (typeof abilityId)[]) =>
      abilityIds.map((currentAbilityId) => ({
        abilityId: currentAbilityId,
        label: '测试 interrupt',
        description: '测试公开回合 interrupt。',
      })),
    interruptTurn: async () => ({
      prompt: 'listener',
      toSequence: 1,
      visibleEvents: [],
      gameStatus: 'running',
      pausedReason: null,
      continuation: false,
    }),
  }
  return new RollingSpeechInterruptCoordinator({
    engine: engine as never,
    board: {} as never,
    renderer: renderer as never,
    players: new Map([[listenerId, runtime as never]]),
    speechCharacterLimit: 300,
  })
}

function runtimeStub(overrides: {
  readonly takeTurn?: (envelope: unknown, expectation: ActionExpectation) => Promise<PlayerAction>
  readonly supersedeActiveTurn?: () => Promise<'idle' | 'accepted' | 'cancelled'>
  readonly pendingAction?: () => PlayerAction | null
  readonly actionSettled?: () => void
}) {
  return {
    acknowledgedSequence: 0,
    continuationPending: false,
    ensureReady: async () => undefined,
    takeTurn: overrides.takeTurn ?? (async () => new Promise(() => undefined)),
    supersedeActiveTurn: overrides.supersedeActiveTurn ?? (async () => 'idle' as const),
    pendingAction: overrides.pendingAction ?? (() => null),
    actionSettled: overrides.actionSettled ?? (() => undefined),
  }
}
