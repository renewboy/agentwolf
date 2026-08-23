import { randomBytes } from 'node:crypto'
import {
  AbilityIdSchema,
  ActionReceiptSchema,
  MatchIdSchema,
  PlayerActionSchema,
  PlayerIdSchema,
  type ActionReceipt,
  type AbilityId,
  type MatchId,
  type PlayerAction,
  type PlayerId,
} from '@agentwolf/contracts'
import { getCopy } from '@agentwolf/assets'

export interface ActionExpectation {
  readonly matchId: MatchId
  readonly playerId: PlayerId
  readonly actionType: PlayerAction['type']
  readonly speechKind?: Extract<PlayerAction, { type: 'speech' }>['kind']
  readonly voteKind?: Extract<PlayerAction, { type: 'vote' }>['kind']
  readonly onAccepted?: (action: PlayerAction) => void
  readonly allowedAbilityIds?: readonly AbilityId[]
  readonly interruptAbilityIds?: readonly AbilityId[]
  readonly allowSpeechTool?: boolean
}

interface PlayerBinding {
  readonly matchId: MatchId
  readonly playerId: PlayerId
}

export class ActionMailbox {
  readonly #bindings = new Map<string, PlayerBinding>()
  readonly #expectations = new Map<string, ActionExpectation>()
  readonly #actions = new Map<string, PlayerAction>()

  public issueToken(matchId: MatchId, playerId: PlayerId): string {
    const token = randomBytes(32).toString('base64url')
    this.#bindings.set(token, { matchId, playerId })
    return token
  }

  public revokeToken(token: string): void {
    this.#bindings.delete(token)
  }

  public binding(token: string): PlayerBinding | null {
    return this.#bindings.get(token) ?? null
  }

  public expect(expectation: ActionExpectation): void {
    const key = this.#key(expectation.matchId, expectation.playerId)
    this.#expectations.set(key, expectation)
    this.#actions.delete(key)
  }

  public submitSpeech(token: string, text: string): ActionReceipt {
    const expectation = this.#expectation(token, 'speech')
    if (!expectation.allowSpeechTool) {
      throw new Error(getCopy('tools.speechDirectReplyRequired'))
    }
    if (!expectation.speechKind) throw new Error('Speech kind is missing from the expectation')
    return this.#accept(
      expectation,
      PlayerActionSchema.parse({
        type: 'speech',
        matchId: expectation.matchId,
        actorId: expectation.playerId,
        kind: expectation.speechKind,
        text,
      }),
    )
  }

  public submitVote(token: string, targetPlayerId: string | null): ActionReceipt {
    const expectation = this.#expectation(token, 'vote')
    if (!expectation.voteKind) throw new Error('Vote kind is missing from the expectation')
    return this.#accept(
      expectation,
      PlayerActionSchema.parse({
        type: 'vote',
        matchId: expectation.matchId,
        actorId: expectation.playerId,
        kind: expectation.voteKind,
        targetId: targetPlayerId === null ? null : PlayerIdSchema.parse(targetPlayerId),
      }),
    )
  }

  public submitNightAction(
    token: string,
    abilityId: string,
    targetPlayerIds: readonly string[],
    option?: string,
  ): ActionReceipt {
    const expectation = this.#expectation(token, 'night-action')
    return this.#accept(
      expectation,
      PlayerActionSchema.parse({
        type: 'night-action',
        matchId: expectation.matchId,
        actorId: expectation.playerId,
        abilityId: AbilityIdSchema.parse(abilityId),
        targetIds: targetPlayerIds.map((target) => PlayerIdSchema.parse(target)),
        ...(option ? { option } : {}),
      }),
    )
  }

  public submitSheriffAction(
    token: string,
    action: Extract<PlayerAction, { type: 'sheriff-action' }>['action'],
  ): ActionReceipt {
    const expectation = this.#expectation(token, 'sheriff-action')
    return this.#accept(
      expectation,
      PlayerActionSchema.parse({
        type: 'sheriff-action',
        matchId: expectation.matchId,
        actorId: expectation.playerId,
        action,
      }),
    )
  }

  public submitSkillTrigger(
    token: string,
    abilityId: string,
    targetPlayerId: string | null,
    option?: string,
  ): ActionReceipt {
    const expectation = this.#expectation(token, 'skill-trigger')
    const parsedAbilityId = AbilityIdSchema.parse(abilityId)
    const allowed =
      expectation.actionType === 'skill-trigger'
        ? expectation.allowedAbilityIds
        : expectation.interruptAbilityIds
    if (!allowed?.includes(parsedAbilityId)) {
      throw new Error(
        `Ability ${parsedAbilityId} is unavailable; allowed abilities: ${allowed?.join(', ') || 'none'}`,
      )
    }
    return this.#accept(
      expectation,
      PlayerActionSchema.parse({
        type: 'skill-trigger',
        matchId: expectation.matchId,
        actorId: expectation.playerId,
        abilityId: parsedAbilityId,
        targetId: targetPlayerId === null ? null : PlayerIdSchema.parse(targetPlayerId),
        ...(option ? { option } : {}),
      }),
    )
  }

  public take(matchId: MatchId, playerId: PlayerId): PlayerAction | null {
    const key = this.#key(matchId, playerId)
    const action = this.#actions.get(key) ?? null
    this.#actions.delete(key)
    this.#expectations.delete(key)
    return action
  }

  public clear(matchId: MatchId, playerId: PlayerId): void {
    const key = this.#key(matchId, playerId)
    this.#actions.delete(key)
    this.#expectations.delete(key)
  }

  #expectation(token: string, actionType: PlayerAction['type']): ActionExpectation {
    const binding = this.#bindings.get(token)
    if (!binding) throw new Error('Player action token is invalid')
    const expectation = this.#expectations.get(this.#key(binding.matchId, binding.playerId))
    if (!expectation) throw new Error('The judge is not waiting for an action from this player')
    const interruptAllowed =
      actionType === 'skill-trigger' &&
      (expectation.actionType === 'speech' ||
        expectation.actionType === 'vote' ||
        expectation.actionType === 'sheriff-action')
    if (expectation.actionType !== actionType && !interruptAllowed) {
      throw new Error(`The judge expects ${expectation.actionType}, not ${actionType}`)
    }
    return expectation
  }

  #accept(expectation: ActionExpectation, action: PlayerAction): ActionReceipt {
    const key = this.#key(expectation.matchId, expectation.playerId)
    if (this.#actions.has(key)) throw new Error('This player already submitted an action')
    this.#actions.set(key, action)
    expectation.onAccepted?.(action)
    return ActionReceiptSchema.parse({
      accepted: true,
      actionId: `action-${randomBytes(8).toString('hex')}`,
      message: getCopy('tools.accepted'),
    })
  }

  #key(matchId: MatchId, playerId: PlayerId): string {
    return `${MatchIdSchema.parse(matchId)}:${PlayerIdSchema.parse(playerId)}`
  }
}
