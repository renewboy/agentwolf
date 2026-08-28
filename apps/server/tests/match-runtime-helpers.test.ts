import {
  AgentProfileIdSchema,
  MatchIdSchema,
  PhaseIdSchema,
  PlayerIdSchema,
} from '@agentwolf/contracts'
import {
  GameEngine,
  createClassicRuleset,
  v1AbilityIds,
  whiteWolfAbilityIds,
  whiteWolfKingBoard,
  type TurnDescriptor,
} from '@agentwolf/game-engine'
import { describe, expect, it, vi } from 'vitest'
import {
  hasUncertainDelivery,
  describeError,
  findCommittedSpeech,
  interruptAbilityIdsFor,
  interruptAbilityExpectation,
  mapWithConcurrency,
  reconcileCommittedPendingAction,
  settleActions,
} from '../src/match-runtime-helpers.js'
import { AcpDeliveryUncertainError } from '@agentwolf/acp'

describe('match runtime helpers', () => {
  it('derives public interrupts from registered actor capabilities', () => {
    const ruleset = createClassicRuleset()
    const roleIds = whiteWolfKingBoard.roles.flatMap(({ roleId, count }) =>
      Array.from({ length: count }, () => roleId),
    )
    const engine = GameEngine.create({
      matchId: MatchIdSchema.parse('match-white-wolf-instructions'),
      board: whiteWolfKingBoard,
      ruleset,
      roleAssignment: 'manual',
      seed: 1,
      players: roleIds.map((roleId, index) => ({
        id: PlayerIdSchema.parse(`player-${index + 1}`),
        seat: index + 1,
        name: `White Wolf instruction player ${index + 1}`,
        profileId: AgentProfileIdSchema.parse(`profile-white-wolf-${index + 1}`),
        roleId,
      })),
    })
    const actor = [...engine.state.players.values()].find(
      (player) => player.roleId === 'role-white-wolf-king',
    )!
    const turn: TurnDescriptor = {
      phaseId: PhaseIdSchema.parse('phase-day-speech'),
      labelKey: 'phases.daySpeech',
      mode: 'sequential',
      actionType: 'speech',
      actors: [actor.id],
      speechKind: 'day',
      interruptAbilityIds: [v1AbilityIds.werewolfSelfDestruct, whiteWolfAbilityIds.detonate],
    }
    expect(interruptAbilityExpectation(engine.state, actor.id, turn, ruleset.roles)).toEqual({
      interruptAbilityIds: [whiteWolfAbilityIds.detonate],
    })
  })

  it('recognizes nested uncertain delivery failures and preserves aggregate failures', async () => {
    expect(
      hasUncertainDelivery(
        new Error('outer', { cause: new AcpDeliveryUncertainError('uncertain transport') }),
      ),
    ).toBe(true)
    await expect(settleActions([Promise.reject(new Error('first'))])).rejects.toThrow(
      'One or more player turns failed',
    )
  })

  it('describes aggregate failures and settles successful and concurrent work', async () => {
    expect(describeError(new AggregateError([], 'empty'))).toBe('empty')
    expect(describeError(new AggregateError([new Error('first'), 'second'], 'many'))).toBe(
      'many: first; second',
    )
    expect(describeError('plain failure')).toBe('plain failure')
    expect(hasUncertainDelivery(new AcpDeliveryUncertainError('direct'))).toBe(true)
    expect(
      hasUncertainDelivery(
        Object.assign(new Error('named'), { name: 'AcpDeliveryUncertainError' }),
      ),
    ).toBe(true)
    expect(
      hasUncertainDelivery(new AggregateError([new Error('ordinary'), new Error('other')], 'all')),
    ).toBe(false)
    expect(hasUncertainDelivery(new Error('ordinary'))).toBe(false)

    const action = {
      type: 'vote' as const,
      matchId: MatchIdSchema.parse('match-helper-settle'),
      actorId: PlayerIdSchema.parse('player-1'),
      targetId: null,
      kind: 'exile' as const,
    }
    await expect(settleActions([Promise.resolve(action)])).resolves.toEqual([action])

    const visited: number[] = []
    await mapWithConcurrency([1, 2, 3], 0, async (value) => {
      visited.push(value)
    })
    expect(visited.sort()).toEqual([1, 2, 3])
    await mapWithConcurrency([], 4, async () => {
      throw new Error('unreachable')
    })
    await expect(
      mapWithConcurrency([1, 2], 2, async (value) => {
        if (value === 2) throw new Error('worker failed')
      }),
    ).rejects.toThrow(/player sessions failed/)
  })

  it('returns empty interrupt capabilities for missing players and turns', () => {
    const engine = GameEngine.create({
      matchId: MatchIdSchema.parse('match-helper-empty-interrupt'),
      board: whiteWolfKingBoard,
      roleAssignment: 'random',
      seed: 2,
      players: whiteWolfKingBoard.roles
        .flatMap(({ roleId, count }) => Array.from({ length: count }, () => roleId))
        .map((roleId, index) => ({
          id: PlayerIdSchema.parse(`player-${index + 1}`),
          seat: index + 1,
          name: `Player ${index + 1}`,
          profileId: AgentProfileIdSchema.parse(`profile-helper-${index + 1}`),
          roleId,
        })),
    })
    const roles = createClassicRuleset().roles
    expect(
      interruptAbilityIdsFor(
        engine.state,
        PlayerIdSchema.parse('player-99'),
        { interruptAbilityIds: [whiteWolfAbilityIds.detonate] },
        roles,
      ),
    ).toEqual([])
    const first = [...engine.state.players.keys()][0]!
    expect(interruptAbilityExpectation(engine.state, first, {}, roles)).toEqual({})
    expect(findCommittedSpeech([])).toBeNull()
  })

  it('finds committed speech and clears only an exactly committed durable action', () => {
    const matchId = MatchIdSchema.parse('match-helper-reconcile')
    const playerId = PlayerIdSchema.parse('player-1')
    const action = {
      type: 'vote' as const,
      matchId,
      actorId: playerId,
      targetId: null,
      kind: 'exile' as const,
    }
    expect(
      findCommittedSpeech([
        {
          payload: {
            type: 'speech.committed',
            playerId,
            kind: 'day',
            text: 'committed',
            sanitized: false,
          },
        } as never,
      ])?.payload.text,
    ).toBe('committed')

    let pendingAction: unknown = null
    const clearPendingAction = vi.fn()
    const repository = {
      playerSessions: {
        get: () => ({ pendingAction }),
        clearPendingAction,
      },
    }
    const engine = { state: { matchId }, events: [] as unknown[] }
    reconcileCommittedPendingAction(repository as never, engine as never, playerId)
    pendingAction = { deliveryId: 'delivery-helper', action }
    reconcileCommittedPendingAction(repository as never, engine as never, playerId)
    engine.events = [
      { sequence: 1, payload: { type: 'delivery.started', deliveryId: 'delivery-helper' } },
      {
        sequence: 2,
        payload: {
          type: 'action.submitted',
          playerId,
          action: { ...action, targetId: 'player-2' },
        },
      },
    ]
    reconcileCommittedPendingAction(repository as never, engine as never, playerId)
    expect(clearPendingAction).not.toHaveBeenCalled()
    engine.events.push({ sequence: 3, payload: { type: 'action.submitted', playerId, action } })
    reconcileCommittedPendingAction(repository as never, engine as never, playerId)
    expect(clearPendingAction).toHaveBeenCalledWith(matchId, playerId)
  })
})
