import { randomBytes } from 'node:crypto'
import {
  AbilityIdSchema,
  ActionReceiptSchema,
  MatchIdSchema,
  PlayerActionSchema,
  PlayerIdSchema,
  RoleCardIdSchema,
  PostgameReviewSubmissionInputSchema,
  type ActionReceipt,
  type AbilityId,
  type MatchId,
  type PhaseId,
  type PlayerAction,
  type PlayerId,
  type RoleCardId,
  type RoleId,
  type PostgameReviewSubmission,
  type PostgameReviewSubmissionInput,
  type SheriffActionKind,
} from '@agentwolf/contracts'
import { loadPromptCore } from '@agentwolf/assets/prompts'

const promptCore = loadPromptCore()

export interface ActionExpectation {
  readonly matchId: MatchId
  readonly playerId: PlayerId
  readonly actionType: PlayerAction['type']
  readonly phaseId?: PhaseId
  readonly day?: number
  readonly toSequence?: number
  readonly speechKind?: Extract<PlayerAction, { type: 'speech' }>['kind']
  readonly voteKind?: Extract<PlayerAction, { type: 'vote' }>['kind']
  readonly validate?: (action: PlayerAction) => void
  readonly onAccepted?: (action: PlayerAction) => void
  readonly allowedAbilityIds?: readonly AbilityId[]
  readonly interruptAbilityIds?: readonly AbilityId[]
  readonly abilityContracts?: readonly {
    readonly abilityId: AbilityId
    readonly label: string
    readonly description: string
  }[]
  readonly roleCardChoices?: readonly {
    readonly cardId: RoleCardId
    readonly roleId: RoleId
    readonly label: string
    readonly selectable: boolean
  }[]
  readonly allowedSheriffActions?: readonly SheriffActionKind[]
  readonly passAllowed?: boolean
  readonly allowSpeechTool?: boolean
}

export interface PlayerAbilityToolContract {
  readonly abilityId: AbilityId
  readonly label: string
  readonly description: string
  readonly actionTypes: readonly PlayerAction['type'][]
}

export interface PostgameReviewExpectation {
  readonly matchId: MatchId
  readonly playerId: PlayerId
  validate(input: PostgameReviewSubmissionInput): PostgameReviewSubmission
  readonly onAccepted?: (submission: PostgameReviewSubmission) => void
}

interface PlayerBinding {
  readonly matchId: MatchId
  readonly playerId: PlayerId
  readonly abilityContracts: readonly PlayerAbilityToolContract[]
}

export class ActionMailbox {
  readonly #bindings = new Map<string, PlayerBinding>()
  readonly #expectations = new Map<string, ActionExpectation>()
  readonly #actions = new Map<string, PlayerAction>()
  readonly #reviewExpectations = new Map<string, PostgameReviewExpectation>()
  readonly #reviews = new Map<string, PostgameReviewSubmission>()

  public issueToken(
    matchId: MatchId,
    playerId: PlayerId,
    abilityContracts: readonly PlayerAbilityToolContract[] = [],
  ): string {
    const token = randomBytes(32).toString('base64url')
    this.#bindings.set(token, {
      matchId,
      playerId,
      abilityContracts: abilityContracts.map((contract) => ({
        ...contract,
        actionTypes: [...contract.actionTypes],
      })),
    })
    return token
  }

  public revokeToken(token: string): void {
    const binding = this.#bindings.get(token)
    this.#bindings.delete(token)
    if (binding) {
      this.clear(binding.matchId, binding.playerId)
      this.clearPostgameReview(binding.matchId, binding.playerId)
    }
  }

  public binding(token: string): PlayerBinding | null {
    return this.#bindings.get(token) ?? null
  }

  public expect(expectation: ActionExpectation): void {
    const key = this.#key(expectation.matchId, expectation.playerId)
    this.#expectations.set(key, expectation)
    this.#actions.delete(key)
  }

  public peekExpectation(matchId: MatchId, playerId: PlayerId): ActionExpectation | null {
    return this.#expectations.get(this.#key(matchId, playerId)) ?? null
  }

  public expectPostgameReview(expectation: PostgameReviewExpectation): void {
    const key = this.#key(expectation.matchId, expectation.playerId)
    this.#reviewExpectations.set(key, expectation)
    this.#reviews.delete(key)
  }

  public submitSpeech(token: string, text: string): ActionReceipt {
    const expectation = this.#expectation(token, 'speech')
    if (!expectation.allowSpeechTool) {
      throw new Error(
        promptCore.tool('submit_speech').unavailable ?? 'Direct speech response required',
      )
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
    roleCardId?: string,
  ): ActionReceipt {
    const expectation = this.#expectation(token, 'night-action')
    const roleCardChoices = expectation.roleCardChoices ?? []
    if (roleCardChoices.length > 0) {
      if (targetPlayerIds.length > 0) throw new Error('Role-card choices cannot target players')
      const selected = roleCardChoices.find((choice) => choice.cardId === roleCardId)
      if (!selected?.selectable) throw new Error('The selected role card is unavailable')
    } else if (roleCardId !== undefined) {
      throw new Error('The current action does not accept a role card')
    }
    return this.#accept(
      expectation,
      PlayerActionSchema.parse({
        type: 'night-action',
        matchId: expectation.matchId,
        actorId: expectation.playerId,
        abilityId: AbilityIdSchema.parse(abilityId),
        targetIds: targetPlayerIds.map((target) => PlayerIdSchema.parse(target)),
        ...(roleCardId ? { roleCardId: RoleCardIdSchema.parse(roleCardId) } : {}),
        ...(option ? { option } : {}),
      }),
    )
  }

  public submitSheriffAction(
    token: string,
    action: Extract<PlayerAction, { type: 'sheriff-action' }>['action'],
    targetPlayerId?: string | null,
  ): ActionReceipt {
    const expectation = this.#expectation(token, 'sheriff-action')
    return this.#accept(
      expectation,
      PlayerActionSchema.parse({
        type: 'sheriff-action',
        matchId: expectation.matchId,
        actorId: expectation.playerId,
        action,
        ...(targetPlayerId !== undefined
          ? { targetId: targetPlayerId === null ? null : PlayerIdSchema.parse(targetPlayerId) }
          : {}),
      }),
    )
  }

  public submitSkillTrigger(
    token: string,
    abilityId: string,
    targetPlayerId?: string,
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
        targetId: targetPlayerId === undefined ? null : PlayerIdSchema.parse(targetPlayerId),
      }),
    )
  }

  public submitSkillPass(token: string): ActionReceipt {
    const expectation = this.#expectation(token, 'skill-trigger')
    if (expectation.passAllowed !== true) throw new Error('The current skill cannot be declined')
    const allowed =
      expectation.actionType === 'skill-trigger'
        ? expectation.allowedAbilityIds
        : expectation.interruptAbilityIds
    const abilityId = [...(allowed ?? [])].sort()[0]
    if (!abilityId) throw new Error('No skill is available to decline')
    return this.#accept(
      expectation,
      PlayerActionSchema.parse({
        type: 'skill-trigger',
        matchId: expectation.matchId,
        actorId: expectation.playerId,
        abilityId,
        targetId: null,
        option: 'pass',
      }),
    )
  }

  public submitPostgameReview(token: string, input: PostgameReviewSubmissionInput): ActionReceipt {
    const binding = this.#bindings.get(token)
    if (!binding) throw new Error('Player action token is invalid')
    const key = this.#key(binding.matchId, binding.playerId)
    const expectation = this.#reviewExpectations.get(key)
    if (!expectation) throw new Error('The judge is not waiting for a postgame review')
    if (this.#reviews.has(key)) throw new Error('This player already submitted a postgame review')
    const parsed = PostgameReviewSubmissionInputSchema.parse(input)
    const submission = expectation.validate(parsed)
    expectation.onAccepted?.(submission)
    this.#reviews.set(key, submission)
    return ActionReceiptSchema.parse({
      accepted: true,
      actionId: `action-${randomBytes(8).toString('hex')}`,
      message: promptCore.acceptedReceipt(),
    })
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

  public takePostgameReview(matchId: MatchId, playerId: PlayerId): PostgameReviewSubmission | null {
    const key = this.#key(matchId, playerId)
    const submission = this.#reviews.get(key) ?? null
    this.#reviews.delete(key)
    this.#reviewExpectations.delete(key)
    return submission
  }

  public peekPostgameReview(matchId: MatchId, playerId: PlayerId): PostgameReviewSubmission | null {
    return this.#reviews.get(this.#key(matchId, playerId)) ?? null
  }

  public clearPostgameReview(matchId: MatchId, playerId: PlayerId): void {
    const key = this.#key(matchId, playerId)
    this.#reviews.delete(key)
    this.#reviewExpectations.delete(key)
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
    expectation.validate?.(action)
    this.#actions.set(key, action)
    expectation.onAccepted?.(action)
    return ActionReceiptSchema.parse({
      accepted: true,
      actionId: `action-${randomBytes(8).toString('hex')}`,
      message: promptCore.acceptedReceipt(),
    })
  }

  #key(matchId: MatchId, playerId: PlayerId): string {
    return `${MatchIdSchema.parse(matchId)}:${PlayerIdSchema.parse(playerId)}`
  }
}
