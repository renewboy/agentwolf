import { AcpDeliveryUncertainError } from '@agentwolf/acp'
import { formatCopy, getCopy } from '@agentwolf/assets'
import type { GameEvent, PlayerAction, PlayerId } from '@agentwolf/contracts'
import {
  v1AbilityIds,
  type BoardManifest,
  type GameState,
  type RoleRegistry,
  type TurnDescriptor,
} from '@agentwolf/game-engine'
import type { SpeechCommittedEvent } from './speech-playback-coordinator.js'
import { promptContractVersion } from './context-renderer.js'

export function findCommittedSpeech(events: readonly GameEvent[]): SpeechCommittedEvent | null {
  return (
    events.findLast(
      (candidate): candidate is SpeechCommittedEvent =>
        candidate.payload.type === 'speech.committed',
    ) ?? null
  )
}

export function describeError(error: unknown): string {
  if (error instanceof AggregateError) {
    const details = [...error.errors].map(describeError).join('; ')
    return details ? `${error.message}: ${details}` : error.message
  }
  return error instanceof Error ? error.message : String(error)
}

export function hasUncertainDelivery(error: unknown): boolean {
  if (
    error instanceof AcpDeliveryUncertainError ||
    (error instanceof Error && error.name === 'AcpDeliveryUncertainError')
  ) {
    return true
  }
  if (error instanceof AggregateError) return [...error.errors].some(hasUncertainDelivery)
  return error instanceof Error && error.cause ? hasUncertainDelivery(error.cause) : false
}

export function interruptAbilityExpectation(
  state: GameState,
  playerId: PlayerId,
  turn: Pick<TurnDescriptor, 'interruptAbilityIds'>,
  roles: RoleRegistry,
) {
  const interruptAbilityIds = interruptAbilityIdsFor(state, playerId, turn, roles)
  return interruptAbilityIds.length > 0 ? { interruptAbilityIds } : {}
}

export function interruptAbilityIdsFor(
  state: GameState,
  playerId: PlayerId,
  turn: Pick<TurnDescriptor, 'interruptAbilityIds'>,
  roles: RoleRegistry,
) {
  const player = state.players.get(playerId)
  return player
    ? (turn.interruptAbilityIds ?? []).filter((abilityId) => roles.canUseAbility(player, abilityId))
    : []
}

export async function settleActions(
  promises: readonly Promise<PlayerAction>[],
): Promise<PlayerAction[]> {
  const settled = await Promise.allSettled(promises)
  const errors = settled
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) => result.reason)
  if (errors.length > 0) throw new AggregateError(errors, 'One or more player turns failed')
  return settled
    .filter(
      (result): result is PromiseFulfilledResult<PlayerAction> => result.status === 'fulfilled',
    )
    .map((result) => result.value)
}

export function promptAssetFor(turn: TurnDescriptor, promptVersion = promptContractVersion) {
  switch (turn.actionType) {
    case 'speech':
      return 'speech-turn' as const
    case 'vote':
      return turn.voteKind === 'wolf-kill' ? ('wolf-vote-turn' as const) : ('vote-turn' as const)
    case 'night-action':
      return 'night-turn' as const
    case 'sheriff-action':
      if (promptVersion >= 20 && turn.phaseId === 'phase-sheriff-transfer') {
        return 'sheriff-transfer-turn' as const
      }
      return promptVersion >= 14 && turn.phaseId === 'phase-day-speech-order'
        ? ('speech-order-turn' as const)
        : ('sheriff-turn' as const)
    case 'skill-trigger':
      return 'skill-turn' as const
    default: {
      const exhaustive: never = turn.actionType
      return exhaustive
    }
  }
}

export function actionInstructionFor(
  turn: TurnDescriptor,
  context?: {
    readonly board: BoardManifest
    readonly state: GameState
    readonly playerId: PlayerId
    readonly roles?: RoleRegistry
    readonly speechCharacterLimit?: number
  },
  promptVersion = promptContractVersion,
): string {
  const interruptInstructions = context?.roles
    ? interruptAbilityIdsFor(context.state, context.playerId, turn, context.roles)
        .map((abilityId) => context.roles!.ability(abilityId).ability.interruptInstructionKey)
        .filter((key): key is string => Boolean(key))
        .map((key) => getCopy(key))
    : []
  if (turn.actionType === 'speech') {
    const instructions: string[] = []
    if (promptVersion >= 8) {
      instructions.push(getCopy('promptActions.publicFactsImmutable'))
    }
    if (promptVersion >= 9 && turn.phaseId === 'phase-night-wolf-council') {
      instructions.push(getCopy('promptActions.wolfCouncilSpeech'))
    }
    if (promptVersion >= 3 && turn.speechKind === 'sheriff') {
      instructions.push(getCopy('promptActions.sheriffCampaignPrivacy'))
    }
    if (promptVersion >= 15 && context?.speechCharacterLimit !== undefined) {
      instructions.push(
        formatCopy(getCopy('promptActions.speechCharacterLimit'), {
          count: context.speechCharacterLimit,
        }),
      )
    }
    if (promptVersion >= 6) instructions.push(...interruptInstructions)
    return instructions.join('\n')
  }
  if (
    promptVersion >= 20 &&
    turn.actionType === 'sheriff-action' &&
    turn.phaseId === 'phase-sheriff-transfer' &&
    context
  ) {
    return sheriffTransferInstruction(context.state, context.playerId)
  }
  if (
    promptVersion >= 14 &&
    turn.actionType === 'sheriff-action' &&
    turn.phaseId === 'phase-day-speech-order' &&
    context
  ) {
    const instructions = [daySpeechOrderInstruction(context.state)]
    instructions.push(...interruptInstructions)
    return instructions.join('\n')
  }
  if (
    promptVersion >= 9 &&
    (turn.actionType === 'vote' || turn.actionType === 'sheriff-action') &&
    interruptInstructions.length > 0
  ) {
    return interruptInstructions.join('\n')
  }
  if (promptVersion >= 13 && turn.actionType === 'vote' && turn.voteKind === 'wolf-kill') {
    return getCopy('promptActions.wolfKillVoteOnly')
  }
  if (turn.actionType === 'night-action') {
    if (turn.allowedAbilityIds?.length === 1) {
      return formatCopy(getCopy('promptActions.nightFixedAbility'), {
        abilityId: turn.allowedAbilityIds[0]!,
      })
    }
    const base = getCopy(
      turn.phaseId === 'phase-night-witch'
        ? 'promptActions.nightWitch'
        : 'promptActions.nightGeneric',
    )
    if (promptVersion === 1 || turn.phaseId !== 'phase-night-witch' || !context) return base
    const antidoteAvailable =
      (context.state.players.get(context.playerId)?.roleState.abilityUses[
        v1AbilityIds.witchAntidote
      ] ?? 0) === 0
    const attackedId =
      promptVersion >= 11 && !antidoteAvailable ? null : context.state.nightAttackTargetId
    const blockedSelfSave =
      attackedId === context.playerId && context.board.policies.witchSelfSave === 'never'
    const currentConstraint =
      promptVersion >= 11 && !antidoteAvailable
        ? getCopy('promptActions.nightWitchAntidoteUnavailable')
        : blockedSelfSave
          ? formatCopy(getCopy('promptActions.nightWitchSelfSaveBlocked'), {
              playerId: context.playerId,
            })
          : attackedId
            ? formatCopy(getCopy('promptActions.nightWitchTarget'), { playerId: attackedId })
            : getCopy('promptActions.nightWitchNoTarget')
    return `${base}\n${currentConstraint}\n${getCopy('promptActions.nightWitchLimit')}`
  }
  if (turn.actionType === 'skill-trigger') {
    return turn.allowedAbilityIds?.length
      ? formatCopy(getCopy('promptActions.skillAbilities'), {
          abilityIds: turn.allowedAbilityIds.map((id) => `\`${id}\``).join(' / '),
        })
      : getCopy('promptActions.skillGeneric')
  }
  return ''
}

function sheriffTransferInstruction(state: GameState, playerId: PlayerId): string {
  const targets = [...state.players.values()]
    .filter((player) => player.alive && player.id !== playerId)
    .sort((left, right) => left.seat - right.seat)
    .map((player) => `\`${player.id}\``)
    .join(' / ')
  return formatCopy(getCopy('promptActions.sheriffTransferTargets'), {
    playerIds: targets || getCopy('common.none'),
  })
}

function daySpeechOrderInstruction(state: GameState): string {
  const deaths = [...state.recentDeaths.keys()].sort(
    (left, right) =>
      (state.players.get(left)?.seat ?? Number.MAX_SAFE_INTEGER) -
      (state.players.get(right)?.seat ?? Number.MAX_SAFE_INTEGER),
  )
  if (deaths.length === 1) {
    const player = state.players.get(deaths[0]!)
    if (!player) throw new Error(`Unknown speech-order death ${deaths[0]}`)
    return formatCopy(getCopy('promptActions.daySpeechOrderSingleDeath'), {
      player: formatCopy(getCopy('narration.playerLabel'), {
        seat: player.seat,
        name: player.name,
      }),
    })
  }
  return deaths.length === 0
    ? getCopy('promptActions.daySpeechOrderPeacefulNight')
    : formatCopy(getCopy('promptActions.daySpeechOrderMultipleDeaths'), {
        count: deaths.length,
      })
}

export async function mapWithConcurrency<Value>(
  values: readonly Value[],
  concurrency: number,
  operation: (value: Value) => Promise<void>,
): Promise<void> {
  const errors: unknown[] = []
  let cursor = 0
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), values.length) },
    async () => {
      for (;;) {
        const index = cursor++
        if (index >= values.length) return
        try {
          await operation(values[index]!)
        } catch (error) {
          errors.push(error)
        }
      }
    },
  )
  await Promise.all(workers)
  if (errors.length > 0) throw new AggregateError(errors, 'One or more player sessions failed')
}
